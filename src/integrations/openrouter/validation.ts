import { OpenRouter } from "@openrouter/sdk";

import { REASON_CODES, type ReasonCode } from "@/constants/reason-codes";
import { env, runtimeEnv } from "@/env";

import {
	PULL_REQUEST_REVIEW_SYSTEM_PROMPT,
	REPORT_VALIDATION_SYSTEM_PROMPT,
} from "./prompts";

export const ReportReviewStatus = {
	Dismissed: "dismissed",
	NeedsReview: "needs_review",
	Submitted: "pending",
	Validated: "validated",
} as const;

export const ReviewVerdict = {
	LikelyAbuse: "likely_abuse",
	NotEnoughEvidence: "not_enough_evidence",
	Unclear: "unclear",
} as const;

const ReviewSignalKind = {
	AiSlop: "ai_slope",
	BroadScope: "broad_scope",
	ContributionFarming: "contribution_farming",
	CredentialRisk: "credential_risk",
	DuplicatePattern: "duplicate_pattern",
	MaliciousCode: "malicious_code",
	NoMeaningfulAddition: "no_meaningful_addition",
	Spam: "spam",
} as const;

type ReportReviewStatusValue =
	(typeof ReportReviewStatus)[keyof typeof ReportReviewStatus];
type ReviewVerdictValue = (typeof ReviewVerdict)[keyof typeof ReviewVerdict];
type ReviewSignalKindValue =
	(typeof ReviewSignalKind)[keyof typeof ReviewSignalKind];

export interface ReportValidationInput {
	commandText: string;
	pullRequest?: {
		body?: null | string;
		title?: null | string;
		url?: null | string;
	};
	reasonText?: null | string;
	reporterAssociation: string;
	reporterIsMaintainer: boolean;
	targetLogin: string;
}

export interface ReportValidationResult {
	causes?: string[];
	confidence: number;
	evidenceSummary?: string;
	rationale: string;
	scoreBreakdown?: ScoreBreakdown;
	status: ReportReviewStatusValue;
	verdict: ReviewVerdictValue;
}

export interface PullRequestAnalysisInput {
	body?: null | string;
	files?: Array<{
		additions: number;
		changes: number;
		deletions: number;
		filename: string;
		patch?: string;
		status: string;
	}>;
	targetLogin: string;
	title: string;
	url: string;
}

export interface PullRequestAnalysisResult {
	causes: string[];
	confidence: number;
	evidenceSummary?: string;
	rationale: string;
	reasonCode: ReasonCode;
	scoreBreakdown?: ScoreBreakdown;
	verdict: ReviewVerdictValue;
}

interface ScoreBreakdown {
	aiQuality: number;
	contributionValue: number;
	credentialRisk: number;
	farmingRisk: number;
	maliciousRisk: number;
	novelty: number;
}

interface EvidenceSignal {
	cause: string;
	evidence: string;
	kind: ReviewSignalKindValue;
	score: number;
	severity: "high" | "low" | "medium";
}

interface StructuredPrContext {
	body: string;
	files: Array<{
		additions: number;
		deletions: number;
		filename: string;
		patchExcerpt: string;
		status: string;
	}>;
	metrics: {
		changedFiles: number;
		docsOnly: boolean;
		hasMeaningfulCodeChange: boolean;
		netLines: number;
		totalAdditions: number;
		totalDeletions: number;
		trivialChange: boolean;
	};
	signals: EvidenceSignal[];
	targetLogin: string;
	title: string;
	url: string;
}

// Free OpenRouter models with response_format=json_schema support.
// Source: https://openrouter.ai/api/v1/models filtered by id endsWith ":free"
// AND supported_parameters includes "response_format" (or "structured_outputs").
// Ordered fastest -> heaviest fallback. Each request stops at the first model
// that returns a parseable JSON response.
const OPENROUTER_FREE_MODEL_CHAIN = [
	"qwen/qwen3-next-80b-a3b-instruct:free",
	"google/gemma-4-31b-it:free",
	"nvidia/nemotron-3-super-120b-a12b:free",
	"minimax/minimax-m2.5:free",
] as const;
const OPENROUTER_REQUEST_TIMEOUT_MS = 4500;
const MAX_PATCH_EXCERPT_LENGTH = 1800;
const MAX_CONTEXT_TEXT_LENGTH = 12_000;
const DOC_EXTENSION_PATTERN = /\.(md|mdx|txt|rst|adoc)$/i;
const DOC_PATH_PATTERN =
	/(^|\/)(readme|docs?|changelog|license|contributing)(\/|\.|$)/i;

