import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import {
	REASON_DESCRIPTIONS,
	REASON_LABELS,
	type ReasonCode,
} from "@/constants/reason-codes";
import {
	REPORT_STATUS_LABELS,
	type ReportStatus,
} from "@/constants/report-statuses";
import {
	RISK_SCORE_BANDS,
	RISK_STATUS_DESCRIPTIONS,
	RISK_STATUS_LABELS,
	riskStatusForScore,
} from "@/constants/risk-statuses";
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

export interface PullRequestAnalysisCommentInput {
	causes: string[];
	confidence: number;
	fileCount: number;
	headSha?: null | string;
	installationId?: null | number;
	issueNumber?: null | number;
	rationale: string;
	reasonCode: ReasonCode;
	repositoryFullName?: null | string;
	verdict: "likely_abuse" | "not_enough_evidence" | "unclear";
}

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

const scoreBandMarkdown = () =>
	RISK_SCORE_BANDS.map(
		(band) =>
			`- ${band.min}-${band.max}: ${RISK_STATUS_LABELS[band.status]} - ${RISK_STATUS_DESCRIPTIONS[band.status]}`
	).join("\n");

const causeList = (causes: string[]) => {
	if (causes.length === 0) {
		return "- No specific cause was extracted; use the rationale and changed files as context.";
	}
	return causes.map((cause) => `- ${cause}`).join("\n");
};

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

const acknowledgementBody = (input: ReportAcknowledgementInput) => {
	const marker = `<!-- oss-protector:report:${input.sourceCommentId} -->`;
	return `${marker}
OSS Protector captured this maintainer report as a review signal.

| Field | Value |
| --- | --- |
| Target | \`${input.targetLogin}\` |
| Reason | ${REASON_LABELS[input.reasonCode]} |
| Status | ${REPORT_STATUS_LABELS[input.status]} |
| Abuse confidence | ${input.confidence}% |
| AI verdict | \`${input.verdict ?? "not_run"}\` |

${statusDescription(input.status)}

Reason context: ${REASON_DESCRIPTIONS[input.reasonCode]}

Maintainer commands like \`@oss-protector review this user\`, \`@oss-protector flag this user\`, or \`@oss-protector ban this user\` are counted as review signals. Validated maintainer reviews also contribute to the Protectors leaderboard.

This is not a final accusation or an automatic block. Treat it as shared context for maintainer review. OSS Protector also reviews new pull requests automatically and posts an assessment when the app receives PR events.`;
};

const assessmentSummary = (
	verdict: PullRequestAnalysisCommentInput["verdict"]
) => {
	if (verdict === "likely_abuse") {
		return "Flagged for maintainer review.";
	}
	if (verdict === "unclear") {
		return "Needs maintainer review.";
	}
	return "No clear OSS abuse pattern found.";
};

const analysisMarker = (headSha?: null | string) =>
	`<!-- oss-protector:auto-review:${headSha ?? "unknown"} -->`;

const pullRequestAnalysisBody = (input: PullRequestAnalysisCommentInput) => {
	const marker = analysisMarker(input.headSha);
	const riskStatus = riskStatusForScore({
		isAllowed: false,
		score: input.confidence,
	});
	return `${marker}
OSS Protector PR assessment: ${assessmentSummary(input.verdict)}

| Field | Value |
| --- | --- |
| Verdict | \`${input.verdict}\` |
| Review status | ${RISK_STATUS_LABELS[riskStatus]} |
| Risk score | ${input.confidence}/100 |
| Reason | ${REASON_LABELS[input.reasonCode]} |
| Files reviewed | ${input.fileCount} |

${input.rationale}

Why this was flagged:
${causeList(input.causes)}

Reason context: ${REASON_DESCRIPTIONS[input.reasonCode]}

Score guide:
${scoreBandMarkdown()}

This comment is a review aid, not a final judgment. Maintainers should inspect the diff, account history, and repository context before taking action.`;
};

const parseRepositoryFullName = (repositoryFullName?: null | string) => {
	const [owner, repo] = repositoryFullName?.split("/") ?? [];
	if (!(owner && repo)) {
		return null;
	}
	return { owner, repo };
};

export const createPullRequestAnalysisComment = async (
	input: PullRequestAnalysisCommentInput
) => {
	if (!(input.issueNumber && input.repositoryFullName)) {
		return { skipped: true };
	}

	const repository = parseRepositoryFullName(input.repositoryFullName);
	if (!repository) {
		return { skipped: true };
	}

	const octokit = await createInstallationClient({
		installationId: input.installationId,
	});
	if (!octokit) {
		return { skipped: true };
	}

	const marker = analysisMarker(input.headSha);
	const existingComments = await octokit.rest.issues.listComments({
		issue_number: input.issueNumber,
		owner: repository.owner,
		per_page: 100,
		repo: repository.repo,
	});
	if (existingComments.data.some((comment) => comment.body?.includes(marker))) {
		return { skipped: true };
	}

	await octokit.rest.issues.createComment({
		body: pullRequestAnalysisBody(input),
		issue_number: input.issueNumber,
		owner: repository.owner,
		repo: repository.repo,
	});

	return { skipped: false };
};

export const createReportAcknowledgementComment = async (
	input: ReportAcknowledgementInput
) => {
	if (
		!(
			input.installationId &&
			input.issueNumber &&
			input.repositoryFullName &&
			input.sourceCommentId
		)
	) {
		return { skipped: true };
	}

	const repository = parseRepositoryFullName(input.repositoryFullName);
	if (!repository) {
		return { skipped: true };
	}

	const octokit = await createInstallationClient({
		installationId: input.installationId,
	});
	if (!octokit) {
		return { skipped: true };
	}

	const marker = `<!-- oss-protector:report:${input.sourceCommentId} -->`;
	const legacyMarker = `<!-- clankers-list:report:${input.sourceCommentId} -->`;
	const legacyGuardMarker = `<!-- oss-guard:report:${input.sourceCommentId} -->`;
	const existingComments = await octokit.rest.issues.listComments({
		issue_number: input.issueNumber,
		owner: repository.owner,
		per_page: 100,
		repo: repository.repo,
	});
	if (
		existingComments.data.some(
			(comment) =>
				comment.body?.includes(marker) ||
				comment.body?.includes(legacyMarker) ||
				comment.body?.includes(legacyGuardMarker)
		)
	) {
		return { skipped: true };
	}

	await octokit.rest.issues.createComment({
		body: acknowledgementBody(input),
		issue_number: input.issueNumber,
		owner: repository.owner,
		repo: repository.repo,
	});

	return { skipped: false };
};
