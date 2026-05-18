import { describe, expect, it } from "vitest";

import {
	applyRepositoryPolicy,
	parseRepositoryPolicy,
	shouldSkipPullRequestAnalysis,
} from "./repository-policy";

describe("repository policy", () => {
	it("parses repo-local policy with bounded confidence", () => {
		const policy = parseRepositoryPolicy(
			JSON.stringify({
				enabled: true,
				ignoredPaths: ["docs/"],
				minimumLikelyAbuseConfidence: 120,
				trustedAuthors: ["Dependabot[bot]"],
			})
		);

		expect(policy.minimumLikelyAbuseConfidence).toBe(95);
		expect(policy.ignoredPaths).toEqual(["docs/"]);
		expect(policy.trustedAuthors).toEqual(["dependabot[bot]"]);
	});

	it("skips trusted authors and ignored path-only changes", () => {
		const policy = parseRepositoryPolicy(
			JSON.stringify({
				ignoredPaths: ["docs/"],
				trustedAuthors: ["security-bot"],
			})
		);

		expect(
			shouldSkipPullRequestAnalysis({
				authorLogin: "security-bot",
				filenames: ["src/index.ts"],
				policy,
			})
		).toBe(true);
		expect(
			shouldSkipPullRequestAnalysis({
				authorLogin: "contributor",
				filenames: ["docs/api.md", "docs/setup.md"],
				policy,
			})
		).toBe(true);
		expect(
			shouldSkipPullRequestAnalysis({
				authorLogin: "contributor",
				filenames: ["docs/api.md", "src/index.ts"],
				policy,
			})
		).toBe(false);
	});

	it("downgrades likely-abuse results below the repo threshold", () => {
		const result = applyRepositoryPolicy(
			{
				causes: ["Suspicious"],
				confidence: 72,
				evidenceSummary: "Suspicious but below repo threshold.",
				rationale: "Flagged by default policy.",
				reasonCode: "malicious_code",
				scoreBreakdown: {
					aiQuality: 0,
					contributionValue: 70,
					credentialRisk: 0,
					farmingRisk: 0,
					maliciousRisk: 85,
					novelty: 70,
				},
				verdict: "likely_abuse",
			},
			parseRepositoryPolicy(
				JSON.stringify({ minimumLikelyAbuseConfidence: 90 })
			)
		);

		expect(result.verdict).toBe("unclear");
		expect(result.confidence).toBe(64);
	});
});