const REPORT_RESPONSE_SCHEMA = {
	additionalProperties: false,
	properties: {
		causes: {
			items: { type: "string" },
			maxItems: 5,
			type: "array",
		},
		confidence: { maximum: 100, minimum: 0, type: "integer" },
		evidenceSummary: { type: "string" },
		rationale: { type: "string" },
		scoreBreakdown: {
			additionalProperties: false,
			properties: {
				aiQuality: { maximum: 100, minimum: 0, type: "integer" },
				contributionValue: { maximum: 100, minimum: 0, type: "integer" },
				credentialRisk: { maximum: 100, minimum: 0, type: "integer" },
				farmingRisk: { maximum: 100, minimum: 0, type: "integer" },
				maliciousRisk: { maximum: 100, minimum: 0, type: "integer" },
				novelty: { maximum: 100, minimum: 0, type: "integer" },
			},
			required: [
				"aiQuality",
				"contributionValue",
				"credentialRisk",
				"farmingRisk",
				"maliciousRisk",
				"novelty",
			],
			type: "object",
		},
		status: {
			enum: [
				ReportReviewStatus.Submitted,
				ReportReviewStatus.NeedsReview,
				ReportReviewStatus.Validated,
				ReportReviewStatus.Dismissed,
			],
			type: "string",
		},
		verdict: {
			enum: [
				ReviewVerdict.LikelyAbuse,
				ReviewVerdict.Unclear,
				ReviewVerdict.NotEnoughEvidence,
			],
			type: "string",
		},
	},
	required: [
		"causes",
		"confidence",
		"evidenceSummary",
		"rationale",
		"scoreBreakdown",
		"status",
		"verdict",
	],
	type: "object",
} as const;

const PULL_REQUEST_RESPONSE_SCHEMA = {
	...REPORT_RESPONSE_SCHEMA,
	properties: {
		...REPORT_RESPONSE_SCHEMA.properties,
		reasonCode: {
			enum: REASON_CODES,
			type: "string",
		},
	},
	required: [...REPORT_RESPONSE_SCHEMA.required, "reasonCode"],
} as const;

const DEFAULT_SCORE_BREAKDOWN: ScoreBreakdown = {
	aiQuality: 0,
	contributionValue: 70,
	credentialRisk: 0,
	farmingRisk: 0,
	maliciousRisk: 0,
	novelty: 70,
};

const isFreeOpenRouterModel = (model: string) => model.endsWith(":free");

const clampScore = (value: number) =>
	Math.max(0, Math.min(100, Math.round(value)));

const scoreBreakdown = (input: Partial<ScoreBreakdown>): ScoreBreakdown => ({
	aiQuality: clampScore(input.aiQuality ?? DEFAULT_SCORE_BREAKDOWN.aiQuality),
	contributionValue: clampScore(
		input.contributionValue ?? DEFAULT_SCORE_BREAKDOWN.contributionValue
	),
	credentialRisk: clampScore(
		input.credentialRisk ?? DEFAULT_SCORE_BREAKDOWN.credentialRisk
	),
	farmingRisk: clampScore(
		input.farmingRisk ?? DEFAULT_SCORE_BREAKDOWN.farmingRisk
	),
	maliciousRisk: clampScore(
		input.maliciousRisk ?? DEFAULT_SCORE_BREAKDOWN.maliciousRisk
	),
	novelty: clampScore(input.novelty ?? DEFAULT_SCORE_BREAKDOWN.novelty),
});

const configuredModels = () =>
	OPENROUTER_FREE_MODEL_CHAIN.filter(isFreeOpenRouterModel);

const openRouterClient = (apiKey: string) =>
	new OpenRouter({
		apiKey,
		appTitle: "OSS Protector",
		httpReferer: runtimeEnv().VITE_APP_URL ?? env.VITE_APP_URL,
	});

const safeParseJson = <TResult>(value: unknown) => {
	if (!value) {
		return null;
	}
	if (typeof value === "object") {
		return value as Partial<TResult>;
	}
	if (typeof value !== "string") {
		return null;
	}
	try {
		return JSON.parse(value) as Partial<TResult>;
	} catch {
		return null;
	}
};

