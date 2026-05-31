import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useMemo } from "react";

import type { DirectoryDashboard } from "@/actions/directory";
import { AccountAvatar } from "@/components/oss/account-avatar";
import { ConfidenceBadge } from "@/components/oss/confidence-badge";
import {
	PageContainer,
	PageHeader,
	PageShell,
} from "@/components/site/page-shell";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getDashboardFn } from "@/functions/dashboard";
import {
	type DisplayAccount,
	reasonLabel,
	relativeTime,
	riskStatusBadge,
	toDisplayAccount,
} from "@/lib/directory-view";
import { buildSharedHead } from "@/lib/head";

type FeedFilter = "all" | "high" | "review" | "watch";
interface FeedSearch {
	q: string;
	status: FeedFilter;
}

const FEED_FILTERS: readonly FeedFilter[] = ["all", "high", "review", "watch"];
const DEFAULT_FEED_SEARCH: FeedSearch = { q: "", status: "all" };

export const Route = createFileRoute("/feed")({
	validateSearch: (search: Record<string, unknown>): FeedSearch => ({
		q: typeof search.q === "string" ? search.q : "",
		status: FEED_FILTERS.includes(search.status as FeedFilter)
			? (search.status as FeedFilter)
			: "all",
	}),
	loader: () => getDashboardFn(),
	head: () =>
		buildSharedHead({
			description:
				"Every flag OSS Protector makes — public, auditable, and disputable.",
			path: "/feed",
			title: "Public review feed | OSS Protector",
		}),
	// Keep the active filter + search in the URL so a filtered feed is shareable
	// and survives a refresh; defaults are stripped to keep /feed clean.
	search: {
		middlewares: [stripSearchParams(DEFAULT_FEED_SEARCH)],
	},
	component: FeedRoute,
});

function matchesFilter(account: DisplayAccount, filter: FeedFilter) {
	if (filter === "high") {
		return account.status === "block" || account.status === "high_risk";
	}
	if (filter === "review") {
		return account.status === "review";
	}
	if (filter === "watch") {
		return account.status === "watch";
	}
	return true;
}

function FeedRoute() {
	const dashboard = Route.useLoaderData() as DirectoryDashboard;
	const accounts = useMemo(
		() =>
			dashboard.riskProfiles
				.map(toDisplayAccount)
				.sort((a, b) => b.lastSeenAt - a.lastSeenAt),
		[dashboard.riskProfiles]
	);

	const { q: query, status: filter } = Route.useSearch();
	const navigate = Route.useNavigate();
	const setFilter = (status: FeedFilter) =>
		navigate({ replace: true, search: (prev) => ({ ...prev, status }) });
	const setQuery = (value: string) =>
		navigate({ replace: true, search: (prev) => ({ ...prev, q: value }) });

	// Counts come from dashboard.stats (a full-table aggregate), not the loaded
	// list — the list is capped server-side so the directory render stays under
	// the Worker resource limit, but the tallies must still reflect every account.
	const tally = {
		all: dashboard.stats.trackedUsers,
		high: dashboard.stats.blockedUsers + dashboard.stats.highRiskUsers,
		review: dashboard.stats.reviewUsers,
		watch: dashboard.stats.watchUsers,
	};

	const filtered = accounts.filter((account) => {
		if (query && !account.login.toLowerCase().includes(query.toLowerCase())) {
			return false;
		}
		return matchesFilter(account, filter);
	});

	const tabs: { value: FeedFilter; label: string; count: number }[] = [
		{ count: tally.all, label: "All", value: "all" },
		{ count: tally.high, label: "High risk", value: "high" },
		{ count: tally.review, label: "Review", value: "review" },
		{ count: tally.watch, label: "Watch", value: "watch" },
	];

	return (
		<PageShell>
			<PageContainer className="py-9">
				<PageHeader
					actions={
						<div className="flex items-center gap-2">
							<span className="pulse-ring inline-block size-1.5 rounded-full bg-success" />
							<span className="font-mono text-muted-foreground text-xs">
								{dashboard.stats.trackedUsers} flagged accounts
							</span>
						</div>
					}
					description="Every account we flag, ordered by most recent activity. Public, auditable, and disputable. Click any account to see the full evidence chain."
					title="Public review feed"
				/>

				<div className="mt-6 flex flex-wrap items-center gap-3">
					<Tabs
						onValueChange={(value) => setFilter(value as FeedFilter)}
						value={filter}
					>
						<TabsList>
							{tabs.map((tab) => (
								<TabsTrigger key={tab.value} value={tab.value}>
									{tab.label}
									<Badge
										className="ml-1.5"
										size="tag"
										variant={filter === tab.value ? "primary" : "outline"}
									>
										{tab.count}
									</Badge>
								</TabsTrigger>
							))}
						</TabsList>
					</Tabs>
					<div className="ml-auto flex items-center gap-2">
						<div className="relative">
							<Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
							<Input
								className="w-64 pl-8"
								onChange={(event) => setQuery(event.target.value)}
								placeholder="Search account…"
								size="md"
								value={query}
							/>
						</div>
					</div>
				</div>

				<div className="mt-4 flex flex-col gap-2.5">
					<FeedBody accounts={filtered} total={accounts.length} />
				</div>
			</PageContainer>
		</PageShell>
	);
}

function FeedBody({
	accounts,
	total,
}: {
	accounts: DisplayAccount[];
	total: number;
}) {
	if (total === 0) {
		return (
			<Empty className="py-16">
				<EmptyHeader>
					<EmptyDescription>
						No flags yet. The feed fills as the app observes activity — seed the
						local database with{" "}
						<code className="font-mono text-xs">pnpm db:seed</code>.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}
	if (accounts.length === 0) {
		return (
			<Empty className="py-16">
				<EmptyHeader>
					<EmptyDescription>
						No flags match your filter. Try widening the criteria.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}
	return (
		<>
			{accounts.map((account) => (
				<FeedCard account={account} key={account.login} />
			))}
		</>
	);
}

function FeedCard({ account }: { account: DisplayAccount }) {
	const status = riskStatusBadge(account.status);
	return (
		<a
			className="grid grid-cols-[44px_1fr] items-start gap-3.5 rounded-2xl border bg-card p-5 transition-colors hover:border-input sm:grid-cols-[44px_1fr_auto]"
			href={`/accounts/${account.login}`}
		>
			<AccountAvatar
				avatarUrl={account.avatarUrl}
				className="size-11 text-sm"
				login={account.login}
			/>
			<div className="min-w-0">
				<div className="flex flex-wrap items-center gap-2">
					<span className="font-medium text-[15px]">@{account.login}</span>
					<Badge variant={status.variant}>{status.label}</Badge>
					{account.importedSource ? (
						<Badge variant="secondary">imported</Badge>
					) : null}
				</div>
				<div className="mt-1.5 text-[14px] text-muted-foreground">
					{account.summary || "No summary on file."}
				</div>
				<div className="mt-2.5 flex flex-wrap gap-2">
					{account.reasonCodes.slice(0, 3).map((code) => (
						<Badge key={code} variant="outline">
							{reasonLabel(code)}
						</Badge>
					))}
					<Badge variant="info">{account.prCount} PRs</Badge>
				</div>
			</div>
			<div className="col-span-2 flex items-center justify-between sm:col-span-1 sm:flex-col sm:items-end sm:gap-2">
				<span className="font-mono text-muted-foreground text-xs">
					{relativeTime(account.lastSeenAt)}
				</span>
				<ConfidenceBadge value={account.confidence} />
			</div>
		</a>
	);
}
