// AES-256-GCM symmetric encryption keyed off BETTER_AUTH_SECRET via HKDF.
// Used to encrypt user-supplied secrets (OpenRouter BYOK keys) before storing
// them in D1. Web Crypto is available in Workers + modern Node so no
// third-party crypto dependency is needed.
//
// Envelope format (base64url, single string): version (1 byte) | salt (16) |
// iv (12) | ciphertext+tag. Version 1 = AES-256-GCM with HKDF-SHA256.

const VERSION_BYTE = 0x01;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_LENGTH_BITS = 256;
const KEY_INFO = "oss-protector-byok-v1";

const BASE64URL_DASH = /-/g;
const BASE64URL_UNDERSCORE = /_/g;
const BASE64_PLUS = /\+/g;
const BASE64_SLASH = /\//g;
const BASE64_TRAILING_EQUALS = /=+$/;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// WebCrypto type signatures in TS6 require `ArrayBufferView<ArrayBuffer>` and
// reject the looser `Uint8Array<ArrayBufferLike>` that TextEncoder.encode and
// crypto.getRandomValues return. Wrapping the bytes in a fresh ArrayBuffer-
// backed view satisfies the type system without changing runtime behavior.
const asBuffer = (bytes: Uint8Array): Uint8Array<ArrayBuffer> => {
	const buf = new ArrayBuffer(bytes.byteLength);
	const view = new Uint8Array(buf);
	view.set(bytes);
	return view;
};

const randomBytes = (length: number): Uint8Array<ArrayBuffer> => {
	const buf = new ArrayBuffer(length);
	const view = new Uint8Array(buf);
	crypto.getRandomValues(view);
	return view;
};

const encode = (value: string): Uint8Array<ArrayBuffer> =>
	asBuffer(textEncoder.encode(value));

const fromBase64Url = (value: string): Uint8Array<ArrayBuffer> => {
	const padded = value
		.replace(BASE64URL_DASH, "+")
		.replace(BASE64URL_UNDERSCORE, "/");
	const padding =
		padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
	const binary = atob(padded + padding);
	const buf = new ArrayBuffer(binary.length);
	const view = new Uint8Array(buf);
	for (const [index, ch] of [...binary].entries()) {
		view[index] = ch.charCodeAt(0);
	}
	return view;
};

const toBase64Url = (bytes: Uint8Array): string => {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary)
		.replace(BASE64_PLUS, "-")
		.replace(BASE64_SLASH, "_")
		.replace(BASE64_TRAILING_EQUALS, "");
};

const importMasterKey = (secret: string): Promise<CryptoKey> => {
	if (!secret) {
		throw new Error(
			"BETTER_AUTH_SECRET is not configured; cannot encrypt user secrets."
		);
	}
	return crypto.subtle.importKey("raw", encode(secret), "HKDF", false, [
		"deriveKey",
	]);
};

const deriveAesKey = async (
	master: CryptoKey,
	salt: Uint8Array<ArrayBuffer>
): Promise<CryptoKey> =>
	crypto.subtle.deriveKey(
		{
			hash: "SHA-256",
			info: encode(KEY_INFO),
			name: "HKDF",
			salt,
		},
		master,
		{ length: KEY_LENGTH_BITS, name: "AES-GCM" },
		false,
		["encrypt", "decrypt"]
	);

export async function encryptSecret(
	plaintext: string,
	masterSecret: string
): Promise<string> {
	const master = await importMasterKey(masterSecret);
	const salt = randomBytes(SALT_LENGTH);
	const iv = randomBytes(IV_LENGTH);
	const key = await deriveAesKey(master, salt);
	const ciphertext = new Uint8Array(
		await crypto.subtle.encrypt({ iv, name: "AES-GCM" }, key, encode(plaintext))
	);
	const envelope = new Uint8Array(
		1 + salt.length + iv.length + ciphertext.length
	);
	envelope[0] = VERSION_BYTE;
	envelope.set(salt, 1);
	envelope.set(iv, 1 + salt.length);
	envelope.set(ciphertext, 1 + salt.length + iv.length);
	return toBase64Url(envelope);
}

export async function decryptSecret(
	envelope: string,
	masterSecret: string
): Promise<string> {
	const bytes = fromBase64Url(envelope);
	if (bytes.length < 1 + SALT_LENGTH + IV_LENGTH + 16) {
		throw new Error("Encrypted envelope is truncated.");
	}
	if (bytes[0] !== VERSION_BYTE) {
		throw new Error(`Unsupported encryption envelope version: ${bytes[0]}.`);
	}
	const salt = asBuffer(bytes.slice(1, 1 + SALT_LENGTH));
	const iv = asBuffer(
		bytes.slice(1 + SALT_LENGTH, 1 + SALT_LENGTH + IV_LENGTH)
	);
	const ciphertext = asBuffer(bytes.slice(1 + SALT_LENGTH + IV_LENGTH));
	const master = await importMasterKey(masterSecret);
	const key = await deriveAesKey(master, salt);
	const plaintext = await crypto.subtle.decrypt(
		{ iv, name: "AES-GCM" },
		key,
		ciphertext
	);
	return textDecoder.decode(plaintext);
}

// Returns "sk-or-...••••XXXX" given a plaintext key. Used for UI display so the
// stored key never round-trips through the client after the initial save.
export function redactSecret(plaintext: string): string {
	const trimmed = plaintext.trim();
	if (trimmed.length <= 8) {
		return "•".repeat(Math.max(4, trimmed.length));
	}
	const head = trimmed.slice(0, 6);
	const tail = trimmed.slice(-4);
	return `${head}••••${tail}`;
}
