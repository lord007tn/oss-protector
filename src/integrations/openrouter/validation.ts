import { REASON_CODES, type ReasonCode } from "@/constants/reason-codes";
import { env, runtimeEnv } from "@/env";

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
	rationale: string;
	status: "dismissed" | "needs_review" | "pending" | "validated";
	verdict: "likely_abuse" | "not_enough_evidence" | "unclear";
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
	rationale: string;
	reasonCode: ReasonCode;
	verdict: "likely_abuse" | "not_enough_evidence" | "unclear";
}

const OPENROUTER_FREE_MODEL_CHAIN = [
	"qwen/qwen3-next-80b-a3b-instruct:free",
	"openai/gpt-oss-120b:free",
	"deepseek/deepseek-v4-flash:free",
] as const;
const OPENROUTER_REQUEST_TIMEOUT_MS = 4500;
const isFreeOpenRouterModel = (model: string) => model.endsWith(":free");

const fallbackValidateReport = (
	input: ReportValidationInput
): ReportValidationResult => {
	const command =
		`${input.commandText} ${input.reasonText ?? ""}`.toLowerCase();
	const strongKeywords = [
		"fake bounty",
		"malicious",
		"phishing",
		"spam",
		"duplicate",
		"bot",
	];
	const keywordHits = strongKeywords.filter((keyword) =>
		command.includes(keyword)
	).length;
	const maintainerBoost = input.reporterIsMaintainer ? 38 : 8;
	const confidence = Math.min(92, 30 + maintainerBoost + keywordHits * 10);
	let status: ReportValidationResult["status"] = "pending";
	if (confidence >= 72) {
		status = "validated";
	} else if (confidence >= 45) {
		status = "needs_review";
	}

	return {
		causes: strongKeywords
			.filter((keyword) => command.includes(keyword))
			.slice(0, 4),
		confidence,
		rationale:
			"OpenRouter is not configured, so the deterministic fallback used reporter role and command keywords.",
		status,
		verdict: confidence >= 72 ? "likely_abuse" : "unclear",
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
	const pullRequestContext =
		`${input.pullRequest?.title ?? ""} ${input.pullRequest?.body ?? ""}`.toLowerCase();
	return INDEPENDENT_CONTEXT_KEYWORDS.some((keyword) =>
		pullRequestContext.includes(keyword)
	);
};

const capCommandOnlyReport = (
	result: ReportValidationResult,
	input: ReportValidationInput
): ReportValidationResult => {
	if (
		result.status === "dismissed" ||
		result.verdict === "not_enough_evidence" ||
		hasIndependentPullRequestEvidence(input)
	) {
		return result;
	}

	const needsCap =
		result.status === "validated" ||
		result.verdict === "likely_abuse" ||
		result.confidence >= 65;
	if (!needsCap) {
		return result;
	}

	return {
		...result,
		confidence: Math.min(result.confidence, 64),
		rationale: `${result.rationale} Command-only reports are capped until independent pull request evidence or corroborating reports support the claim.`,
		status: "needs_review",
		verdict: "unclear",
	};
};

const safeParseJson = <TResult>(value: string | null | undefined) => {
	if (!value) {
		return null;
	}
	try {
		return JSON.parse(value) as Partial<TResult>;
	} catch {
		return null;
	}
};

const normalizeConfidence = (value: number) => {
	const scaled = value > 0 && value <= 1 ? value * 100 : value;
	return Math.max(0, Math.min(100, Math.round(scaled)));
};

const configuredModels = () =>
	OPENROUTER_FREE_MODEL_CHAIN.filter(isFreeOpenRouterModel);

const callOpenRouterJson = async <TResult>({
	input,
	system,
}: {
	input: unknown;
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

	let lastError = "OpenRouter did not return a usable response.";
	for (const model of models) {
		try {
			const response = await fetch(
				"https://openrouter.ai/api/v1/chat/completions",
				{
					body: JSON.stringify({
						max_tokens: 350,
						messages: [
							{ content: system, role: "system" },
							{ content: JSON.stringify(input), role: "user" },
						],
						model,
						response_format: { type: "json_object" },
						temperature: 0.1,
					}),
					headers: {
						Authorization: `Bearer ${key}`,
						"Content-Type": "application/json",
						"HTTP-Referer": runtimeEnv().VITE_APP_URL ?? env.VITE_APP_URL,
						"X-Title": "OSS Protector",
					},
					method: "POST",
					signal: AbortSignal.timeout(OPENROUTER_REQUEST_TIMEOUT_MS),
				}
			);

			if (!response.ok) {
				lastError = `OpenRouter model ${model} returned ${response.status}.`;
				continue;
			}

			const payload = (await response.json()) as {
				choices?: Array<{ message?: { content?: string } }>;
			};
			const parsed = safeParseJson<TResult>(
				payload.choices?.[0]?.message?.content
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

const inferReasonCode = (text: string): ReasonCode => {
	const normalized = text.toLowerCase();
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
	if (verdict === "likely_abuse") {
		return `Automatic review found suspicious OSS abuse indicators in the PR metadata or patch snippets.${scope}`;
	}
	if (verdict === "unclear") {
		return `Automatic review found weak or ambiguous suspicious indicators that need maintainer judgment.${scope}`;
	}
	return `Automatic review did not find concrete OSS abuse indicators in the PR metadata or patch snippets.${scope}`;
};

const extractFallbackCauses = (text: string, changedFiles: number) => {
	const normalized = text.toLowerCase();
	const causes = [
		["fake bounty", "Bounty-seeking language"],
		["bounty", "Bounty-seeking language"],
		["spam", "Spam-like PR wording"],
		["duplicate", "Duplicate PR wording"],
		["ai slope", "Low-context generated text"],
		["ai slop", "Low-context generated text"],
		["ai generated", "Generated-content signal"],
		["low quality", "Low-quality submission signal"],
		["malicious", "Malicious-code language"],
		["phishing", "Phishing language"],
		["credential", "Credential risk language"],
		["backdoor", "Backdoor language"],
		["token", "Token or secret reference"],
		["secret", "Token or secret reference"],
		["password", "Credential reference"],
		["eval(", "Dynamic code execution"],
		["curl ", "Unexpected network command"],
		["base64", "Obfuscation marker"],
		["postinstall", "Dependency lifecycle script"],
	] as const;
	const matched: string[] = causes
		.filter(([keyword]) => normalized.includes(keyword))
		.map(([, cause]) => cause);
	if (changedFiles > 20) {
		matched.push("Broad PR scope");
	}
	return [...new Set(matched)].slice(0, 5);
};

const fallbackAnalyzePullRequest = (
	input: PullRequestAnalysisInput
): PullRequestAnalysisResult => {
	const fileText =
		input.files
			?.map(
				(file) =>
					`${file.filename} ${file.status} +${file.additions} -${file.deletions} ${file.patch ?? ""}`
			)
			.join("\n")
			.slice(0, 12_000) ?? "";
	const text = `${input.title} ${input.body ?? ""}\n${fileText}`;
	const changedFiles = input.files?.length ?? 0;
	const causes = extractFallbackCauses(text, changedFiles);
	const keywordHits = causes.length;
	const broadChangeBoost = changedFiles > 20 ? 12 : 0;
	const confidence = Math.min(88, 18 + keywordHits * 12 + broadChangeBoost);
	let verdict: PullRequestAnalysisResult["verdict"] = "not_enough_evidence";
	if (confidence >= 65) {
		verdict = "likely_abuse";
	} else if (confidence >= 35) {
		verdict = "unclear";
	}

	return {
		causes,
		confidence,
		rationale: defaultPullRequestRationale(input, verdict),
		reasonCode: inferReasonCode(text),
		verdict,
	};
};

const confidenceForVerdict = (
	verdict: ReportValidationResult["verdict"],
	parsedConfidence: number
) => {
	if (verdict === "likely_abuse") {
		return parsedConfidence;
	}
	if (verdict === "unclear") {
		return Math.min(parsedConfidence, 60);
	}
	return Math.min(parsedConfidence, 35);
};

const defaultReportStatus = (
	confidence: number
): ReportValidationResult["status"] => {
	if (confidence >= 75) {
		return "validated";
	}
	return "needs_review";
};

const statusForReportVerdict = ({
	confidence,
	input,
	parsedStatus,
	verdict,
}: {
	confidence: number;
	input: ReportValidationInput;
	parsedStatus: ReportValidationResult["status"];
	verdict: ReportValidationResult["verdict"];
}): ReportValidationResult["status"] => {
	if (verdict === "not_enough_evidence") {
		return "dismissed";
	}
	if (verdict === "unclear") {
		return parsedStatus === "pending" ? "pending" : "needs_review";
	}
	if (
		parsedStatus === "pending" &&
		input.reporterIsMaintainer &&
		confidence >= 72
	) {
		return "validated";
	}
	if (parsedStatus === "dismissed") {
		return "needs_review";
	}
	return parsedStatus;
};

export const validateReportWithOpenRouter = async (
	input: ReportValidationInput
): Promise<ReportValidationResult> => {
	const aiResponse = await callOpenRouterJson<ReportValidationResult>({
		input: {
			allowed_statuses: ["pending", "validated", "dismissed", "needs_review"],
			allowed_verdicts: ["likely_abuse", "unclear", "not_enough_evidence"],
			report: input,
			response_shape: {
				causes: ["short concrete cause", "another cause"],
				confidence: 0,
				rationale: "brief evidence-based rationale",
				status: "needs_review",
				verdict: "unclear",
			},
		},
		system:
			"You validate maintainer reports about suspicious GitHub pull requests. Return strict JSON only with verdict, confidence, status, rationale, and causes. Causes must be short concrete evidence labels. Do not call someone a bot unless evidence is strong.",
	});
	if (!aiResponse.parsed) {
		return capCommandOnlyReport(
			{
				...fallbackValidateReport(input),
				rationale: `${aiResponse.error} Fallback validation was used.`,
			},
			input
		);
	}
	const parsed = aiResponse.parsed;

	const parsedConfidence =
		typeof parsed.confidence === "number"
			? normalizeConfidence(parsed.confidence)
			: fallbackValidateReport(input).confidence;
	const verdict =
		parsed.verdict === "likely_abuse" ||
		parsed.verdict === "not_enough_evidence" ||
		parsed.verdict === "unclear"
			? parsed.verdict
			: "unclear";
	const confidence = confidenceForVerdict(verdict, parsedConfidence);
	const parsedStatus =
		parsed.status === "validated" ||
		parsed.status === "dismissed" ||
		parsed.status === "needs_review" ||
		parsed.status === "pending"
			? parsed.status
			: defaultReportStatus(confidence);
	const status = statusForReportVerdict({
		confidence,
		input,
		parsedStatus,
		verdict,
	});

	return capCommandOnlyReport(
		{
			causes: Array.isArray(parsed.causes)
				? parsed.causes
						.filter((cause): cause is string => typeof cause === "string")
						.slice(0, 5)
				: fallbackValidateReport(input).causes,
			confidence,
			rationale:
				typeof parsed.rationale === "string"
					? parsed.rationale.slice(0, 800)
					: `OpenRouter ${aiResponse.model} returned a structured verdict without rationale.`,
			status,
			verdict,
		},
		input
	);
};

export const validatePullRequestWithOpenRouter = async (
	input: PullRequestAnalysisInput
): Promise<PullRequestAnalysisResult> => {
	const aiResponse = await callOpenRouterJson<PullRequestAnalysisResult>({
		input: {
			allowed_reason_codes: REASON_CODES,
			allowed_verdicts: ["likely_abuse", "unclear", "not_enough_evidence"],
			pull_request: {
				...input,
				files: input.files?.map((file) => ({
					...file,
					patch: file.patch?.slice(0, 1800),
				})),
			},
			response_shape: {
				causes: ["short concrete cause", "another cause"],
				confidence: 0,
				rationale: "brief evidence-based rationale",
				reasonCode: "maintainer_report",
				verdict: "unclear",
			},
		},
		system:
			"You review GitHub pull requests for suspicious OSS abuse signals by inspecting the title, body, changed file metadata, and patch snippets. Look for fake bounty farming, spam, duplicate low-effort changes, low-quality AI filler, credential phishing, malicious code, dependency/script abuse, suspicious obfuscation, or backdoors. Return strict JSON only with verdict, confidence, reasonCode, rationale, and causes. Causes must be short concrete evidence labels. Do not classify as likely_abuse unless concrete evidence appears in the PR.",
	});
	if (!aiResponse.parsed) {
		return fallbackAnalyzePullRequest(input);
	}
	const parsed = aiResponse.parsed;

	const fallback = fallbackAnalyzePullRequest(input);
	const parsedConfidence =
		typeof parsed.confidence === "number"
			? normalizeConfidence(parsed.confidence)
			: fallback.confidence;
	const verdict =
		parsed.verdict === "likely_abuse" ||
		parsed.verdict === "not_enough_evidence" ||
		parsed.verdict === "unclear"
			? parsed.verdict
			: fallback.verdict;
	const confidence = confidenceForVerdict(verdict, parsedConfidence);
	const reasonCode = REASON_CODES.includes(parsed.reasonCode as ReasonCode)
		? (parsed.reasonCode as ReasonCode)
		: fallback.reasonCode;

	return {
		causes: Array.isArray(parsed.causes)
			? parsed.causes
					.filter((cause): cause is string => typeof cause === "string")
					.slice(0, 5)
			: fallback.causes,
		confidence,
		rationale:
			typeof parsed.rationale === "string"
				? parsed.rationale.slice(0, 800)
				: defaultPullRequestRationale(input, verdict),
		reasonCode,
		verdict,
	};
};
