import type { ReasonCode } from "@/constants/reason-codes";
import { REASON_LABELS } from "@/constants/reason-codes";
import type { RiskStatus } from "@/constants/risk-statuses";
import { RISK_STATUS_LABELS } from "@/constants/risk-statuses";
import type { AccountProfile } from "@/helpers/directory-filters";

// Maps the real DirectoryDashboard risk-profile shape onto the display props
// the prototype-styled components consume. Keeps the UI honest about real data
// (status, score, reason codes) instead of the synthetic prototype fields.

export type StatusVariant =
	| "destructive"
	| "warning"
	| "info"
	| "success"
	| "secondary";

export function riskStatusBadge(status: RiskStatus): {
	variant: StatusVariant;
	label: string;
} {
	const label = RISK_STATUS_LABELS[status];
	if (status === "block" || status === "high_risk") {
		return { label, variant: "destructive" };
	}
	if (status === "review") {
		return { label, variant: "warning" };
	}
	if (status === "allow") {
		return { label, variant: "success" };
	}
	return { label, variant: "info" };
}

export function reasonLabel(code: ReasonCode): string {
	return REASON_LABELS[code] ?? code;
}

export function avatarInitials(login: string): string {
	const cleaned = login.replace(/[^a-zA-Z\d]/g, "");
	return (cleaned.slice(0, 2) || "??").toUpperCase();
}

export interface DisplayAccount {
	avatarUrl: string | null;
	confidence: number;
	htmlUrl: string | null;
	importedSource: string | null;
	lastSeenAt: number;
	login: string;
	prCount: number;
	reasonCodes: ReasonCode[];
	reportCount: number;
	repositoryCount: number;
	score: number;
	status: RiskStatus;
	summary: string | null;
	validatedReportCount: number;
}

export function toDisplayAccount(profile: AccountProfile): DisplayAccount {
	return {
		avatarUrl: profile.avatarUrl,
		// The risk score (0-100) is the primary indicator; surface it through the
		// confidence-bar widget normalized to 0-1.
		confidence: profile.score / 100,
		htmlUrl: profile.htmlUrl,
		importedSource: profile.importedSource,
		lastSeenAt: profile.lastSeenAt,
		login: profile.login,
		prCount: profile.prCount,
		reasonCodes: profile.reasonCodes,
		repositoryCount: profile.repositoryCount,
		reportCount: profile.reportCount,
		score: profile.score,
		status: profile.status,
		summary: profile.summary,
		validatedReportCount: profile.validatedReportCount,
	};
}

export function relativeTime(unixSeconds: number): string {
	if (!unixSeconds) {
		return "—";
	}
	const diff = Math.max(0, Date.now() / 1000 - unixSeconds);
	if (diff < 60) {
		return "just now";
	}
	if (diff < 3600) {
		return `${Math.floor(diff / 60)}m ago`;
	}
	if (diff < 86_400) {
		return `${Math.floor(diff / 3600)}h ago`;
	}
	return `${Math.floor(diff / 86_400)}d ago`;
}
