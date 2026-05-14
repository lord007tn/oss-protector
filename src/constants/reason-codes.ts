export const REASON_CODES = [
	"fake_bounty",
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
