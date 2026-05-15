import { Search } from "lucide-react";

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
import type { ClankerStatusFilter } from "@/data-access/directory-filters";

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

export function ClankerFilters({ search }: { search: ClankerSearchState }) {
	const apiEndpoint = filteredEndpoint("/api/clankers", {
		min_score: search.min_score,
		q: search.q,
		reason: search.reason,
		status: search.status,
	});

	return (
		<Card className="rounded-lg">
			<CardHeader>
				<CardTitle>Filter clankers</CardTitle>
				<CardDescription>
					The page and API accept the same query filters.
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-4">
				<form action="/clankers" className="grid gap-3 lg:grid-cols-5">
					<Input
						aria-label="Search clanker login or summary"
						autoComplete="off"
						defaultValue={search.q}
						name="q"
						placeholder="Search login or summary…"
					/>
					<select
						aria-label="Filter by clanker status"
						className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
						defaultValue={search.status}
						name="status"
					>
						{clankerStatuses.map((status) => (
							<option key={status} value={status}>
								{status === "all" ? "All statuses" : RISK_STATUS_LABELS[status]}
							</option>
						))}
					</select>
					<select
						aria-label="Filter by clanker reason"
						className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
						defaultValue={search.reason}
						name="reason"
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
						defaultValue={search.min_score || ""}
						inputMode="numeric"
						min={0}
						name="min_score"
						placeholder="Min score…"
						type="number"
					/>
					<Button type="submit">
						<Search data-icon="inline-start" />
						Apply
					</Button>
				</form>
				<ApiEndpoint endpoint={apiEndpoint} />
			</CardContent>
		</Card>
	);
}

export function ProtectorFilters({ search }: { search: ProtectorSearchState }) {
	const apiEndpoint = filteredEndpoint("/api/protectors", {
		min_reports: search.min_reports,
		min_score: search.min_score,
		q: search.q,
	});

	return (
		<Card className="rounded-lg">
			<CardHeader>
				<CardTitle>Filter review signals</CardTitle>
				<CardDescription>
					Query maintainers by review signal count or validated score.
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-4">
				<form action="/protectors" className="grid gap-3 md:grid-cols-4">
					<Input
						aria-label="Search maintainer"
						autoComplete="off"
						defaultValue={search.q}
						name="q"
						placeholder="Search maintainer…"
					/>
					<Input
						aria-label="Minimum reports"
						autoComplete="off"
						defaultValue={search.min_reports || ""}
						inputMode="numeric"
						min={0}
						name="min_reports"
						placeholder="Min reports…"
						type="number"
					/>
					<Input
						aria-label="Minimum validated score"
						autoComplete="off"
						defaultValue={search.min_score || ""}
						inputMode="numeric"
						min={0}
						name="min_score"
						placeholder="Min validated score…"
						type="number"
					/>
					<Button type="submit">
						<Search data-icon="inline-start" />
						Apply
					</Button>
				</form>
				<ApiEndpoint endpoint={apiEndpoint} />
			</CardContent>
		</Card>
	);
}

function ApiEndpoint({ endpoint }: { endpoint: string }) {
	return (
		<div className="rounded-lg border bg-muted/35 p-3">
			<p className="text-muted-foreground text-xs">API endpoint</p>
			<code className="mt-1 block break-all text-sm">{endpoint}</code>
		</div>
	);
}

function filteredEndpoint(
	path: string,
	filters: Record<string, number | string>
) {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(filters)) {
		if (value === "" || value === 0 || value === "all") {
			continue;
		}
		params.set(key, String(value));
	}
	const query = params.toString();
	return query ? `${path}?${query}` : path;
}
