/**
 * Pure, deterministic account-level heuristics for the scoring engine. No I/O —
 * these run on already-collected GitHub profile fields so the math can be
 * unit-tested directly and reused by both live analysis and the backfill.
 *
 * These are weak corroborators by design: they nudge a score that already has
 * evidence, never accuse on their own.
 */

// Handle patterns common to throwaway / automation accounts, matched against
// the lowercased GitHub login.
const BOT_HANDLE_PATTERNS: RegExp[] = [
	/^ai[-_]?(?:helper|assistant|bot|dev|coder)/,
	/(?:^|[-_])bot(?:[-_]?\d+)?$/,
	/^(?:gpt|chatgpt|claude|gemini|llama|copilot)[-_]/,
	/^(?:fix|patch|update|auto)[-_]?(?:typo|bot|pr|commit)/,
	/^(?:code|pr|commit)[-_]?(?:helper|bot|fixer)[-_]?\d*$/,
	/[-_](?:automation|automated)[-_]?\d*$/,
	/^[a-z]+\d{5,}$/, // a word followed by a long digit run (generated handles)
];

// Phrases in a bio that self-identify automation or farming intent.
const BOT_BIO_PHRASES = [
	"ai assistant",
	"ai-powered",
	"autonomous agent",
	"contribution farmer",
	"open source bot",
	"automated contributions",
	"i am a bot",
	"powered by gpt",
	"powered by ai",
	"llm agent",
] as const;

export const handleMatchesBotPattern = (login: string): boolean => {
	const handle = login.trim().toLowerCase();
	return BOT_HANDLE_PATTERNS.some((pattern) => pattern.test(handle));
};

const SUSPICIOUS_HANDLE_MIN_LENGTH = 9;
const SUSPICIOUS_HANDLE_MIN_ENTROPY = 0.92;
const SUSPICIOUS_HANDLE_MAX_VOWEL_RATIO = 0.15;
const DIGIT_PATTERN = /\d/;
const LETTERS_PATTERN = /[^a-z]/g;
const VOWEL_PATTERN = /[aeiou]/g;

// A long, digit-bearing, high-entropy handle with almost no vowels reads as
// machine-generated (e.g. "x7k9p2mq3" — but not "johnsmith2024", which has a
// normal vowel distribution). Weak and noisy on its own, so it's only ever used
// as a gated corroborator, never as a standalone signal.
export const handleEntropyIsSuspicious = (login: string): boolean => {
	const handle = login.trim().toLowerCase();
	if (
		handle.length < SUSPICIOUS_HANDLE_MIN_LENGTH ||
		!DIGIT_PATTERN.test(handle)
	) {
		return false;
	}
	const letters = handle.replace(LETTERS_PATTERN, "");
	if (letters.length === 0) {
		return false;
	}
	const vowelRatio =
		(handle.match(VOWEL_PATTERN) ?? []).length / letters.length;
	return (
		vowelRatio <= SUSPICIOUS_HANDLE_MAX_VOWEL_RATIO &&
		normalizedEntropy(handle) >= SUSPICIOUS_HANDLE_MIN_ENTROPY
	);
};

export const bioMatchesBotPattern = (
	bio: null | string | undefined
): boolean => {
	if (!bio) {
		return false;
	}
	const text = bio.toLowerCase();
	return BOT_BIO_PHRASES.some((phrase) => text.includes(phrase));
};

// Normalized Shannon entropy (0..1) over a string's character distribution,
// scaled by the size of the alphabet actually present. Low values flag
// repetitive/templated text; used only as a weak corroborating signal.
export const normalizedEntropy = (text: string): number => {
	const clean = text.trim();
	if (clean.length <= 1) {
		return 0;
	}
	const counts = new Map<string, number>();
	for (const char of clean) {
		counts.set(char, (counts.get(char) ?? 0) + 1);
	}
	const maxEntropy = Math.log2(counts.size);
	if (maxEntropy === 0) {
		return 0;
	}
	let entropy = 0;
	for (const count of counts.values()) {
		const probability = count / clean.length;
		entropy -= probability * Math.log2(probability);
	}
	return Math.max(0, Math.min(1, entropy / maxEntropy));
};
