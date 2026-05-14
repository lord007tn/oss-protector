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
	confidence: number;
	rationale: string;
	status: "dismissed" | "needs_review" | "pending" | "validated";
	verdict: "likely_abuse" | "not_enough_evidence" | "unclear";
}

export interface PullRequestAnalysisInput {
	body?: null | string;
	targetLogin: string;
	title: string;
	url: string;
}

export interface PullRequestAnalysisResult {
	confidence: number;
	rationale: string;
	reasonCode: ReasonCode;
	verdict: "likely_abuse" | "not_enough_evidence" | "unclear";
}

const DEFAULT_OPENROUTER_MODELS = [
	"qwen/qwen3-next-80b-a3b-instruct:free",
	"openai/gpt-oss-120b:free",
	"deepseek/deepseek-v4-flash:free",
	"z-ai/glm-4.7-flash",
	"openai/gpt-5-nano",
] as const;
const OPENROUTER_MODEL_TIMEOUT_MS = 4500;

const fallbackValidateReport = (
	input: ReportValidationInput,
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
		command.includes(keyword),
	).length;
	const maintainerBoost = input.reporterIsMaintainer ? 38 : 8;
	const confidence = Math.min(92, 30 + maintainerBoost + keywordHits * 10);

	return {
		confidence,
		rationale:
			"OpenRouter is not configured, so the deterministic fallback used reporter role and command keywords.",
		status:
			confidence >= 72
				? "validated"
				: confidence >= 45
					? "needs_review"
					: "pending",
		verdict: confidence >= 72 ? "likely_abuse" : "unclear",
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

const configuredModels = () => {
	const fallbackModels =
		runtimeEnv().OPENROUTER_FALLBACK_MODELS ??
		env.OPENROUTER_FALLBACK_MODELS ??
		"";
	const models = [
		runtimeEnv().OPENROUTER_MODEL ?? env.OPENROUTER_MODEL,
		...fallbackModels
			.split(",")
			.map((model) => model.trim())
			.filter(Boolean),
		...DEFAULT_OPENROUTER_MODELS,
	];
	return [...new Set(models)].filter(Boolean);
};

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

	let lastError = "OpenRouter did not return a usable response.";
	for (const model of configuredModels()) {
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
						"X-Title": "OSS Guard",
					},
					method: "POST",
					signal: AbortSignal.timeout(OPENROUTER_MODEL_TIMEOUT_MS),
				},
			);

			if (!response.ok) {
				lastError = `OpenRouter model ${model} returned ${response.status}.`;
				continue;
			}

			const payload = (await response.json()) as {
				choices?: Array<{ message?: { content?: string } }>;
			};
			const parsed = safeParseJson<TResult>(
				payload.choices?.[0]?.message?.content,
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
	if (normalized.includes("ai") || normalized.includes("low quality")) {
		return "low_quality_ai";
	}
	if (normalized.includes("spam")) {
		return "spam_pr";
	}
	return "maintainer_report";
};

const fallbackAnalyzePullRequest = (
	input: PullRequestAnalysisInput,
): PullRequestAnalysisResult => {
	const text = `${input.title} ${input.body ?? ""}`;
	const normalized = text.toLowerCase();
	const keywordHits = [
		"fake bounty",
		"bounty",
		"spam",
		"duplicate",
		"ai generated",
		"low quality",
		"malicious",
		"phishing",
	].filter((keyword) => normalized.includes(keyword)).length;
	const confidence = Math.min(88, 18 + keywordHits * 18);

	return {
		confidence,
		rationale:
			"OpenRouter is not configured, so the deterministic fallback used PR text keywords only.",
		reasonCode: inferReasonCode(text),
		verdict:
			confidence >= 65
				? "likely_abuse"
				: confidence >= 35
					? "unclear"
					: "not_enough_evidence",
	};
};

export const validateReportWithOpenRouter = async (
	input: ReportValidationInput,
): Promise<ReportValidationResult> => {
	const aiResponse = await callOpenRouterJson<ReportValidationResult>({
		input: {
			allowed_statuses: ["pending", "validated", "dismissed", "needs_review"],
			allowed_verdicts: ["likely_abuse", "unclear", "not_enough_evidence"],
			report: input,
		},
		system:
			"You validate maintainer reports about suspicious GitHub pull requests. Return strict JSON only with verdict, confidence, status, and rationale. Do not call someone a bot unless evidence is strong.",
	});
	if (!aiResponse.parsed) {
		return {
			...fallbackValidateReport(input),
			rationale: `${aiResponse.error} Fallback validation was used.`,
		};
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
	const confidence =
		verdict === "likely_abuse"
			? parsedConfidence
			: verdict === "unclear"
				? Math.min(parsedConfidence, 60)
				: Math.min(parsedConfidence, 35);
	const parsedStatus =
		parsed.status === "validated" ||
		parsed.status === "dismissed" ||
		parsed.status === "needs_review" ||
		parsed.status === "pending"
			? parsed.status
			: confidence >= 75
				? "validated"
				: "needs_review";
	const status =
		verdict === "not_enough_evidence"
			? "dismissed"
			: verdict === "unclear"
				? parsedStatus === "pending"
					? "pending"
					: "needs_review"
				: parsedStatus === "pending" &&
						input.reporterIsMaintainer &&
						confidence >= 72
					? "validated"
					: parsedStatus === "dismissed"
						? "needs_review"
						: parsedStatus;

	return {
		confidence,
		rationale:
			typeof parsed.rationale === "string"
				? parsed.rationale.slice(0, 800)
				: `OpenRouter ${aiResponse.model} returned a structured verdict without rationale.`,
		status,
		verdict,
	};
};

export const validatePullRequestWithOpenRouter = async (
	input: PullRequestAnalysisInput,
): Promise<PullRequestAnalysisResult> => {
	const aiResponse = await callOpenRouterJson<PullRequestAnalysisResult>({
		input: {
			allowed_reason_codes: REASON_CODES,
			allowed_verdicts: ["likely_abuse", "unclear", "not_enough_evidence"],
			pull_request: input,
		},
		system:
			"You review GitHub pull requests for suspicious OSS abuse signals. Return strict JSON only with verdict, confidence, reasonCode, and rationale. Do not classify as likely_abuse unless evidence is strong.",
	});
	if (!aiResponse.parsed) {
		return {
			...fallbackAnalyzePullRequest(input),
			rationale: `${aiResponse.error} Fallback PR analysis was used.`,
		};
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
	const confidence =
		verdict === "likely_abuse"
			? parsedConfidence
			: verdict === "unclear"
				? Math.min(parsedConfidence, 60)
				: Math.min(parsedConfidence, 35);
	const reasonCode = REASON_CODES.includes(parsed.reasonCode as ReasonCode)
		? (parsed.reasonCode as ReasonCode)
		: fallback.reasonCode;

	return {
		confidence,
		rationale:
			typeof parsed.rationale === "string"
				? parsed.rationale.slice(0, 800)
				: "OpenRouter returned a structured PR verdict without rationale.",
		reasonCode,
		verdict,
	};
};
