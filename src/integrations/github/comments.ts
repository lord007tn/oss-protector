import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { REASON_LABELS, type ReasonCode } from "@/constants/reason-codes";
import {
	REPORT_STATUS_LABELS,
	type ReportStatus,
} from "@/constants/report-statuses";
import { runtimeEnv } from "@/env";

export interface ReportAcknowledgementInput {
	confidence: number;
	installationId?: null | number;
	issueNumber?: null | number;
	reasonCode: ReasonCode;
	repositoryFullName?: null | string;
	sourceCommentId?: null | number | string;
	status: ReportStatus;
	targetLogin: string;
	verdict?: null | string;
}

const encodeLength = (length: number) => {
	if (length < 128) {
		return [length];
	}
	const bytes: number[] = [];
	let remaining = length;
	while (remaining > 0) {
		bytes.unshift(remaining & 0xff);
		remaining >>= 8;
	}
	return [0x80 | bytes.length, ...bytes];
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
			.replace(/\s+/g, ""),
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

const statusDescription = (status: ReportStatus) => {
	if (status === "validated") {
		return "This report has enough signal to affect the shared score.";
	}
	if (status === "needs_review") {
		return "This report was captured and needs more corroborating signal.";
	}
	if (status === "dismissed") {
		return "This report was captured but did not have enough evidence.";
	}
	return "This report was captured and is waiting for more signal.";
};

const acknowledgementBody = (input: ReportAcknowledgementInput) => {
	const marker = `<!-- clankers-list:report:${input.sourceCommentId} -->`;
	return `${marker}
Clankers List captured this report.

| Field | Value |
| --- | --- |
| Target | \`${input.targetLogin}\` |
| Reason | ${REASON_LABELS[input.reasonCode]} |
| Status | ${REPORT_STATUS_LABELS[input.status]} |
| Abuse confidence | ${input.confidence}% |
| AI verdict | \`${input.verdict ?? "not_run"}\` |

${statusDescription(input.status)}

Use \`/clankers report bot reason: fake bounty\` or \`@clankers-list[bot] report bot reason: fake bounty\` for GitHub-highlighted bot commands.`;
};

export const createReportAcknowledgementComment = async (
	input: ReportAcknowledgementInput,
) => {
	const appId = runtimeEnv().GITHUB_APP_ID;
	const key = privateKey();
	if (
		!appId ||
		!key ||
		!input.installationId ||
		!input.issueNumber ||
		!input.repositoryFullName ||
		!input.sourceCommentId
	) {
		return { skipped: true };
	}

	const [owner, repo] = input.repositoryFullName.split("/");
	if (!owner || !repo) {
		return { skipped: true };
	}

	const auth = createAppAuth({
		appId,
		installationId: input.installationId,
		privateKey: key,
	});
	const authentication = await auth({ type: "installation" });
	const octokit = new Octokit({
		auth: authentication.token,
		userAgent: "clankers-list",
	});
	const marker = `<!-- clankers-list:report:${input.sourceCommentId} -->`;
	const existingComments = await octokit.rest.issues.listComments({
		issue_number: input.issueNumber,
		owner,
		per_page: 100,
		repo,
	});
	if (existingComments.data.some((comment) => comment.body?.includes(marker))) {
		return { skipped: true };
	}

	await octokit.rest.issues.createComment({
		body: acknowledgementBody(input),
		issue_number: input.issueNumber,
		owner,
		repo,
	});

	return { skipped: false };
};
