import { createFileRoute } from "@tanstack/react-router";
import { Hash, LayoutGrid, Search } from "lucide-react";
import { useMemo, useState } from "react";

import type { DirectoryDashboard } from "@/actions/directory";
import { publicAppUrl } from "@/components/landing/constants";
import { AccountAvatar } from "@/components/oss/account-avatar";
import { ConfidenceBadge } from "@/components/oss/confidence-badge";
import {
	PageContainer,
	PageHeader,
	PageShell,
} from "@/components/site/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

type DirectoryFilter = "all" | "high" | "review" | "watch";
type SortKey = "score" | "recent" | "reports";

const SORT_LABELS: Record<SortKey, string> = {
	recent: "recently seen",
	reports: "most reported",
	score: "highest score",
};

const NEXT_SORT: Record<SortKey, SortKey> = {
	recent: "reports",
	reports: "score",
	score: "recent",
};

export const Route = createFileRoute("/accounts")({
	component: AccountsRoute,
	head: () => ({
		links: [{ href: `${publicAppUrl}/accounts`, rel: "canonical" }],
		meta: [
			{ title: "Account directory | OSS Protector" },
			{
				content:
					"Browse, search, and sort every flagged GitHub account. The public data behind the OSS Protector trust graph.",
				name: "description",
			},
		],
	}),
	loader: () => getDashboardFn(),
});

function matchesFilter(account: DisplayAccount, filter: DirectoryFilter) {
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

function AccountsRoute() {
	const dashboard = Route.useLoaderData() as DirectoryDashboard;
	const accounts = useMemo(
		() => dashboard.riskProfiles.map(toDisplayAccount),
		[dashboard.riskProfiles]
	);

	const [filter, setFilter] = useState<DirectoryFilter>("all");
	const [sort, setSort] = useState<SortKey>("score");
	const [query, setQuery] = useState("");
	const [view, setView] = useState<"list" | "grid">("list");

	const tally = {
		all: accounts.length,
		high: accounts.filter(
			(a) => a.status === "block" || a.status === "high_risk"
		).length,
		review: accounts.filter((a) => a.status === "review").length,
		watch: accounts.filter((a) => a.status === "watch").length,
	};

	const filtered = accounts
		.filter((account) => {
			if (
				query &&
				!(
					account.login.toLowerCase().includes(query.toLowerCase()) ||
					(account.summary ?? "").toLowerCase().includes(query.toLowerCase())
				)
			) {
				return false;
			}
			return matchesFilter(account, filter);
		})
		.sort((a, b) => {
			if (sort === "recent") {
				return b.lastSeenAt - a.lastSeenAt;
			}
			if (sort === "reports") {
				return b.reportCount - a.reportCount;
			}
			return b.score - a.score;
		});

	const tabs: { value: DirectoryFilter; label: string; count: number }[] = [
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
						<span className="font-mono text-muted-foreground text-xs">
							{tally.all.toLocaleString()} accounts indexed
						</span>
					}
					description="Every flagged account, ever. Browseable, searchable, sortable. This is the public data behind the trust graph."
					title="Account directory"
				/>

				<div className="mt-6 flex flex-wrap items-center gap-3">
					<Tabs
						onValueChange={(value) => setFilter(value as DirectoryFilter)}
						value={filter}
					>
						<TabsList>
							{tabs.map((tab) => (
								<TabsTrigger key={tab.value} value={tab.value}>
									{tab.label}
									<span
										className={cn(
											"ml-1.5 rounded-full border px-1.5 font-mono text-[10.5px] tabular-nums",
											filter === tab.value
												? "border-primary/30 bg-primary/10 text-primary"
												: "border-border bg-card text-muted-foreground"
										)}
									>
										{tab.count}
									</span>
								</TabsTrigger>
							))}
						</TabsList>
					</Tabs>
					<div className="ml-auto flex items-center gap-2">
						<div className="relative">
							<Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
							<Input
								className="h-9 w-52 pl-8"
								onChange={(event) => setQuery(event.target.value)}
								placeholder="Search handle…"
								value={query}
							/>
						</div>
						<Button
							onClick={() => setSort(NEXT_SORT[sort])}
							type="button"
							variant="ghost"
						>
							Sort: {SORT_LABELS[sort]} ↓
						</Button>
						<div className="inline-flex gap-0.5 rounded-lg border bg-muted p-0.5">
							<Button
								onClick={() => setView("list")}
								size="icon-sm"
								type="button"
								variant={view === "list" ? "secondary" : "ghost"}
							>
								<Hash />
							</Button>
							<Button
								onClick={() => setView("grid")}
								size="icon-sm"
								type="button"
								variant={view === "grid" ? "secondary" : "ghost"}
							>
								<LayoutGrid />
							</Button>
						</div>
					</div>
				</div>

				{accounts.length === 0 ? (
					<EmptyState />
				) : (
					<DirectoryResults accounts={filtered} view={view} />
				)}

				<div className="mt-8 text-center font-mono text-muted-foreground text-xs">
					Showing {filtered.length} of {tally.all}
				</div>
			</PageContainer>
		</PageShell>
	);
}

