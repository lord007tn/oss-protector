export const REASON_CODES = [
	"fake_bounty",
	"ai_slop",
	"spam_pr",
	"duplicate_pr",
	"low_quality_ai",
	"credential_phishing",
	"malicious_code",
	"impersonation",
	"maintainer_report",
	"honeypot_match",
	"external_blocklist",
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];

export const REASON_LABELS: Record<ReasonCode, string> = {
	ai_slop: "AI slop",
	credential_phishing: "Credential phishing",
	duplicate_pr: "Duplicate PR pattern",
	external_blocklist: "External blocklist",
	fake_bounty: "Fake bounty farming",
	honeypot_match: "Honeypot match",
	impersonation: "Impersonation",
	low_quality_ai: "Low-quality AI submission",
	maintainer_report: "Maintainer report",
	malicious_code: "Malicious code",
	spam_pr: "Spam PR",
};

export const REASON_DESCRIPTIONS: Record<ReasonCode, string> = {
	ai_slop:
		"Submission appears to contain low-context generated text or mechanical edits that do not match the project.",
	credential_phishing:
		"Signal references credential collection, token exfiltration, suspicious links, or secret harvesting.",
	duplicate_pr:
		"Pattern resembles repeated or copied pull requests across projects with little project-specific work.",
	external_blocklist:
		"Account appears in an imported public OSS abuse source and should be reviewed with local context.",
	fake_bounty:
		"Signal suggests low-value pull requests created primarily to claim rewards or bounty credit.",
	honeypot_match:
		"Activity matched a repository-specific trap, canary, or known abuse detection rule.",
	impersonation:
		"Signal suggests misleading identity, maintainer impersonation, or false project affiliation.",
	low_quality_ai:
		"Changes look generated, broad, or low-effort without enough evidence of malicious intent.",
	maintainer_report:
		"Maintainer supplied direct context that should be evaluated alongside automated signals.",
	malicious_code:
		"Patch may introduce backdoors, obfuscation, dangerous scripts, or unexpected code execution.",
	spam_pr:
		"Pull request appears promotional, irrelevant, repeated, or unrelated to project needs.",
};

export const REASON_CAUSES: Record<ReasonCode, string[]> = {
	ai_slop: [
		"Generic generated wording",
		"Mechanical edits without project context",
		"Mismatch between description and code change",
	],
	credential_phishing: [
		"Secret or token collection",
		"Suspicious external link",
		"Credential-looking prompt or workflow",
	],
	duplicate_pr: [
		"Repeated patch shape",
		"Same account pattern across repositories",
		"Low project-specific context",
	],
	external_blocklist: [
		"Imported public source match",
		"Prior suspicious OSS contribution pattern",
		"Needs local verification before action",
	],
	fake_bounty: [
		"Reward-seeking language",
		"Low-value broad PR activity",
		"Repeated bounty-style submissions",
	],
	honeypot_match: [
		"Repository trap interaction",
		"Known canary trigger",
		"Project-specific abuse rule match",
	],
	impersonation: [
		"Misleading identity claim",
		"False affiliation",
		"Maintainer or project mimicry",
	],
	low_quality_ai: [
		"Unreviewed generated changes",
		"Broad formatting or wording churn",
		"Insufficient project understanding",
	],
	maintainer_report: [
		"Direct maintainer context",
		"Repository-local evidence",
		"Manual review signal",
	],
	malicious_code: [
		"Obfuscation",
		"Unexpected network or process execution",
		"Dependency lifecycle script abuse",
	],
	spam_pr: [
		"Irrelevant change",
		"Promotional or noisy content",
		"Repeated low-effort submission",
	],
};
