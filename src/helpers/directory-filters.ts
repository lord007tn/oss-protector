import type { DirectoryDashboard } from "@/actions/directory";
import type { ReasonCode } from "@/constants/reason-codes";
import { REASON_CODES } from "@/constants/reason-codes";
import type { RiskStatus } from "@/constants/risk-statuses";
import { MAX_RISK_SCORE, RISK_STATUSES } from "@/constants/risk-statuses";

export type AccountStatusFilter = Exclude<RiskStatus, "allow"> | "all";

export interface AccountFilters {
	limit: number;
	minScore: number;
	offset: number;
	q: string;
	reason: ReasonCode | "all";
	status: AccountStatusFilter;
}

export interface ProtectorFilters {
	limit: number;
	minReports: number;
	minScore: number;
	offset: number;
	q: string;
}

export type AccountProfile = DirectoryDashboard["riskProfiles"][number];
export type ProtectorProfile = DirectoryDashboard["protectors"][number];

const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 500;
const MAX_OFFSET = 50_000;
const VALID_ACCOUNT_STATUSES = new Set<string>([
	"all",
	...RISK_STATUSES.filter((status) => status !== "allow"),
]);
const VALID_REASONS = new Set<string>(["all", ...REASON_CODES]);

const defaultAccountFilters: AccountFilters = {
	limit: DEFAULT_LIMIT,
	minScore: 0,
	offset: 0,
	q: "",
	reason: "all",
	status: "all",
};

export type FilterField =
	| "limit"
	| "min_reports"
	| "min_score"
	| "offset"
	| "reason"
	| "status";

export class FilterValidationError extends Error {
	readonly field: FilterField;
	readonly value: string;
	readonly allowed: string[];

	constructor(field: FilterField, value: string, allowed: string[]) {
		super(`Invalid ${field} "${value}". Allowed: ${allowed.join(", ")}.`);
		this.field = field;
		this.value = value;
		this.allowed = allowed;
	}
}

// Strict number parser: throws on non-numeric, non-integer, or out-of-range.
// Returns the fallback only for explicitly-missing values (null / empty
// string). This is the "reject limit=1000 with 400" behavior the audit asked
// for, applied uniformly to every numeric filter.
const requireBoundedNumber = ({
	field,
	max,
	min,
	value,
	fallback,
}: {
	fallback: number;
	field: FilterField;
	max: number;
	min: number;
	value: null | string;
}): number => {
	if (value === null || value.trim() === "") {
		return fallback;
	}
	const parsed = Number(value);
	if (!(Number.isFinite(parsed) && Number.isInteger(parsed))) {
		throw new FilterValidationError(field, value, [`integer ${min}–${max}`]);
	}
	if (parsed < min || parsed > max) {
		throw new FilterValidationError(field, value, [`${min}–${max}`]);
	}
	return parsed;
};

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
		limit: requireBoundedNumber({
			fallback: DEFAULT_LIMIT,
			field: "limit",
			max: MAX_LIMIT,
			min: 1,
			value: searchParams.get("limit"),
		}),
		minScore: requireBoundedNumber({
			fallback: 0,
			field: "min_score",
			max: MAX_RISK_SCORE,
			min: 0,
			value: searchParams.get("min_score"),
		}),
		offset: requireBoundedNumber({
			fallback: 0,
			field: "offset",
			max: MAX_OFFSET,
			min: 0,
			value: searchParams.get("offset"),
		}),
		q: (searchParams.get("q") ?? "").trim(),
		reason: reason as AccountFilters["reason"],
		status: status as AccountStatusFilter,
	};
}

export function parseProtectorFilters(
	searchParams: URLSearchParams
): ProtectorFilters {
	return {
		limit: requireBoundedNumber({
			fallback: DEFAULT_LIMIT,
			field: "limit",
			max: MAX_LIMIT,
			min: 1,
			value: searchParams.get("limit"),
		}),
		minReports: requireBoundedNumber({
			fallback: 0,
			field: "min_reports",
			max: MAX_LIMIT,
			min: 0,
			value: searchParams.get("min_reports"),
		}),
		minScore: requireBoundedNumber({
			fallback: 0,
			field: "min_score",
			max: MAX_RISK_SCORE,
			min: 0,
			value: searchParams.get("min_score"),
		}),
		offset: requireBoundedNumber({
			fallback: 0,
			field: "offset",
			max: MAX_OFFSET,
			min: 0,
			value: searchParams.get("offset"),
		}),
		q: (searchParams.get("q") ?? "").trim(),
	};
}

export interface FilteredPage<T> {
	page: T[];
	pageInfo: {
		hasMore: boolean;
		limit: number;
		offset: number;
		total: number;
	};
}

export function filterAccounts(
	profiles: AccountProfile[],
	filters: AccountFilters
): FilteredPage<AccountProfile> {
	const query = filters.q.toLowerCase();
	const matched = profiles
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
		.filter((profile) => profile.score >= filters.minScore);

	const total = matched.length;
	const page = matched.slice(filters.offset, filters.offset + filters.limit);
	return {
		page,
		pageInfo: {
			hasMore: filters.offset + page.length < total,
			limit: filters.limit,
			offset: filters.offset,
			total,
		},
	};
}

export function filterProtectors(
	protectors: ProtectorProfile[],
	filters: ProtectorFilters
): FilteredPage<ProtectorProfile> {
	const query = filters.q.toLowerCase();
	const matched = protectors
		.filter((protector) =>
			query ? protector.login.toLowerCase().includes(query) : true
		)
		.filter((protector) => protector.score >= filters.minScore)
		.filter((protector) => protector.reports >= filters.minReports);

	const total = matched.length;
	const page = matched.slice(filters.offset, filters.offset + filters.limit);
	return {
		page,
		pageInfo: {
			hasMore: filters.offset + page.length < total,
			limit: filters.limit,
			offset: filters.offset,
			total,
		},
	};
}
