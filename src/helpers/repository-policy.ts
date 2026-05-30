import type { PullRequestAnalysisResult } from "@/integrations/openrouter/validation";

export interface RepositoryPolicy {
	analyzePrivateRepositories: boolean;
	enabled: boolean;
	ignoredPaths: string[];
	minimumLikelyAbuseConfidence: number;
	trustedAuthors: string[];
}

export const DEFAULT_REPOSITORY_POLICY: RepositoryPolicy = {
	analyzePrivateRepositories: false,
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
			analyzePrivateRepositories:
				typeof parsed.analyzePrivateRepositories === "boolean"
					? parsed.analyzePrivateRepositories
					: DEFAULT_REPOSITORY_POLICY.analyzePrivateRepositories,
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

// Like parseRepositoryPolicy but returns only the fields actually present in
// the JSON — used by the resolver so we can tell what came from the committed
// file vs. what should fall through to DB or defaults.
export const parseRepositoryPolicyPartial = (
	source: string
): Partial<RepositoryPolicy> => {
	try {
		const parsed = JSON.parse(source) as Record<string, unknown>;
		const result: Partial<RepositoryPolicy> = {};
		if (typeof parsed.analyzePrivateRepositories === "boolean") {
			result.analyzePrivateRepositories = parsed.analyzePrivateRepositories;
		}
		if (typeof parsed.enabled === "boolean") {
			result.enabled = parsed.enabled;
		}
		if (Array.isArray(parsed.ignoredPaths)) {
			result.ignoredPaths = asStringArray(parsed.ignoredPaths);
		}
		if (typeof parsed.minimumLikelyAbuseConfidence === "number") {
			result.minimumLikelyAbuseConfidence = asConfidence(
				parsed.minimumLikelyAbuseConfidence
			);
		}
		if (Array.isArray(parsed.trustedAuthors)) {
			result.trustedAuthors = asStringArray(parsed.trustedAuthors).map(
				(login) => login.toLowerCase()
			);
		}
		return result;
	} catch {
		return {};
	}
};

// Validates a Partial that's about to be persisted from the dashboard. Drops
// unknown fields, clamps numbers, normalizes string arrays. Callers store the
// result so we don't carry untrusted shapes into the DB.
export const sanitizeRepositoryPolicyPartial = (
	input: Record<string, unknown>
): Partial<RepositoryPolicy> => {
	const result: Partial<RepositoryPolicy> = {};
	if (typeof input.analyzePrivateRepositories === "boolean") {
		result.analyzePrivateRepositories = input.analyzePrivateRepositories;
	}
	if (typeof input.enabled === "boolean") {
		result.enabled = input.enabled;
	}
	if (Array.isArray(input.ignoredPaths)) {
		result.ignoredPaths = asStringArray(input.ignoredPaths);
	}
	if (typeof input.minimumLikelyAbuseConfidence === "number") {
		result.minimumLikelyAbuseConfidence = asConfidence(
			input.minimumLikelyAbuseConfidence
		);
	}
	if (Array.isArray(input.trustedAuthors)) {
		result.trustedAuthors = asStringArray(input.trustedAuthors).map((login) =>
			login.toLowerCase()
		);
	}
	return result;
};

export type PolicyFieldSource = "default" | "db" | "file";

export interface ResolvedRepositoryPolicy {
	policy: RepositoryPolicy;
	sources: Record<keyof RepositoryPolicy, PolicyFieldSource>;
}

// Merge precedence per field: committed file > dashboard DB row > default.
// Returns both the effective policy (for the analyzer) and per-field sources
// (for the UI to surface "this field is overridden by your committed file").
export const resolveRepositoryPolicy = ({
	dbPolicy,
	filePolicy,
}: {
	dbPolicy: Partial<RepositoryPolicy>;
	filePolicy: Partial<RepositoryPolicy>;
}): ResolvedRepositoryPolicy => {
	const sources: Record<keyof RepositoryPolicy, PolicyFieldSource> = {
		analyzePrivateRepositories: "default",
		enabled: "default",
		ignoredPaths: "default",
		minimumLikelyAbuseConfidence: "default",
		trustedAuthors: "default",
	};
	const policy: RepositoryPolicy = { ...DEFAULT_REPOSITORY_POLICY };
	const fields = Object.keys(DEFAULT_REPOSITORY_POLICY) as Array<
		keyof RepositoryPolicy
	>;
	const assign = <K extends keyof RepositoryPolicy>(
		field: K,
		value: RepositoryPolicy[K]
	) => {
		policy[field] = value;
	};
	for (const field of fields) {
		const fileValue = filePolicy[field];
		if (fileValue !== undefined) {
			assign(field, fileValue as RepositoryPolicy[typeof field]);
			sources[field] = "file";
			continue;
		}
		const dbValue = dbPolicy[field];
		if (dbValue !== undefined) {
			assign(field, dbValue as RepositoryPolicy[typeof field]);
			sources[field] = "db";
		}
	}
	return { policy, sources };
};

export const shouldSkipPullRequestAnalysis = ({
	authorLogin,
	filenames,
	policy,
	repositoryIsPrivate = false,
}: {
	authorLogin: string;
	filenames: string[];
	policy: RepositoryPolicy;
	repositoryIsPrivate?: boolean;
}): boolean => {
	if (!policy.enabled) {
		return true;
	}
	if (repositoryIsPrivate && !policy.analyzePrivateRepositories) {
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