const callOpenRouterJson = async <TResult>({
	input,
	schema,
	schemaName,
	system,
}: {
	input: unknown;
	schema: Record<string, unknown>;
	schemaName: string;
	system: string;
}) => {
	const key = runtimeEnv().OPENROUTER_API_KEY ?? env.OPENROUTER_API_KEY;
	if (!key) {
		return { error: "OpenRouter is not configured." };
	}

	const models = configuredModels();
	if (models.length === 0) {
		return { error: "No OpenRouter :free models are configured." };
	}

	const client = openRouterClient(key);
	let lastError = "OpenRouter did not return a usable response.";
	for (const model of models) {
		try {
			const response = await client.chat.send(
				{
					chatRequest: {
						maxTokens: 700,
						messages: [
							{ content: system, role: "system" },
							{ content: JSON.stringify(input), role: "user" },
						],
						model,
						responseFormat: {
							jsonSchema: {
								name: schemaName,
								schema,
								strict: true,
							},
							type: "json_schema",
						},
						temperature: 0.1,
					},
				},
				{ timeoutMs: OPENROUTER_REQUEST_TIMEOUT_MS }
			);
			const parsed = safeParseJson<TResult>(
				response.choices[0]?.message?.content
			);
			if (!parsed) {
				lastError = `OpenRouter model ${model} returned non-JSON content.`;
				continue;
			}

			return { model, parsed };
		} catch (caught) {
			lastError =
				caught instanceof Error
					? `OpenRouter call failed: ${caught.message}`
					: "OpenRouter call failed.";
		}
	}

	return { error: lastError };
};

const normalizeConfidence = (value: number) => {
	const scaled = value > 0 && value <= 1 ? value * 100 : value;
	return clampScore(scaled);
};

const lowerText = (value: string) => value.toLowerCase();

const includesAny = (text: string, keywords: readonly string[]) =>
	keywords.some((keyword) => text.includes(keyword));

const pushSignal = (signals: EvidenceSignal[], signal: EvidenceSignal) => {
	if (!signals.some((item) => item.cause === signal.cause)) {
		signals.push(signal);
	}
};

const isDocLikeFile = (filename: string) =>
	DOC_EXTENSION_PATTERN.test(filename) || DOC_PATH_PATTERN.test(filename);

