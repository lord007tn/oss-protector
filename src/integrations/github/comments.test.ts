import { describe, expect, it } from "vitest";

import { pullRequestAnalysisBody } from "./comments";

describe("pullRequestAnalysisBody", () => {
	it("renders a concise assessment with score context", () => {
		const body = pullRequestAnalysisBody({
			authorLogin: "outside-contributor",
			causes: ["Potentially dangerous execution or obfuscation"],
			confidence: 82,
			evidenceSummary:
				"Patch adds a postinstall script that uploads process.env.",
			fileCount: 2,
			headSha: "abc123",
			rationale: "Automatic review found suspicious lifecycle behavior.",
			reasonCode: "malicious_code",
			scoreBreakdown: {
				aiQuality: 20,
				contributionValue: 15,
				credentialRisk: 65,
				farmingRisk: 10,
				maliciousRisk: 82,
				novelty: 20,
			},
			verdict: "likely_abuse",
		});

		expect(body).toContain(
			"OSS Protector completed automatic PR review: **Flagged for maintainer review.**"
		);
		expect(body).toContain("| Analysis | Completed for this PR event |");
		expect(body).toContain("| Review band | High risk (75-89) |");
		expect(body).toContain("| Score | 82/100 for this PR only |");
		expect(body).toContain("Primary signals:");
		expect(body).toContain("| Dimension | Score | Meaning |");
		expect(body).toContain("<summary>Score bands and profile lookup</summary>");
		expect(body).toContain("The score above is specific to this pull request.");
	});
});
