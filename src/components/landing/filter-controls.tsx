import { useDebouncedCallback } from "@tanstack/react-pacer";
import { useNavigate } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { type ChangeEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { REASON_CODES, REASON_LABELS } from "@/constants/reason-codes";
import { RISK_STATUS_LABELS, RISK_STATUSES } from "@/constants/risk-statuses";
import type { ClankerStatusFilter } from "@/helpers/directory-filters";

interface ClankerSearchState {
	min_score: number;
	q: string;
	reason: string;
	status: ClankerStatusFilter;
}

interface ProtectorSearchState {
	min_reports: number;
	min_score: number;
	q: string;
}

const clankerStatuses: ClankerStatusFilter[] = [
	"all",
	...RISK_STATUSES.filter((status) => status !== "allow"),
];

const DEBOUNCE_MS = 350;

const emptyish = (value: number | string) =>
	value === "" || value === 0 || value === "all" ? undefined : value;

const positiveOrUndefined = (raw: string): number | undefined => {
	if (raw === "") {
		return;
	}
	const parsed = Number(raw);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return;
	}
	return Math.round(parsed);
};

export function ClankerFilters({ search }: { search: ClankerSearchState }) {
	const navigate = useNavigate();
	const [draftQuery, setDraftQuery] = useState(search.q);
	const [draftScore, setDraftScore] = useState<number | "">(
		search.min_score || ""
	);
	const apiEndpoint = filteredEndpoint("/api/clankers", {
		min_score: search.min_score,
		q: search.q,
		reason: search.reason,
		status: search.status,
	});

	const navigateClankers = (patch: {
		min_score?: number | undefined;
		page?: number | undefined;
		q?: string | undefined;
		reason?: string | undefined;
		status?: string | undefined;
	}) => {
		navigate({
			search: (prev: Record<string, unknown>) =>
				({ ...prev, ...patch }) as never,
			to: "/clankers",
		});
	};

	const pushQuery = useDebouncedCallback(
		(value: string) =>
			navigateClankers({
				page: undefined,
				q: value.trim() ? value.trim() : undefined,
			}),
		{ wait: DEBOUNCE_MS }
	);

	const pushScore = useDebouncedCallback(
		(value: number | undefined) =>
			navigateClankers({ min_score: value, page: undefined }),
		{ wait: DEBOUNCE_MS }
	);

	const handleQueryChange = (event: ChangeEvent<HTMLInputElement>) => {
		const value = event.target.value;
		setDraftQuery(value);
		pushQuery(value);
	};

	const handleScoreChange = (event: ChangeEvent<HTMLInputElement>) => {
		const raw = event.target.value;
		setDraftScore(raw === "" ? "" : Number(raw));
		pushScore(positiveOrUndefined(raw));
	};

	const handleStatusChange = (event: ChangeEvent<HTMLSelectElement>) => {
		const value = event.target.value;
		navigateClankers({
			page: undefined,
			status: value === "all" ? undefined : value,
		});
	};

	const handleReasonChange = (event: ChangeEvent<HTMLSelectElement>) => {
		const value = event.target.value;
		navigateClankers({
			page: undefined,
			reason: value === "all" ? undefined : value,
		});
	};

	const clearAll = () => {
		setDraftQuery("");
		setDraftScore("");
		navigate({ search: () => ({}) as never, to: "/clankers" });
	};

	const hasFilters =
		Boolean(search.q) ||
		search.min_score > 0 ||
		search.status !== "all" ||
		search.reason !== "all";

	return (
		<Card className="rounded-md border-muted/60">
			<CardHeader className="space-y-1 pb-3">
				<CardTitle className="font-medium text-base">Filter clankers</CardTitle>
				<CardDescription className="text-xs">
					Page and API share the same query params. Filters apply as you type.
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-3">
				<div className="grid gap-2 lg:grid-cols-[1fr_180px_220px_140px_auto]">
					<div className="relative">
						<Search className="absolute top-2 left-2.5 size-4 text-muted-foreground" />
						<Input
							aria-label="Search clanker login or summary"
							autoComplete="off"
							className="pl-8"
							onChange={handleQueryChange}
							placeholder="Search login or summary…"
							value={draftQuery}
						/>
					</div>
					<select
						aria-label="Filter by clanker status"
						className="h-8 rounded-md border border-input bg-background px-2.5 text-sm"
						onChange={handleStatusChange}
						value={search.status}
					>
						{clankerStatuses.map((status) => (
							<option key={status} value={status}>
								{status === "all" ? "All statuses" : RISK_STATUS_LABELS[status]}
							</option>
						))}
					</select>
					<select
						aria-label="Filter by clanker reason"
						className="h-8 rounded-md border border-input bg-background px-2.5 text-sm"
						onChange={handleReasonChange}
						value={search.reason}
					>
						<option value="all">All reasons</option>
						{REASON_CODES.map((reason) => (
							<option key={reason} value={reason}>
								{REASON_LABELS[reason]}
							</option>
						))}
					</select>
					<Input
						aria-label="Minimum clanker score"
						autoComplete="off"
						inputMode="numeric"
						min={0}
						onChange={handleScoreChange}
						placeholder="Min score"
						type="number"
						value={draftScore}
					/>
					{hasFilters ? (
						<Button onClick={clearAll} type="button" variant="ghost">
							<X data-icon="inline-start" />
							Clear
						</Button>
					) : null}
				</div>
				<ApiEndpoint endpoint={apiEndpoint} />
			</CardContent>
		</Card>
	);
}