const buildStructuredPullRequestContext = (
	input: PullRequestAnalysisInput
): StructuredPrContext => {
	const files =
		input.files?.map((file) => ({
			additions: file.additions,
			deletions: file.deletions,
			filename: file.filename,
			patchExcerpt: file.patch?.slice(0, MAX_PATCH_EXCERPT_LENGTH) ?? "",
			status: file.status,
		})) ?? [];
	const totalAdditions = files.reduce((sum, file) => sum + file.additions, 0);
	const totalDeletions = files.reduce((sum, file) => sum + file.deletions, 0);
	const netLines = totalAdditions + totalDeletions;
	const docsOnly =
		files.length > 0 && files.every((file) => isDocLikeFile(file.filename));
	const hasCodeFile = files.some((file) => !isDocLikeFile(file.filename));
	const meaningfulPatchText = files
		.map((file) => file.patchExcerpt)
		.join("\n")
		.replace(/^[+\-\s#/*`_.,;:()[\]{}'"|\\]+$/gm, "")
		.trim();
	const hasMeaningfulCodeChange =
		hasCodeFile && meaningfulPatchText.length > 30;
	const trivialChange = netLines <= 4 || (docsOnly && netLines <= 12);
	const text = lowerText(
		`${input.title}\n${input.body ?? ""}\n${files
			.map(
				(file) =>
					`${file.filename} ${file.status} +${file.additions} -${file.deletions}\n${file.patchExcerpt}`
			)
			.join("\n")}`.slice(0, MAX_CONTEXT_TEXT_LENGTH)
	);
	const signals: EvidenceSignal[] = [];
	const hasFarmingLanguage = includesAny(text, [
		"bounty",
		"reward",
		"claim",
		"payment",
		"hacktoberfest",
		"contribution",
		"streak",
	]);
	const hasGeneratedLanguage = includesAny(text, [
		"ai generated",
		"generated by ai",
		"chatgpt",
		"as an ai",
		"comprehensive improvement",
		"enhance user experience",
		"optimize the codebase",
	]);
	const hasUsefulSmallFixLanguage = includesAny(text, [
		"broken link",
		"spelling",
		"typo",
	]);
	const hasGenericLowValueLanguage = includesAny(text, [
		"cleanup",
		"formatting",
		"improve documentation",
		"minor update",
		"small update",
		"update docs",
		"update readme",
	]);

	if (hasFarmingLanguage && (trivialChange || !hasMeaningfulCodeChange)) {
		pushSignal(signals, {
			cause: "Low-value contribution farming",
			evidence:
				"Reward or contribution language appears with little substance.",
			kind: ReviewSignalKind.ContributionFarming,
			score: 58,
			severity: "medium",
		});
	}
	if (hasGeneratedLanguage) {
		pushSignal(signals, {
			cause: "Low-context generated content",
			evidence: "PR text or patch contains generic generated phrasing.",
			kind: ReviewSignalKind.AiSlop,
			score: 46,
			severity: "medium",
		});
	}
	if (
		trivialChange &&
		!hasMeaningfulCodeChange &&
		!hasUsefulSmallFixLanguage &&
		(hasFarmingLanguage ||
			hasGeneratedLanguage ||
			hasGenericLowValueLanguage ||
			files.length === 0)
	) {
		pushSignal(signals, {
			cause: "No meaningful project addition",
			evidence: `${files.length} file(s), ${netLines} changed line(s), no substantive code signal.`,
			kind: ReviewSignalKind.NoMeaningfulAddition,
			score: 30,
			severity: "low",
		});
	}
	if (files.length > 20 || netLines > 1200) {
		pushSignal(signals, {
			cause: "Broad unaudited scope",
			evidence: `${files.length} files and ${netLines} changed lines.`,
			kind: ReviewSignalKind.BroadScope,
			score: 40,
			severity: "medium",
		});
	}
	if (
		includesAny(text, [
			"eval(",
			"exec(",
			"child_process",
			"postinstall",
			"preinstall",
			"curl ",
			"wget ",
			"base64",
			"atob(",
			"backdoor",
			"reverse shell",
		])
	) {
		pushSignal(signals, {
			cause: "Potentially dangerous execution or obfuscation",
			evidence:
				"Patch references execution, lifecycle scripts, network commands, or obfuscation markers.",
			kind: ReviewSignalKind.MaliciousCode,
			score: 82,
			severity: "high",
		});
	}
	if (
		includesAny(text, [
			"token",
			"secret",
			"password",
			"private key",
			"credential",
			"webhook",
			"exfil",
		])
	) {
		pushSignal(signals, {
			cause: "Credential or secret handling risk",
			evidence:
				"Patch references credentials, secrets, tokens, or exfiltration.",
			kind: ReviewSignalKind.CredentialRisk,
			score: 78,
			severity: "high",
		});
	}
	if (
		includesAny(text, ["duplicate", "same change", "template pr", "copied"])
	) {
		pushSignal(signals, {
			cause: "Duplicate or template PR signal",
			evidence: "PR text suggests copied or repeated patch shape.",
			kind: ReviewSignalKind.DuplicatePattern,
			score: 50,
			severity: "medium",
		});
	}
	if (includesAny(text, ["buy now", "promo", "promotion", "unrelated"])) {
		pushSignal(signals, {
			cause: "Spam-like or unrelated content",
			evidence: "PR text contains promotional or unrelated wording.",
			kind: ReviewSignalKind.Spam,
			score: 44,
			severity: "medium",
		});
	}

	return {
		body: input.body?.slice(0, 3000) ?? "",
		files,
		metrics: {
			changedFiles: files.length,
			docsOnly,
			hasMeaningfulCodeChange,
			netLines,
			totalAdditions,
			totalDeletions,
			trivialChange,
		},
		signals,
		targetLogin: input.targetLogin,
		title: input.title,
		url: input.url,
	};
};

const reasonCodeForSignals = (
	text: string,
	signals: EvidenceSignal[]
): ReasonCode => {
	if (
		signals.some((signal) => signal.kind === ReviewSignalKind.MaliciousCode)
	) {
		return "malicious_code";
	}
	if (
		signals.some((signal) => signal.kind === ReviewSignalKind.CredentialRisk)
	) {
		return "credential_phishing";
	}
	if (
		signals.some(
			(signal) => signal.kind === ReviewSignalKind.ContributionFarming
		) ||
		text.includes("bounty") ||
		text.includes("reward")
	) {
		return "fake_bounty";
	}
	if (signals.some((signal) => signal.kind === ReviewSignalKind.AiSlop)) {
		return "ai_slope";
	}
	if (
		signals.some((signal) => signal.kind === ReviewSignalKind.DuplicatePattern)
	) {
		return "duplicate_pr";
	}
	if (
		signals.some(
			(signal) =>
				signal.kind === ReviewSignalKind.NoMeaningfulAddition ||
				signal.kind === ReviewSignalKind.Spam
		)
	) {
		return "spam_pr";
	}
	return "maintainer_report";
};

const defaultPullRequestRationale = (
	input: PullRequestAnalysisInput,
	verdict: PullRequestAnalysisResult["verdict"]
) => {
	const filenames =
		input.files
			?.slice(0, 4)
			.map((file) => file.filename)
			.join(", ") ?? "";
	const scope = filenames ? ` Reviewed files: ${filenames}.` : "";
	if (verdict === ReviewVerdict.LikelyAbuse) {
		return `Automatic review found suspicious OSS abuse indicators in the PR metadata or patch snippets.${scope}`;
	}
	if (verdict === ReviewVerdict.Unclear) {
		return `Automatic review found weak or ambiguous suspicious indicators that need maintainer judgment.${scope}`;
	}
	return `Automatic review did not find concrete OSS abuse indicators in the PR metadata or patch snippets.${scope}`;
};

const fallbackAnalyzePullRequest = (
	input: PullRequestAnalysisInput
): PullRequestAnalysisResult => {
	const context = buildStructuredPullRequestContext(input);
	const text = lowerText(
		`${context.title}\n${context.body}\n${context.files
			.map((file) => `${file.filename}\n${file.patchExcerpt}`)
			.join("\n")}`.slice(0, MAX_CONTEXT_TEXT_LENGTH)
	);
	const highSignal = context.signals.some(
		(signal) => signal.severity === "high"
	);
	const maxSignalScore = Math.max(
		0,
		...context.signals.map((signal) => signal.score)
	);
	const confidence = clampScore(
		maxSignalScore +
			(context.metrics.trivialChange ? 0 : 4) +
			(context.metrics.changedFiles > 20 ? 8 : 0)
	);
	let verdict: PullRequestAnalysisResult["verdict"] =
		ReviewVerdict.NotEnoughEvidence;
	if (highSignal && confidence >= 70) {
		verdict = ReviewVerdict.LikelyAbuse;
	} else if (confidence >= 30 || context.signals.length > 0) {
		verdict = ReviewVerdict.Unclear;
	}

	return {
		causes: context.signals.map((signal) => signal.cause).slice(0, 5),
		confidence,
		evidenceSummary:
			context.signals[0]?.evidence ??
			"No concrete OSS abuse signal was detected by fallback review.",
		rationale: defaultPullRequestRationale(input, verdict),
		reasonCode: reasonCodeForSignals(text, context.signals),
		scoreBreakdown: scoreBreakdown({
			aiQuality: context.signals.some(
				(signal) => signal.kind === ReviewSignalKind.AiSlop
			)
				? 60
				: 0,
			contributionValue: context.metrics.trivialChange ? 20 : 70,
			credentialRisk: context.signals.some(
				(signal) => signal.kind === ReviewSignalKind.CredentialRisk
			)
				? 80
				: 0,
			farmingRisk: context.signals.some(
				(signal) => signal.kind === ReviewSignalKind.ContributionFarming
			)
				? 65
				: 0,
			maliciousRisk: context.signals.some(
				(signal) => signal.kind === ReviewSignalKind.MaliciousCode
			)
				? 85
				: 0,
			novelty: context.metrics.trivialChange ? 15 : 70,
		}),
		verdict,
	};
};

const buildReportSignals = ({
	command,
	reporterIsMaintainer,
}: {
	command: string;
	reporterIsMaintainer: boolean;
}) => {
	const reportSignals: EvidenceSignal[] = [];
	if (includesAny(command, ["fake bounty", "bounty", "reward"])) {
		pushSignal(reportSignals, {
			cause: "Maintainer reported bounty or contribution farming",
			evidence: "Report text references bounty, reward, or farming behavior.",
			kind: ReviewSignalKind.ContributionFarming,
			score: reporterIsMaintainer ? 52 : 30,
			severity: "medium",
		});
	}
	if (includesAny(command, ["malicious", "backdoor", "obfuscat"])) {
		pushSignal(reportSignals, {
			cause: "Maintainer reported malicious code",
			evidence: "Report text references malicious code or backdoor risk.",
			kind: ReviewSignalKind.MaliciousCode,
			score: reporterIsMaintainer ? 64 : 38,
			severity: "medium",
		});
	}
	if (includesAny(command, ["phish", "credential", "token", "secret"])) {
		pushSignal(reportSignals, {
			cause: "Maintainer reported credential risk",
			evidence:
				"Report text references phishing, tokens, secrets, or credentials.",
			kind: ReviewSignalKind.CredentialRisk,
			score: reporterIsMaintainer ? 64 : 38,
			severity: "medium",
		});
	}
	if (
		includesAny(command, ["ai slop", "ai slope", "low quality", "generated"])
	) {
		pushSignal(reportSignals, {
			cause: "Maintainer reported low-quality generated work",
			evidence: "Report text references generated or low-quality contribution.",
			kind: ReviewSignalKind.AiSlop,
			score: reporterIsMaintainer ? 48 : 28,
			severity: "medium",
		});
	}
	if (includesAny(command, ["spam", "duplicate", "useless", "no addition"])) {
		pushSignal(reportSignals, {
			cause: "Maintainer reported spam or no-value contribution",
			evidence: "Report text references spam, duplicate, or useless changes.",
			kind: ReviewSignalKind.NoMeaningfulAddition,
			score: reporterIsMaintainer ? 42 : 24,
			severity: "low",
		});
	}

	return reportSignals;
};

const fallbackVerdictForReport = ({
	confidence,
	corroborated,
	hasSignals,
}: {
	confidence: number;
	corroborated: boolean;
	hasSignals: boolean;
}): ReviewVerdictValue => {
	if (corroborated && confidence >= 75) {
		return ReviewVerdict.LikelyAbuse;
	}
	if (hasSignals) {
		return ReviewVerdict.Unclear;
	}
	return ReviewVerdict.NotEnoughEvidence;
};

const fallbackStatusForVerdict = (
	verdict: ReviewVerdictValue
): ReportReviewStatusValue => {
	if (verdict === ReviewVerdict.NotEnoughEvidence) {
		return ReportReviewStatus.Dismissed;
	}
	if (verdict === ReviewVerdict.LikelyAbuse) {
		return ReportReviewStatus.Validated;
	}
	return ReportReviewStatus.NeedsReview;
};

const scoreBreakdownForReportSignals = (
	signals: EvidenceSignal[],
	prContext: StructuredPrContext
) =>
	scoreBreakdown({
		aiQuality: signals.some((signal) => signal.kind === ReviewSignalKind.AiSlop)
			? 55
			: 0,
		contributionValue: signals.some(
			(signal) => signal.kind === ReviewSignalKind.NoMeaningfulAddition
		)
			? 20
			: 60,
		credentialRisk: signals.some(
			(signal) => signal.kind === ReviewSignalKind.CredentialRisk
		)
			? 65
			: 0,
		farmingRisk: signals.some(
			(signal) => signal.kind === ReviewSignalKind.ContributionFarming
		)
			? 60
			: 0,
		maliciousRisk: signals.some(
			(signal) => signal.kind === ReviewSignalKind.MaliciousCode
		)
			? 70
			: 0,
		novelty: prContext.metrics.trivialChange ? 20 : 60,
	});

const fallbackValidateReport = (
	input: ReportValidationInput
): ReportValidationResult => {
	const pullRequestInput: PullRequestAnalysisInput = {
		body: input.pullRequest?.body,
		files: [],
		targetLogin: input.targetLogin,
		title: input.pullRequest?.title ?? "",
		url: input.pullRequest?.url ?? "",
	};
	const prContext = buildStructuredPullRequestContext(pullRequestInput);
	const command = lowerText(`${input.commandText} ${input.reasonText ?? ""}`);
	const reportSignals = buildReportSignals({
		command,
		reporterIsMaintainer: input.reporterIsMaintainer,
	});
	const signals = [...reportSignals, ...prContext.signals];
	const corroborated = prContext.signals.length > 0;
	const maxScore = Math.max(0, ...signals.map((signal) => signal.score));
	const confidence = clampScore(maxScore + (corroborated ? 12 : 0));
	const verdict = fallbackVerdictForReport({
		confidence,
		corroborated,
		hasSignals: signals.length > 0,
	});

	return {
		causes: signals.map((signal) => signal.cause).slice(0, 5),
		confidence,
		evidenceSummary:
			signals[0]?.evidence ??
			"Fallback validation found no concrete report evidence.",
		rationale:
			"OpenRouter is not configured, so deterministic fallback used structured report text, PR metadata, and corroboration rules.",
		scoreBreakdown: scoreBreakdownForReportSignals(signals, prContext),
		status: fallbackStatusForVerdict(verdict),
		verdict,
	};
};

const INDEPENDENT_CONTEXT_KEYWORDS = [
	"backdoor",
	"base64",
	"credential",
	"curl",
	"eval(",
	"exec(",
	"malicious",
	"obfuscat",
	"password",
	"phish",
	"private key",
	"token",
	"wget",
] as const;

const hasIndependentPullRequestEvidence = (input: ReportValidationInput) => {
	const pullRequestContext = lowerText(
		`${input.pullRequest?.title ?? ""} ${input.pullRequest?.body ?? ""}`
	);
	return INDEPENDENT_CONTEXT_KEYWORDS.some((keyword) =>
		pullRequestContext.includes(keyword)
	);
};

const capCommandOnlyReport = (
	result: ReportValidationResult,
	input: ReportValidationInput
): ReportValidationResult => {
	if (
		result.status === ReportReviewStatus.Dismissed ||
		result.verdict === ReviewVerdict.NotEnoughEvidence ||
		hasIndependentPullRequestEvidence(input)
	) {
		return result;
	}

	const needsCap =
		result.status === ReportReviewStatus.Validated ||
		result.verdict === ReviewVerdict.LikelyAbuse ||
		result.confidence >= 65;
	if (!needsCap) {
		return result;
	}

	return {
		...result,
		confidence: Math.min(result.confidence, 64),
		rationale: `${result.rationale} Command-only reports are capped until independent pull request evidence or corroborating reports support the claim.`,
		status: ReportReviewStatus.NeedsReview,
		verdict: ReviewVerdict.Unclear,
	};
};

const confidenceForVerdict = (
	verdict: ReviewVerdictValue,
	parsedConfidence: number
) => {
	if (verdict === ReviewVerdict.LikelyAbuse) {
		return parsedConfidence;
	}
	if (verdict === ReviewVerdict.Unclear) {
		return Math.min(parsedConfidence, 64);
	}
	return Math.min(parsedConfidence, 35);
};

const defaultReportStatus = (confidence: number): ReportReviewStatusValue => {
	if (confidence >= 75) {
		return ReportReviewStatus.Validated;
	}
	return ReportReviewStatus.NeedsReview;
};

const statusForReportVerdict = ({
	confidence,
	input,
	parsedStatus,
	verdict,
}: {
	confidence: number;
	input: ReportValidationInput;
	parsedStatus: ReportReviewStatusValue;
	verdict: ReviewVerdictValue;
}): ReportReviewStatusValue => {
	if (verdict === ReviewVerdict.NotEnoughEvidence) {
		return ReportReviewStatus.Dismissed;
	}
	if (verdict === ReviewVerdict.Unclear) {
		return parsedStatus === ReportReviewStatus.Submitted
			? ReportReviewStatus.Submitted
			: ReportReviewStatus.NeedsReview;
	}
	if (
		parsedStatus === ReportReviewStatus.Submitted &&
		input.reporterIsMaintainer &&
		confidence >= 75
	) {
		return ReportReviewStatus.Validated;
	}
	if (parsedStatus === ReportReviewStatus.Dismissed) {
		return ReportReviewStatus.NeedsReview;
	}
	return parsedStatus;
};

const normalizedReportRationale = ({
	fallback,
	model,
	parsed,
}: {
	fallback: ReportValidationResult;
	model?: string;
	parsed: Partial<ReportValidationResult>;
}) => {
	if (typeof parsed.rationale === "string") {
		return parsed.rationale.slice(0, 800);
	}
	if (model) {
		return `OpenRouter ${model} returned a structured verdict without rationale.`;
	}
	return fallback.rationale;
};

const normalizeReportResult = (
	parsed: Partial<ReportValidationResult>,
	fallback: ReportValidationResult,
	model?: string
): ReportValidationResult => {
	const parsedConfidence =
		typeof parsed.confidence === "number"
			? normalizeConfidence(parsed.confidence)
			: fallback.confidence;
	const verdict = isReviewVerdict(parsed.verdict)
		? parsed.verdict
		: fallback.verdict;
	const confidence = confidenceForVerdict(verdict, parsedConfidence);
	const parsedStatus = isReportStatus(parsed.status)
		? parsed.status
		: defaultReportStatus(confidence);
	return {
		causes: normalizeCauses(parsed.causes, fallback.causes),
		confidence,
		evidenceSummary:
			typeof parsed.evidenceSummary === "string"
				? parsed.evidenceSummary.slice(0, 500)
				: fallback.evidenceSummary,
		rationale: normalizedReportRationale({ fallback, model, parsed }),
		scoreBreakdown: normalizeScoreBreakdown(
			parsed.scoreBreakdown,
			fallback.scoreBreakdown
		),
		status: parsedStatus,
		verdict,
	};
};

const normalizePrResult = (
	parsed: Partial<PullRequestAnalysisResult>,
	fallback: PullRequestAnalysisResult
): PullRequestAnalysisResult => {
	const parsedConfidence =
		typeof parsed.confidence === "number"
			? normalizeConfidence(parsed.confidence)
			: fallback.confidence;
	const verdict = isReviewVerdict(parsed.verdict)
		? parsed.verdict
		: fallback.verdict;
	const confidence = confidenceForVerdict(verdict, parsedConfidence);
	const reasonCode = REASON_CODES.includes(parsed.reasonCode as ReasonCode)
		? (parsed.reasonCode as ReasonCode)
		: fallback.reasonCode;
	return {
		causes: normalizeCauses(parsed.causes, fallback.causes),
		confidence,
		evidenceSummary:
			typeof parsed.evidenceSummary === "string"
				? parsed.evidenceSummary.slice(0, 500)
				: fallback.evidenceSummary,
		rationale:
			typeof parsed.rationale === "string"
				? parsed.rationale.slice(0, 800)
				: fallback.rationale,
		reasonCode,
		scoreBreakdown: normalizeScoreBreakdown(
			parsed.scoreBreakdown,
			fallback.scoreBreakdown
		),
		verdict,
	};
};

const isReportStatus = (value: unknown): value is ReportReviewStatusValue =>
	value === ReportReviewStatus.Submitted ||
	value === ReportReviewStatus.NeedsReview ||
	value === ReportReviewStatus.Validated ||
	value === ReportReviewStatus.Dismissed;

const isReviewVerdict = (value: unknown): value is ReviewVerdictValue =>
	value === ReviewVerdict.LikelyAbuse ||
	value === ReviewVerdict.Unclear ||
	value === ReviewVerdict.NotEnoughEvidence;

const normalizeCauses = (
	causes: unknown,
	fallbackCauses: string[] | undefined
) =>
	Array.isArray(causes)
		? causes
				.filter((cause): cause is string => typeof cause === "string")
				.slice(0, 5)
		: (fallbackCauses ?? []);

const normalizeScoreBreakdown = (
	breakdown: unknown,
	fallbackBreakdown: ScoreBreakdown | undefined
) =>
	breakdown && typeof breakdown === "object"
		? scoreBreakdown(breakdown as Partial<ScoreBreakdown>)
		: (fallbackBreakdown ?? DEFAULT_SCORE_BREAKDOWN);

export const validateReportWithOpenRouter = async (
	input: ReportValidationInput
): Promise<ReportValidationResult> => {
	const fallback = fallbackValidateReport(input);
	const structuredPr = buildStructuredPullRequestContext({
		body: input.pullRequest?.body,
		files: [],
		targetLogin: input.targetLogin,
		title: input.pullRequest?.title ?? "",
		url: input.pullRequest?.url ?? "",
	});
	const aiResponse = await callOpenRouterJson<ReportValidationResult>({
		input: {
			allowed_statuses: [
				ReportReviewStatus.Submitted,
				ReportReviewStatus.NeedsReview,
				ReportReviewStatus.Validated,
				ReportReviewStatus.Dismissed,
			],
			allowed_verdicts: [
				ReviewVerdict.LikelyAbuse,
				ReviewVerdict.Unclear,
				ReviewVerdict.NotEnoughEvidence,
			],
			report: input,
			scoring_rubric: {
				"0_24": "no clear evidence",
				"25_44": "weak submitted or review signal",
				"45_64": "plausible report requiring review",
				"65_74": "strong but not public-validation safe without corroboration",
				"75_89": "validated concrete evidence",
				"90_100": "severe validated evidence",
			},
			structured_pull_request_context: structuredPr,
		},
		schema: REPORT_RESPONSE_SCHEMA,
		schemaName: "oss_protector_report_validation",
		system: REPORT_VALIDATION_SYSTEM_PROMPT,
	});
	if (!aiResponse.parsed) {
		return capCommandOnlyReport(
			{
				...fallback,
				rationale: `${aiResponse.error} Fallback validation was used.`,
			},
			input
		);
	}
	const normalized = normalizeReportResult(
		aiResponse.parsed,
		fallback,
		aiResponse.model
	);
	const status = statusForReportVerdict({
		confidence: normalized.confidence,
		input,
		parsedStatus: normalized.status,
		verdict: normalized.verdict,
	});
	return capCommandOnlyReport({ ...normalized, status }, input);
};

export const validatePullRequestWithOpenRouter = async (
	input: PullRequestAnalysisInput
): Promise<PullRequestAnalysisResult> => {
	const structuredContext = buildStructuredPullRequestContext(input);
	const fallback = fallbackAnalyzePullRequest(input);
	const aiResponse = await callOpenRouterJson<PullRequestAnalysisResult>({
		input: {
			allowed_reason_codes: REASON_CODES,
			allowed_verdicts: [
				ReviewVerdict.LikelyAbuse,
				ReviewVerdict.Unclear,
				ReviewVerdict.NotEnoughEvidence,
			],
			scoring_rubric: {
				"0_24": "harmless or no clear abuse evidence",
				"25_44": "weak quality or farming signal",
				"45_64": "suspicious; maintainer should review",
				"65_74": "strong suspicious signal",
				"75_89": "likely abuse with concrete evidence",
				"90_100": "severe likely abuse",
			},
			structured_pull_request_context: structuredContext,
		},
		schema: PULL_REQUEST_RESPONSE_SCHEMA,
		schemaName: "oss_protector_pull_request_review",
		system: PULL_REQUEST_REVIEW_SYSTEM_PROMPT,
	});
	if (!aiResponse.parsed) {
		return fallback;
	}
	return normalizePrResult(aiResponse.parsed, fallback);
};
