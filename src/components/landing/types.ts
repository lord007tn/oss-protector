import type { ReasonCode } from "@/constants/reason-codes";
import type { RiskStatus } from "@/constants/risk-statuses";
import type { DirectoryDashboard } from "@/data-access/directory";

export type RiskProfile = DirectoryDashboard["riskProfiles"][number];
export type Protector = DirectoryDashboard["protectors"][number];

export interface ReasonCount {
	count: number;
	reason: ReasonCode | string;
}

export interface StatusCount {
	count: number;
	status: RiskStatus;
}

export interface LandingAnalytics {
	averageScore: number;
	riskyAccounts: number;
	statusCounts: StatusCount[];
	topReasons: ReasonCount[];
}
