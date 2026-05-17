import type { ReasonCode } from "@/constants/reason-codes";
import { runtimeEnv } from "@/env";

export interface GithubUserPayload {
	avatar_url?: null | string;
	html_url?: null | string;
	id: number;
	login: string;
	type?: null | string;
}

export interface GithubRepositoryPayload {
	default_branch?: null | string;
	full_name: string;
	html_url?: null | string;
	id: number;
	name: string;
	owner?: GithubUserPayload;
	private?: boolean;
}

export interface GithubPullRequestPayload {
	additions?: null | number;
	author_association?: null | string;
	base?: { ref?: null | string };
	body?: null | string;
	changed_files?: null | number;
	closed_at?: null | string;
	commits?: null | number;
	deletions?: null | number;
	head?: { sha?: null | string };
	html_url: string;
	id: number;
	merged_at?: null | string;
	number: number;
	state: string;
	title: string;
	user: GithubUserPayload;
}

export interface PullRequestFileSummary {
	additions: number;
	changes: number;
	deletions: number;
	filename: string;
	patch?: string;
	status: string;
}

export interface GithubWebhookPayload {
	action?: string;
	comment?: {
		author_association?: string;
		body?: string;
		html_url?: string;
		id?: number;
		user?: GithubUserPayload;
	};
	installation?: {
		account?: GithubUserPayload;
		id: number;
		repository_selection?: string;
		suspended_at?: null | string;
		target_type?: string;
	};
	issue?: {
		html_url?: string;
		number?: number;
		pull_request?: { html_url?: string; url?: string };
		title?: string;
		user?: GithubUserPayload;
	};
	pull_request?: GithubPullRequestPayload;
	repositories?: GithubRepositoryPayload[];
	repositories_added?: GithubRepositoryPayload[];
	repositories_removed?: GithubRepositoryPayload[];
	repository?: GithubRepositoryPayload;
	sender?: GithubUserPayload;
}

export interface GithubWebhookRequest {
	body: string;
	deliveryId?: null | string;
	eventName: string;
	signature?: null | string;
	skipSignatureVerification?: boolean;
}

const textEncoder = new TextEncoder();
const COMMAND_PATTERN =
	/(?:^|\n)\s*(?:@(?:clankers-list(?:\[bot\])?|oss-guard(?:\[bot\])?|oss-protector(?:\[bot\])?|ossguard|ossprotector|botguard|this-product)(?=\s|:|,|\.|$)|\/(?:clankers|ossguard|oss-guard|ossprotector|oss-protector|botguard)(?=\s|$))(?<command>.*)/is;
const COMMAND_KEYWORD_PATTERN =
	/(abuse|ai|ban|block|bot|bounty|credential|duplicate|fake|flag|impersonat|malicious|phishing|report|review|spam|watch)/i;
const CORRECTION_DISMISS_PATTERN =
	/\b(dismiss|clear|false positive|not abuse|all good|ignore this|drop this|legit|legitimate)\b/i;
const CORRECTION_CONFIRM_PATTERN =
	/\b(confirm|validate|verified|approve report|yes abuse)\b/i;
const CORRECTION_ALLOW_PATTERN =
	/\b(allow|allowlist|whitelist|trust this user|safe forever)\b/i;
const CORRECTION_RESET_PATTERN =
	/\b(reset|unallow|undo allow|remove allowlist|reconsider|re-evaluate|reevaluate)\b/i;
// Matches a stray `@someoneelse` mention in a correction body (other than the
// bot itself). Used to honestly acknowledge that cross-target syntax isn't
// implemented — we always operate on the PR author.
const CROSS_TARGET_PATTERN =
	/@(?!(?:oss-protector|clankers-list|oss-guard|ossguard|ossprotector)(?:\[bot\])?\b)([a-z0-9](?:-?[a-z0-9]){0,38})\b/i;

