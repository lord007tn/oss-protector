export const RISK_STATUSES = ["allow", "watch", "review", "block"] as const;

export type RiskStatus = (typeof RISK_STATUSES)[number];

export const RISK_STATUS_LABELS: Record<RiskStatus, string> = {
	allow: "Allowed",
	block: "Block",
	review: "Review",
	watch: "Watch",
};

export const RISK_STATUS_WEIGHTS: Record<RiskStatus, number> = {
	allow: -100,
	watch: 20,
	review: 55,
	block: 85,
};
