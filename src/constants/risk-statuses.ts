export const RISK_STATUSES = [
	"allow",
	"watch",
	"review",
	"high_risk",
	"block",
] as const;

export type RiskStatus = (typeof RISK_STATUSES)[number];

export const RISK_STATUS_LABELS: Record<RiskStatus, string> = {
	allow: "Allowed",
	block: "Block",
	high_risk: "High risk",
	review: "Review",
	watch: "Watch",
};

const RISK_STATUS_WEIGHTS: Record<RiskStatus, number> = {
	allow: -100,
	watch: 1,
	review: 55,
	high_risk: 75,
	block: 90,
};

export const MAX_RISK_SCORE = 100;

export const RISK_STATUS_DESCRIPTIONS: Record<RiskStatus, string> = {
	allow: "Known safe automation or explicitly allowed account.",
	block:
		"Strong repeated or severe evidence. Maintainers may choose to block or require manual approval.",
	high_risk:
		"Multiple strong signals or one severe signal. Maintainers should inspect before merging.",
	review:
		"Moderate signal. Needs maintainer judgment and should not be treated as a final verdict.",
	watch:
		"Low or early signal. Track for context, but do not act without more evidence.",
};

export const RISK_SCORE_BANDS = [
	{
		max: MAX_RISK_SCORE,
		min: RISK_STATUS_WEIGHTS.block,
		status: "block",
	},
	{
		max: RISK_STATUS_WEIGHTS.block - 1,
		min: RISK_STATUS_WEIGHTS.high_risk,
		status: "high_risk",
	},
	{
		max: RISK_STATUS_WEIGHTS.high_risk - 1,
		min: RISK_STATUS_WEIGHTS.review,
		status: "review",
	},
	{
		max: RISK_STATUS_WEIGHTS.review - 1,
		min: RISK_STATUS_WEIGHTS.watch,
		status: "watch",
	},
] as const satisfies Array<{
	max: number;
	min: number;
	status: Exclude<RiskStatus, "allow">;
}>;

export const riskStatusForScore = ({
	isAllowed,
	score,
}: {
	isAllowed: boolean;
	score: number;
}): RiskStatus => {
	if (isAllowed) {
		return "allow";
	}
	const band = RISK_SCORE_BANDS.find(
		(item) => score >= item.min && score <= item.max
	);
	return band?.status ?? "watch";
};
