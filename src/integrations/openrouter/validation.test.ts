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