function EmptyState() {
	return (
		<div className="mt-4 rounded-2xl border bg-card p-12 text-center">
			<div className="font-medium text-lg">No accounts indexed yet</div>
			<p className="mt-1.5 text-muted-foreground text-sm">
				The directory fills as the GitHub App observes pull-request activity and
				imports public sources. Seed the local database with{" "}
				<code className="font-mono text-xs">pnpm db:seed</code> to populate it.
			</p>
		</div>
	);
}

function StatusBadge({ account }: { account: DisplayAccount }) {
	const badge = riskStatusBadge(account.status);
	return <Badge variant={badge.variant}>{badge.label}</Badge>;
}

function ReasonBadges({ codes }: { codes: DisplayAccount["reasonCodes"] }) {
	return (
		<>
			{codes.slice(0, 3).map((code) => (
				<Badge key={code} variant="outline">
					{reasonLabel(code)}
				</Badge>
			))}
		</>
	);
}

function DirectoryResults({
	accounts: list,
	view,
}: {
	accounts: DisplayAccount[];
	view: "list" | "grid";
}) {
	if (list.length === 0) {
		return (
			<div className="mt-4 rounded-2xl border bg-card p-12 text-center text-muted-foreground text-sm">
				No accounts match. Try a different filter.
			</div>
		);
	}
	if (view === "list") {
		return (
			<div className="mt-4 flex flex-col gap-2.5">
				{list.map((account) => (
					<AccountRow account={account} key={account.login} />
				))}
			</div>
		);
	}
	return (
		<div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{list.map((account) => (
				<AccountGridCard account={account} key={account.login} />
			))}
		</div>
	);
}

function AccountRow({ account }: { account: DisplayAccount }) {
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
					<StatusBadge account={account} />
					{account.importedSource ? (
						<Badge variant="secondary">imported</Badge>
					) : null}
				</div>
				<div className="mt-1.5 text-[13.5px] text-muted-foreground">
					{account.summary || "No summary on file."}
				</div>
				<div className="mt-2.5 flex flex-wrap gap-2">
					<ReasonBadges codes={account.reasonCodes} />
					<Badge variant="info">{account.prCount} PRs</Badge>
					{account.reportCount > 0 ? (
						<Badge variant="outline">{account.reportCount} reports</Badge>
					) : null}
				</div>
			</div>
			<div className="col-span-2 flex items-center justify-between sm:col-span-1 sm:flex-col sm:items-end sm:gap-2">
				<ConfidenceBadge value={account.confidence} />
				<span className="font-mono text-muted-foreground text-xs">
					{relativeTime(account.lastSeenAt)}
				</span>
			</div>
		</a>
	);
}

function AccountGridCard({ account }: { account: DisplayAccount }) {
	return (
		<a
			className="rounded-2xl border bg-card p-4.5 transition-colors hover:border-input"
			href={`/accounts/${account.login}`}
		>
			<div className="mb-2.5 flex items-center gap-2.5">
				<AccountAvatar
					avatarUrl={account.avatarUrl}
					className="size-9 text-xs"
					login={account.login}
				/>
				<div className="min-w-0 flex-1">
					<div className="truncate font-medium text-sm">@{account.login}</div>
					<div className="font-mono text-muted-foreground text-xs">
						{relativeTime(account.lastSeenAt)} · {account.prCount} PRs
					</div>
				</div>
			</div>
			<div className="flex items-center gap-2">
				<ConfidenceBadge value={account.confidence} />
				<StatusBadge account={account} />
			</div>
			<p className="mt-2.5 line-clamp-2 text-[12.5px] text-muted-foreground leading-snug">
				{account.summary || "No summary on file."}
			</p>
		</a>
	);
}
