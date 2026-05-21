import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { runtimeEnv } from "@/env";

const encodeLength = (length: number) => {
	if (length < 128) {
		return [length];
	}
	const bytes: number[] = [];
	let remaining = length;
	while (remaining > 0) {
		bytes.unshift(remaining % 256);
		remaining = Math.floor(remaining / 256);
	}
	return [128 + bytes.length, ...bytes];
};

const derSequence = (bytes: number[]) => [
	0x30,
	...encodeLength(bytes.length),
	...bytes,
];

const derOctetString = (bytes: number[]) => [
	0x04,
	...encodeLength(bytes.length),
	...bytes,
];

const base64ToBytes = (value: string) =>
	[...atob(value)].map((character) => character.charCodeAt(0));

const bytesToBase64 = (bytes: number[]) =>
	btoa(String.fromCharCode(...bytes))
		.replace(/(.{64})/g, "$1\n")
		.trim();

const normalizePrivateKey = (value: string) => {
	const key = value.replace(/\\n/g, "\n").trim();
	if (!key.includes("BEGIN RSA PRIVATE KEY")) {
		return key;
	}

	const pkcs1Bytes = base64ToBytes(
		key
			.replace(/-----BEGIN RSA PRIVATE KEY-----/g, "")
			.replace(/-----END RSA PRIVATE KEY-----/g, "")
			.replace(/\s+/g, "")
	);
	const rsaEncryptionAlgorithmIdentifier = derSequence([
		0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05,
		0x00,
	]);
	const pkcs8Bytes = derSequence([
		0x02,
		0x01,
		0x00,
		...rsaEncryptionAlgorithmIdentifier,
		...derOctetString(pkcs1Bytes),
	]);

	return `-----BEGIN PRIVATE KEY-----\n${bytesToBase64(pkcs8Bytes)}\n-----END PRIVATE KEY-----`;
};

const privateKey = () => {
	const key = runtimeEnv().GITHUB_APP_PRIVATE_KEY;
	return key ? normalizePrivateKey(key) : undefined;
};

// Authenticate as the GitHub App installation so we can read PR diffs and the
// per-repo policy file. We only ever read — the app posts no comments or
// check runs; flags are surfaced in-app via notifications instead.
export const createInstallationClient = async ({
	installationId,
}: {
	installationId?: null | number;
}) => {
	const appId = runtimeEnv().GITHUB_APP_ID;
	const key = privateKey();
	if (!(appId && key && installationId)) {
		return null;
	}

	const auth = createAppAuth({
		appId,
		installationId,
		privateKey: key,
	});
	const authentication = await auth({ type: "installation" });
	return new Octokit({
		auth: authentication.token,
		userAgent: "oss-protector",
	});
};