const toHex = (buffer: ArrayBuffer) =>
	[...new Uint8Array(buffer)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");

const constantTimeEqual = (left: string, right: string) => {
	if (left.length !== right.length) {
		return false;
	}
	let isEqual = true;
	for (let index = 0; index < left.length; index += 1) {
		if (left.charCodeAt(index) !== right.charCodeAt(index)) {
			isEqual = false;
		}
	}
	return isEqual;
};

export const verifyGithubSignature = async ({
	body,
	signature,
}: {
	body: string;
	signature?: null | string;
}) => {
	const secret = runtimeEnv().GITHUB_WEBHOOK_SECRET;
	if (!secret) {
		const appUrl = runtimeEnv().VITE_APP_URL ?? "";
		return (
			runtimeEnv().ALLOW_UNSIGNED_GITHUB_WEBHOOKS === "true" ||
			appUrl.includes("localhost") ||
			appUrl.includes("127.0.0.1")
		);
	}
	if (!signature?.startsWith("sha256=")) {
		return false;
	}
	const key = await crypto.subtle.importKey(
		"raw",
		textEncoder.encode(secret),
		{ hash: "SHA-256", name: "HMAC" },
		false,
		["sign"]
	);
	const digest = await crypto.subtle.sign(
		"HMAC",
		key,
		textEncoder.encode(body)
	);
	return constantTimeEqual(`sha256=${toHex(digest)}`, signature);
};

const matchAppMention = (body: string) => {
	const match = body.match(COMMAND_PATTERN);
	return match?.groups?.command?.trim() ?? null;
};

export const parseCommand = (body: string) => {
	const command = matchAppMention(body);
	if (!command) {
		return null;
	}
	if (!COMMAND_KEYWORD_PATTERN.test(command)) {
		return null;
	}
	return command || body.trim();
};

export type CorrectionKind = "allow" | "confirm" | "dismiss" | "reset";

export interface CorrectionCommand {
	command: string;
	// If the command body mentions `@otheruser`, we capture it for an
	// honest ack. Cross-targeting isn't implemented — we still act on the
	// PR author — but silently mis-targeting is worse than telling the user.
	crossTargetMention: string | null;
	kind: CorrectionKind;
}

const detectCrossTargetMention = (command: string): string | null => {
	const match = command.match(CROSS_TARGET_PATTERN);
	return match?.[1] ?? null;
};

export const parseCorrectionCommand = (
	body: string
): CorrectionCommand | null => {
	const command = matchAppMention(body);
	if (!command) {
		return null;
	}
	const crossTargetMention = detectCrossTargetMention(command);
	// Reset checked first so a stray "reset" keyword wins over "allow".
	if (CORRECTION_RESET_PATTERN.test(command)) {
		return { command, crossTargetMention, kind: "reset" };
	}
	if (CORRECTION_DISMISS_PATTERN.test(command)) {
		return { command, crossTargetMention, kind: "dismiss" };
	}
	if (CORRECTION_CONFIRM_PATTERN.test(command)) {
		return { command, crossTargetMention, kind: "confirm" };
	}
	if (CORRECTION_ALLOW_PATTERN.test(command)) {
		return { command, crossTargetMention, kind: "allow" };
	}
	return null;
};

export const inferReasonCode = (command: string): ReasonCode => {
	const normalized = command.toLowerCase();
	if (normalized.includes("bounty")) {
		return "fake_bounty";
	}
	if (normalized.includes("duplicate")) {
		return "duplicate_pr";
	}
	if (normalized.includes("phish") || normalized.includes("credential")) {
		return "credential_phishing";
	}
	if (normalized.includes("malicious") || normalized.includes("backdoor")) {
		return "malicious_code";
	}
	if (normalized.includes("imperson")) {
		return "impersonation";
	}
	if (normalized.includes("ai slope") || normalized.includes("ai slop")) {
		return "ai_slope";
	}
	if (normalized.includes("ai") || normalized.includes("low quality")) {
		return "low_quality_ai";
	}
	if (normalized.includes("spam")) {
		return "spam_pr";
	}
	return "maintainer_report";
};

export const isMaintainerAssociation = (association?: string) =>
	association === "OWNER" ||
	association === "MEMBER" ||
	association === "COLLABORATOR";

const LEGACY_BOT_LOGINS = new Set([
	"clankers-list[bot]",
	"oss-guard[bot]",
	"oss-protector[bot]",
	"ossguard[bot]",
	"ossprotector[bot]",
]);

const ownBotLogins = () => {
	const slug = runtimeEnv().GITHUB_APP_SLUG;
	const known = new Set(LEGACY_BOT_LOGINS);
	if (slug) {
		known.add(`${slug}[bot]`);
	}
	return known;
};

export const isOwnBotUser = (user?: GithubUserPayload) => {
	if (!user?.login) {
		return false;
	}
	return ownBotLogins().has(user.login);
};

export const parseRepositoryFullName = (repositoryFullName: string) => {
	const [owner, repo] = repositoryFullName.split("/");
	if (!(owner && repo)) {
		return null;
	}
	return { owner, repo };
};
