import { useDebouncedCallback } from "@tanstack/react-pacer";
import { useNavigate } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MAX_RISK_SCORE } from "@/constants/risk-statuses";

interface ProtectorSearchState {
	min_reports: number;
	min_score: number;
	q: string;
}

const DEBOUNCE_MS = 350;
const MAX_MIN_REPORTS = 500;

const emptyish = (value: number | string) =>
	value === "" || value === 0 || value === "all" ? undefined : value;

const boundedDraftValue = (raw: string, max: number): number | "" => {
	if (raw === "") {
		return "";
	}
	const parsed = Number(raw);
	if (!Number.isFinite(parsed)) {
		return "";
	}
	return Math.max(0, Math.min(max, Math.round(parsed)));
};

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
		<Card variant="subtle">
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
						max={MAX_MIN_REPORTS}
						min={0}
						onChange={(event) => {
							const raw = event.target.value;
							const value = boundedDraftValue(raw, MAX_MIN_REPORTS);
							setDraftReports(value);
							pushReports(value === "" || value === 0 ? undefined : value);
						}}
						placeholder="Min reports"
						type="number"
						value={draftReports}
					/>
					<Input
						aria-label="Minimum validated score"
						autoComplete="off"
						inputMode="numeric"
						max={MAX_RISK_SCORE}
						min={0}
						onChange={(event) => {
							const raw = event.target.value;
							const value = boundedDraftValue(raw, MAX_RISK_SCORE);
							setDraftScore(value);
							pushScore(value === "" || value === 0 ? undefined : value);
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
		<Card size="sm">
			<CardContent>
				<CardDescription className="mb-1 text-xs uppercase tracking-wide">
					API endpoint
				</CardDescription>
				<code className="block break-all font-mono text-xs">{endpoint}</code>
			</CardContent>
		</Card>
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
