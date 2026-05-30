import type { DirectoryDashboard } from "@/actions/directory";
import type { ReasonCode } from "@/constants/reason-codes";
import { REASON_CODES } from "@/constants/reason-codes";
import type { RiskStatus } from "@/constants/risk-statuses";
import { MAX_RISK_SCORE, RISK_STATUSES } from "@/constants/risk-statuses";

export type AccountStatusFilter = Exclude<RiskStatus, "allow"> | "all";

export interface AccountFilters {
	limit: number;
	minScore: number;
	q: string;
	reason: ReasonCode | "all";
	status: AccountStatusFilter;
}

export interface ProtectorFilters {
	limit: number;
	minReports: number;
	minScore: number;
	q: string;
}

export type AccountProfile = DirectoryDashboard["riskProfiles"][number];
export type ProtectorProfile = DirectoryDashboard["protectors"][number];

const DEFAULT_LIMIT = 250;
const MAX_LIMIT = 500;
const VALID_ACCOUNT_STATUSES = new Set<string>([
	"all",
	...RISK_STATUSES.filter((status) => status !== "allow"),
]);
const VALID_REASONS = new Set<string>(["all", ...REASON_CODES]);

const defaultAccountFilters: AccountFilters = {
	limit: DEFAULT_LIMIT,
	minScore: 0,
	q: "",
	reason: "all",
	status: "all",
};

export class FilterValidationError extends Error {
	readonly field: "status" | "reason";
	readonly value: string;
	readonly allowed: string[];

	constructor(field: "status" | "reason", value: string, allowed: string[]) {
		super(`Invalid ${field} "${value}". Allowed: ${allowed.join(", ")}.`);
		this.field = field;
		this.value = value;
		this.allowed = allowed;
	}
}

export function parseAccountFilters(
	searchParams: URLSearchParams
): AccountFilters {
	const status = searchParams.get("status") ?? defaultAccountFilters.status;
	const reason = searchParams.get("reason") ?? defaultAccountFilters.reason;

	if (!VALID_ACCOUNT_STATUSES.has(status)) {
		throw new FilterValidationError("status", status, [
			...VALID_ACCOUNT_STATUSES,
		]);
	}
	if (!VALID_REASONS.has(reason)) {
		throw new FilterValidationError("reason", reason, [...VALID_REASONS]);
	}

	return {
		limit: parseBoundedNumber(
			searchParams.get("limit"),
			DEFAULT_LIMIT,
			1,
			MAX_LIMIT
		),
		minScore: parseBoundedNumber(
			searchParams.get("min_score"),
			0,
			0,
			MAX_RISK_SCORE
		),
		q: (searchParams.get("q") ?? "").trim(),
		reason: reason as AccountFilters["reason"],
		status: status as AccountStatusFilter,
	};
}

export function parseProtectorFilters(
	searchParams: URLSearchParams
): ProtectorFilters {
	return {
		limit: parseBoundedNumber(
			searchParams.get("limit"),
			DEFAULT_LIMIT,
			1,
			MAX_LIMIT
		),
		minReports: parseBoundedNumber(
			searchParams.get("min_reports"),
			0,
			0,
			MAX_LIMIT
		),
		minScore: parseBoundedNumber(
			searchParams.get("min_score"),
			0,
			0,
			MAX_RISK_SCORE
		),
		q: (searchParams.get("q") ?? "").trim(),
	};
}

export function filterAccounts(
	profiles: AccountProfile[],
	filters: AccountFilters
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
	min: number,
	max: number
) {
	if (value === null || value.trim() === "") {
		return fallback;
	}
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		return fallback;
	}
	return Math.min(max, Math.max(min, Math.round(parsed)));
}
