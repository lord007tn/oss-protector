import type { ReasonCode } from "@/constants/reason-codes";
import { REASON_CODES } from "@/constants/reason-codes";
import type { RiskStatus } from "@/constants/risk-statuses";
import { RISK_STATUSES } from "@/constants/risk-statuses";
import type { DirectoryDashboard } from "@/data-access/directory";

export type ClankerStatusFilter = Exclude<RiskStatus, "allow"> | "all";

export interface ClankerFilters {
	limit: number;
	minScore: number;
	q: string;
	reason: ReasonCode | "all";
	status: ClankerStatusFilter;
}

export interface ProtectorFilters {
	limit: number;
	minReports: number;
	minScore: number;
	q: string;
}

export type ClankerProfile = DirectoryDashboard["riskProfiles"][number];
export type ProtectorProfile = DirectoryDashboard["protectors"][number];

const DEFAULT_LIMIT = 250;
const MAX_LIMIT = 500;
const VALID_CLANKER_STATUSES = new Set<string>([
	"all",
	...RISK_STATUSES.filter((status) => status !== "allow"),
]);
const VALID_REASONS = new Set<string>(["all", ...REASON_CODES]);

export const defaultClankerFilters: ClankerFilters = {
	limit: DEFAULT_LIMIT,
	minScore: 0,
	q: "",
	reason: "all",
	status: "all",
};

export const defaultProtectorFilters: ProtectorFilters = {
	limit: DEFAULT_LIMIT,
	minReports: 0,
	minScore: 0,
	q: "",
};

export function parseClankerFilters(
	searchParams: URLSearchParams
): ClankerFilters {
	const status = searchParams.get("status") ?? defaultClankerFilters.status;
	const reason = searchParams.get("reason") ?? defaultClankerFilters.reason;

	return {
		limit: parseBoundedNumber(searchParams.get("limit"), DEFAULT_LIMIT, 1),
		minScore: parseBoundedNumber(searchParams.get("min_score"), 0, 0),
		q: (searchParams.get("q") ?? "").trim(),
		reason: VALID_REASONS.has(reason)
			? (reason as ClankerFilters["reason"])
			: defaultClankerFilters.reason,
		status: VALID_CLANKER_STATUSES.has(status)
			? (status as ClankerStatusFilter)
			: defaultClankerFilters.status,
	};
}

export function parseProtectorFilters(
	searchParams: URLSearchParams
): ProtectorFilters {
	return {
		limit: parseBoundedNumber(searchParams.get("limit"), DEFAULT_LIMIT, 1),
		minReports: parseBoundedNumber(searchParams.get("min_reports"), 0, 0),
		minScore: parseBoundedNumber(searchParams.get("min_score"), 0, 0),
		q: (searchParams.get("q") ?? "").trim(),
	};
}

export function filterClankers(
	profiles: ClankerProfile[],
	filters: ClankerFilters
) {
	const query = filters.q.toLowerCase();

	return profiles
		.filter((profile) => profile.status !== "allow")
		.filter((profile) =>
			query
				? profile.login.toLowerCase().includes(query) ||
					(profile.summary ?? "").toLowerCase().includes(query)
				: true
		)
		.filter((profile) =>
			filters.status === "all" ? true : profile.status === filters.status
		)
		.filter((profile) =>
			filters.reason === "all"
				? true
				: profile.reasonCodes.includes(filters.reason)
		)
		.filter((profile) => profile.score >= filters.minScore)
		.slice(0, filters.limit);
}

export function filterProtectors(
	protectors: ProtectorProfile[],
	filters: ProtectorFilters
) {
	const query = filters.q.toLowerCase();

	return protectors
		.filter((protector) =>
			query ? protector.login.toLowerCase().includes(query) : true
		)
		.filter((protector) => protector.score >= filters.minScore)
		.filter((protector) => protector.reports >= filters.minReports)
		.slice(0, filters.limit);
}

function parseBoundedNumber(
	value: null | string,
	fallback: number,
	min: number
) {
	if (value === null || value.trim() === "") {
		return fallback;
	}
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		return fallback;
	}
	return Math.min(MAX_LIMIT, Math.max(min, Math.round(parsed)));
}
