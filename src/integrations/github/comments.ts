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
	evidenceSummary?: null | string;
	installationId?: null | number;
	issueNumber?: null | number;
	reasonCode: ReasonCode;
	repositoryFullName?: null | string;
	scoreBreakdown?: null | ScoreBreakdown;
	sourceCommentId?: null | number | string;
	status: ReportStatus;
	targetLogin: string;
	verdict?: null | string;
}

export interface CorrectionAcknowledgementInput {
	correctedByLogin: string;
	installationId?: null | number;
	issueNumber?: null | number;
	kind: "allow" | "confirm" | "dismiss";
	note?: null | string;
	repositoryFullName?: null | string;
	sourceCommentId?: null | number | string;
	targetLogin: string;
}

export interface PullRequestAnalysisCommentInput {
	causes: string[];
	confidence: number;
	evidenceSummary?: null | string;
	fileCount: number;
	headSha?: null | string;
	installationId?: null | number;
	issueNumber?: null | number;
	rationale: string;
	reasonCode: ReasonCode;
	repositoryFullName?: null | string;
	scoreBreakdown?: null | ScoreBreakdown;
	verdict: "likely_abuse" | "not_enough_evidence" | "unclear";
}

interface ScoreBreakdown {
	aiQuality: number;
	contributionValue: number;
	credentialRisk: number;
	farmingRisk: number;
	maliciousRisk: number;
	novelty: number;
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
		return "This report has enough corroborated signal to affect the shared score.";
	}
	if (status === "needs_review") {
		return "This report was captured as a review signal and needs more corroborating evidence before it affects shared score.";
	}
	if (status === "dismissed") {
		return "This report was captured but did not have enough evidence.";
	}
	return "This report was submitted as a review signal and is waiting for validation.";
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

const tableValue = (value: string) => value.replace(/\|/g, "\\|");

const scoreBreakdownMarkdown = (scoreBreakdown?: null | ScoreBreakdown) => {
	if (!scoreBreakdown) {
		return "Not available; fallback score only.";
	}
	return `| Dimension | Score |
| --- | ---: |
| Malicious code risk | ${scoreBreakdown.maliciousRisk}/100 |
| Credential risk | ${scoreBreakdown.credentialRisk}/100 |
| Farming risk | ${scoreBreakdown.farmingRisk}/100 |
| AI or low-quality risk | ${scoreBreakdown.aiQuality}/100 |
| Contribution value | ${scoreBreakdown.contributionValue}/100 |
| Novelty | ${scoreBreakdown.novelty}/100 |`;
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

Evidence summary: ${tableValue(input.evidenceSummary ?? "No separate evidence summary was returned.")}

Scoring breakdown:
${scoreBreakdownMarkdown(input.scoreBreakdown)}

Reason context: ${REASON_DESCRIPTIONS[input.reasonCode]}

Maintainer commands like \`@oss-protector review this user\`, \`@oss-protector flag this user reason: fake bounty\`, or \`@oss-protector recommend block reason: malicious code\` are captured as review signals. Only validated or independently corroborated reports affect shared scores.

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

Evidence summary: ${tableValue(input.evidenceSummary ?? input.rationale)}

Scoring breakdown:
${scoreBreakdownMarkdown(input.scoreBreakdown)}

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

const CORRECTION_LABELS: Record<
	CorrectionAcknowledgementInput["kind"],
	{ effect: string; explanation: string; verb: string }
> = {
	allow: {
		effect: "Allowlisted",
		explanation:
			"Future reports for this account will not affect the shared score until the allowlist is removed.",
		verb: "allowed",
	},
	confirm: {
		effect: "Validated",
		explanation:
			"The latest open report is promoted to validated and contributes to the shared score.",
		verb: "confirmed",
	},
	dismiss: {
		effect: "Dismissed",
		explanation:
			"All open and validated reports on this account were dismissed and a negative correction signal was recorded.",
		verb: "dismissed",
	},
};

const correctionAcknowledgementBody = (
	input: CorrectionAcknowledgementInput
) => {
	const label = CORRECTION_LABELS[input.kind];
	const marker = `<!-- oss-protector:correction:${input.sourceCommentId ?? "unknown"} -->`;
	const note = input.note
		? `\n\nMaintainer note: ${tableValue(input.note)}`
		: "";
	return `${marker}
OSS Protector correction applied by maintainer @${input.correctedByLogin}.

| Field | Value |
| --- | --- |
| Action | \`${input.kind}\` |
| Target | @${input.targetLogin} |
| Effect | ${label.effect} |

${label.explanation}${note}

If this was sent in error, the maintainer can run \`@oss-protector confirm\` to re-validate a recent report or \`@oss-protector dismiss\` again to add another negative signal.`;
};

export const createCorrectionAcknowledgementComment = async (
	input: CorrectionAcknowledgementInput
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

	const marker = `<!-- oss-protector:correction:${input.sourceCommentId} -->`;
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
		body: correctionAcknowledgementBody(input),
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
