import type { ReasonCode } from "@/constants/reason-codes";
import { REASON_LABELS } from "@/constants/reason-codes";
import type { RiskStatus } from "@/constants/risk-statuses";
import { RISK_STATUSES } from "@/constants/risk-statuses";

import type { LandingAnalytics, RiskProfile } from "./types";

export function buildAnalytics(riskyAccounts: RiskProfile[]): LandingAnalytics {
	const statusMap = new Map<RiskStatus, number>(
		RISK_STATUSES.flatMap((status) =>
			status === "allow" ? [] : [[status, 0] as [RiskStatus, number]]
		)
	);
	const reasonMap = new Map<string, number>();

	for (const profile of riskyAccounts) {
		if (statusMap.has(profile.status)) {
			statusMap.set(profile.status, (statusMap.get(profile.status) ?? 0) + 1);
		} else {
			statusMap.set("watch", (statusMap.get("watch") ?? 0) + 1);
		}
		for (const reason of profile.reasonCodes) {
			reasonMap.set(reason, (reasonMap.get(reason) ?? 0) + 1);
		}
	}

	const totalScore = riskyAccounts.reduce(
		(sum, profile) => sum + profile.score,
		0
	);
	const averageScore =
		riskyAccounts.length > 0
			? Math.round(totalScore / riskyAccounts.length)
			: 0;

	return {
		averageScore,
		riskyAccounts: riskyAccounts.length,
		statusCounts: [...statusMap.entries()].map(([status, count]) => ({
			count,
			status,
		})),
		topReasons: [...reasonMap.entries()]
			.map(([reason, count]) => ({ count, reason }))
			.sort((left, right) => right.count - left.count)
			.slice(0, 5),
	};
}

export function reasonLabel(reason: string) {
	return isReasonCode(reason) ? REASON_LABELS[reason] : reason;
}

function isReasonCode(reason: string): reason is ReasonCode {
	return reason in REASON_LABELS;
}
