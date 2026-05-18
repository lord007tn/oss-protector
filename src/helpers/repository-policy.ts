import type { PullRequestAnalysisResult } from "@/integrations/openrouter/validation";

export interface RepositoryPolicy {
	enabled: boolean;
	ignoredPaths: string[];
	minimumLikelyAbuseConfidence: number;
	trustedAuthors: string[];
}

export const DEFAULT_REPOSITORY_POLICY: RepositoryPolicy = {
	enabled: true,
	ignoredPaths: [],
	minimumLikelyAbuseConfidence: 70,
	trustedAuthors: [],
};

const MIN_LIKELY_ABUSE_CONFIDENCE = 65;
const MAX_LIKELY_ABUSE_CONFIDENCE = 95;

const asStringArray = (value: unknown): string[] =>
	Array.isArray(value)
		? value
				.filter((item): item is string => typeof item === "string")
				.map((item) => item.trim())
				.filter(Boolean)
		: [];

const asConfidence = (value: unknown): number => {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return DEFAULT_REPOSITORY_POLICY.minimumLikelyAbuseConfidence;
	}
	return Math.min(
		MAX_LIKELY_ABUSE_CONFIDENCE,
		Math.max(MIN_LIKELY_ABUSE_CONFIDENCE, Math.round(value))
	);
};

export const parseRepositoryPolicy = (source: string): RepositoryPolicy => {
	try {
		const parsed = JSON.parse(source) as Record<string, unknown>;
		return {
			enabled:
				typeof parsed.enabled === "boolean"
					? parsed.enabled
					: DEFAULT_REPOSITORY_POLICY.enabled,
			ignoredPaths: asStringArray(parsed.ignoredPaths),
			minimumLikelyAbuseConfidence: asConfidence(
				parsed.minimumLikelyAbuseConfidence
			),
			trustedAuthors: asStringArray(parsed.trustedAuthors).map((login) =>
				login.toLowerCase()
			),
		};
	} catch {
		return DEFAULT_REPOSITORY_POLICY;
	}
};

export const shouldSkipPullRequestAnalysis = ({
	authorLogin,
	filenames,
	policy,
}: {
	authorLogin: string;
	filenames: string[];
	policy: RepositoryPolicy;
}): boolean => {
	if (!policy.enabled) {
		return true;
	}
	if (policy.trustedAuthors.includes(authorLogin.toLowerCase())) {
		return true;
	}
	return (
		filenames.length > 0 &&
		policy.ignoredPaths.length > 0 &&
		filenames.every((filename) =>
			policy.ignoredPaths.some((prefix) => filename.startsWith(prefix))
		)
	);
};

export const applyRepositoryPolicy = (
	analysis: PullRequestAnalysisResult,
	policy: RepositoryPolicy
): PullRequestAnalysisResult => {
	if (
		analysis.verdict !== "likely_abuse" ||
		analysis.confidence >= policy.minimumLikelyAbuseConfidence
	) {
		return analysis;
	}

	return {
		...analysis,
		confidence: Math.min(64, analysis.confidence),
		rationale: `${analysis.rationale} Repository policy requires at least ${policy.minimumLikelyAbuseConfidence}/100 confidence before a PR is treated as likely abuse; this result was downgraded to review-needed.`,
		verdict: "unclear",
	};
};