export function ProtectorFilters({ search }: { search: ProtectorSearchState }) {
	const navigate = useNavigate();
	const [draftQuery, setDraftQuery] = useState(search.q);
	const [draftReports, setDraftReports] = useState<number | "">(
		search.min_reports || ""
	);
	const [draftScore, setDraftScore] = useState<number | "">(
		search.min_score || ""
	);
	const apiEndpoint = filteredEndpoint("/api/protectors", {
		min_reports: search.min_reports,
		min_score: search.min_score,
		q: search.q,
	});

	const navigateProtectors = (patch: {
		min_reports?: number | undefined;
		min_score?: number | undefined;
		page?: number | undefined;
		q?: string | undefined;
	}) => {
		navigate({
			search: (prev: Record<string, unknown>) =>
				({ ...prev, ...patch }) as never,
			to: "/protectors",
		});
	};

	const pushQuery = useDebouncedCallback(
		(value: string) =>
			navigateProtectors({
				page: undefined,
				q: value.trim() ? value.trim() : undefined,
			}),
		{ wait: DEBOUNCE_MS }
	);

	const pushReports = useDebouncedCallback(
		(value: number | undefined) =>
			navigateProtectors({ min_reports: value, page: undefined }),
		{ wait: DEBOUNCE_MS }
	);

	const pushScore = useDebouncedCallback(
		(value: number | undefined) =>
			navigateProtectors({ min_score: value, page: undefined }),
		{ wait: DEBOUNCE_MS }
	);

	const clearAll = () => {
		setDraftQuery("");
		setDraftReports("");
		setDraftScore("");
		navigate({ search: () => ({}) as never, to: "/protectors" });
	};

	const hasFilters =
		Boolean(search.q) || search.min_reports > 0 || search.min_score > 0;

	return (
		<Card className="rounded-md border-muted/60">
			<CardHeader className="space-y-1 pb-3">
				<CardTitle className="font-medium text-base">
					Filter review signals
				</CardTitle>
				<CardDescription className="text-xs">
					Page and API share the same query params. Filters apply as you type.
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-3">
				<div className="grid gap-2 md:grid-cols-[1fr_180px_220px_auto]">
					<div className="relative">
						<Search className="absolute top-2 left-2.5 size-4 text-muted-foreground" />
						<Input
							aria-label="Search maintainer"
							autoComplete="off"
							className="pl-8"
							onChange={(event) => {
								setDraftQuery(event.target.value);
								pushQuery(event.target.value);
							}}
							placeholder="Search maintainer…"
							value={draftQuery}
						/>
					</div>
					<Input
						aria-label="Minimum reports"
						autoComplete="off"
						inputMode="numeric"
						min={0}
						onChange={(event) => {
							const raw = event.target.value;
							setDraftReports(raw === "" ? "" : Number(raw));
							pushReports(positiveOrUndefined(raw));
						}}
						placeholder="Min reports"
						type="number"
						value={draftReports}
					/>
					<Input
						aria-label="Minimum validated score"
						autoComplete="off"
						inputMode="numeric"
						min={0}
						onChange={(event) => {
							const raw = event.target.value;
							setDraftScore(raw === "" ? "" : Number(raw));
							pushScore(positiveOrUndefined(raw));
						}}
						placeholder="Min validated score"
						type="number"
						value={draftScore}
					/>
					{hasFilters ? (
						<Button onClick={clearAll} type="button" variant="ghost">
							<X data-icon="inline-start" />
							Clear
						</Button>
					) : null}
				</div>
				<ApiEndpoint endpoint={apiEndpoint} />
			</CardContent>
		</Card>
	);
}

function ApiEndpoint({ endpoint }: { endpoint: string }) {
	return (
		<div className="rounded-md border bg-muted/30 p-2.5">
			<p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
				API endpoint
			</p>
			<code className="mt-1 block break-all font-mono text-xs">{endpoint}</code>
		</div>
	);
}

function filteredEndpoint(
	path: string,
	filters: Record<string, number | string>
) {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(filters)) {
		if (emptyish(value) === undefined) {
			continue;
		}
		params.set(key, String(value));
	}
	const query = params.toString();
	return query ? `${path}?${query}` : path;
}
