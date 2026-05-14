import { createFileRoute } from "@tanstack/react-router";
import {
	Activity,
	Bot,
	Braces,
	Crown,
	ExternalLink,
	Flag,
	Github,
	GitPullRequest,
	ListFilter,
	Medal,
	Search,
	ShieldCheck,
	Trophy,
	UsersRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, XAxis } from "recharts";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ReasonCode } from "@/constants/reason-codes";
import { REASON_LABELS } from "@/constants/reason-codes";
import type { RiskStatus } from "@/constants/risk-statuses";
import { RISK_STATUS_LABELS } from "@/constants/risk-statuses";
import type { GuardDashboard } from "@/data-access/guard";
import { getDashboardFn } from "@/functions/dashboard";
import { useDashboard } from "@/hooks/api/dashboard/use-dashboard";
import { formatShortDate } from "@/lib/time";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
	component: Home,
	loader: async () => getDashboardFn(),
});

type RiskProfile = GuardDashboard["riskProfiles"][number];
type Catcher = GuardDashboard["catchers"][number];
type Report = GuardDashboard["reports"][number];
type StatusFilter = (typeof statusFilters)[number];

const statusFilters = ["all", "watch", "review", "block"] as const;
const podiumRanks = [0, 1, 2] as const;
const githubManifestCreateUrl =
	"https://github.com/settings/apps/new?state=clankers-list";

const statusChartConfig = {
	accounts: {
		label: "Accounts",
	},
} satisfies ChartConfig;

const reasonChartConfig = {
	count: {
		label: "Signals",
	},
} satisfies ChartConfig;

const buildGithubAppManifest = (appUrl: string) => ({
	callback_urls: [`${appUrl}/install`],
	default_events: [
		"installation",
		"installation_repositories",
		"issue_comment",
		"pull_request",
		"pull_request_review_comment",
	],
	default_permissions: {
		contents: "read",
		issues: "write",
		pull_requests: "write",
	},
	description:
		"Shared OSS abuse intelligence for suspicious GitHub pull requests and maintainer reports.",
	hook_attributes: {
		active: true,
		url: `${appUrl}/api/github/webhook`,
	},
	name: "Clankers List",
	public: true,
	redirect_url: `${appUrl}/install`,
	setup_on_update: true,
	setup_url: `${appUrl}/install`,
	url: appUrl,
});

function Home() {
	const initialData = Route.useLoaderData();
	const dashboardQuery = useDashboard({ initialData });
	const dashboard = dashboardQuery.data ?? initialData;
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const [query, setQuery] = useState("");

	const filteredProfiles = useMemo(() => {
		const normalizedQuery = query.trim().toLowerCase();
		return dashboard.riskProfiles.filter((profile) => {
			if (statusFilter !== "all" && profile.status !== statusFilter) {
				return false;
			}
			if (!normalizedQuery) {
				return true;
			}
			const haystack = [
				profile.login,
				profile.summary,
				profile.importedSource,
				...profile.reasonCodes,
			]
				.filter(Boolean)
				.join(" ")
				.toLowerCase();
			return haystack.includes(normalizedQuery);
		});
	}, [dashboard.riskProfiles, query, statusFilter]);

	const topRiskProfiles = useMemo(
		() => dashboard.riskProfiles.slice(0, 3),
		[dashboard.riskProfiles],
	);
	const topCatchers = useMemo(
		() => dashboard.catchers.slice(0, 3),
		[dashboard.catchers],
	);
	const statusChartData = useMemo(
		() =>
			(["watch", "review", "block"] as const).map((status) => ({
				accounts: dashboard.riskProfiles.filter(
					(profile) => profile.status === status,
				).length,
				fill:
					status === "block"
						? "var(--color-destructive)"
						: status === "review"
							? "var(--color-chart-5)"
							: "var(--color-chart-2)",
				status: RISK_STATUS_LABELS[status],
			})),
		[dashboard.riskProfiles],
	);
	const reasonChartData = useMemo(() => {
		const counts = new Map<ReasonCode, number>();
		for (const profile of dashboard.riskProfiles) {
			for (const reason of profile.reasonCodes) {
				if (isReasonCode(reason)) {
					counts.set(reason, (counts.get(reason) ?? 0) + 1);
				}
			}
		}
		return [...counts.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, 5)
			.map(([reason, count], index) => ({
				count,
				fill: `var(--color-chart-${(index % 5) + 1})`,
				reason,
				shortLabel: compactReasonLabel(reason),
			}));
	}, [dashboard.riskProfiles]);

	const appUrl = import.meta.env.VITE_APP_URL ?? "http://localhost:3000";
	const appManifest = buildGithubAppManifest(appUrl);
	const manifest = JSON.stringify(appManifest);

	return (
		<main className="dark min-h-screen bg-background text-foreground">
			<div className="mx-auto grid w-full max-w-[1440px] gap-5 px-4 py-4 md:px-6 lg:px-8">
				<AppHeader appManifest={manifest} />

				<section className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
					<MetricCard
						icon={Bot}
						label="Tracked accounts"
						value={dashboard.stats.trackedUsers}
					/>
					<MetricCard
						icon={Flag}
						label="Open reports"
						value={dashboard.stats.openReports}
					/>
					<MetricCard
						icon={GitPullRequest}
						label="Tracked PRs"
						value={dashboard.stats.trackedPrs}
					/>
					<MetricCard
						icon={Activity}
						label="Signals"
						value={dashboard.stats.signals}
					/>
				</section>

				<section className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
					<Card className="overflow-hidden rounded-lg">
						<CardHeader className="pb-3">
							<div className="flex flex-wrap items-center justify-between gap-3">
								<div>
									<CardTitle className="flex items-center gap-2">
										<Crown className="size-5 text-chart-5" />
										Most bots called out
									</CardTitle>
									<CardDescription>
										Top risk scores from public imports and maintainer reports
									</CardDescription>
								</div>
								<Badge variant="outline">
									{dashboard.stats.blockedUsers} blocked
								</Badge>
							</div>
						</CardHeader>
						<CardContent>
							<RiskPodium profiles={topRiskProfiles} />
						</CardContent>
					</Card>

					<Card className="overflow-hidden rounded-lg">
						<CardHeader className="pb-3">
							<div className="flex flex-wrap items-center justify-between gap-3">
								<div>
									<CardTitle className="flex items-center gap-2">
										<Trophy className="size-5 text-chart-5" />
										Best guards
									</CardTitle>
									<CardDescription>
										Maintainers ranked by validated callouts
									</CardDescription>
								</div>
								<Badge variant="outline">
									{dashboard.catchers.length} catchers
								</Badge>
							</div>
						</CardHeader>
						<CardContent>
							<GuardPodium catchers={topCatchers} />
						</CardContent>
					</Card>
				</section>

				<section className="grid gap-4 lg:grid-cols-[1fr_1fr_360px]">
					<Card className="rounded-lg">
						<CardHeader>
							<CardTitle>Status mix</CardTitle>
							<CardDescription>Watch, review, and block queues</CardDescription>
						</CardHeader>
						<CardContent>
							<ChartContainer
								className="h-[220px] w-full"
								config={statusChartConfig}
							>
								<BarChart
									accessibilityLayer
									data={statusChartData}
									margin={{ left: 0, right: 0, top: 12 }}
								>
									<CartesianGrid vertical={false} />
									<XAxis
										axisLine={false}
										dataKey="status"
										tickLine={false}
										tickMargin={10}
									/>
									<ChartTooltip
										content={<ChartTooltipContent hideLabel />}
										cursor={false}
									/>
									<Bar dataKey="accounts" radius={[5, 5, 0, 0]}>
										{statusChartData.map((item) => (
											<Cell fill={item.fill} key={item.status} />
										))}
									</Bar>
								</BarChart>
							</ChartContainer>
						</CardContent>
					</Card>

					<Card className="rounded-lg">
						<CardHeader>
							<CardTitle>Reason mix</CardTitle>
							<CardDescription>Most common signal categories</CardDescription>
						</CardHeader>
						<CardContent>
							<ChartContainer
								className="h-[220px] w-full"
								config={reasonChartConfig}
							>
								<BarChart
									accessibilityLayer
									data={reasonChartData}
									layout="vertical"
									margin={{ bottom: 0, left: 0, right: 8, top: 4 }}
								>
									<CartesianGrid horizontal={false} />
									<XAxis axisLine={false} dataKey="count" hide type="number" />
									<ChartTooltip
										content={<ChartTooltipContent hideLabel />}
										cursor={false}
									/>
									<Bar dataKey="count" radius={[0, 5, 5, 0]}>
										{reasonChartData.map((item) => (
											<Cell fill={item.fill} key={item.reason} />
										))}
									</Bar>
								</BarChart>
							</ChartContainer>
							<div className="mt-2 grid gap-2">
								{reasonChartData.map((item) => (
									<div
										className="flex items-center justify-between gap-3 text-sm"
										key={item.reason}
									>
										<div className="flex min-w-0 items-center gap-2">
											<span
												aria-hidden
												className="size-2 rounded-sm"
												style={{ backgroundColor: item.fill }}
											/>
											<span className="truncate">
												{REASON_LABELS[item.reason] ?? item.reason}
											</span>
										</div>
										<span className="font-mono text-muted-foreground tabular-nums">
											{item.count}
										</span>
									</div>
								))}
							</div>
						</CardContent>
					</Card>

					<Card className="rounded-lg">
						<CardHeader>
							<CardTitle>Integration state</CardTitle>
							<CardDescription>Production feed and GitHub App</CardDescription>
						</CardHeader>
						<CardContent className="grid gap-3">
							<StatRow
								icon={UsersRound}
								label="Imported users"
								value={dashboard.stats.importedUsers}
							/>
							<StatRow
								icon={ShieldCheck}
								label="Review queue"
								value={dashboard.stats.reviewUsers}
							/>
							<StatRow
								icon={Github}
								label="Active repos"
								value={dashboard.stats.activeRepositories}
							/>
							<Separator />
							<div className="flex flex-wrap gap-2">
								<form action={githubManifestCreateUrl} method="post">
									<input name="manifest" type="hidden" value={manifest} />
									<Button type="submit">
										<Github className="size-4" />
										Register App
									</Button>
								</form>
								<a
									className={buttonVariants({ variant: "outline" })}
									href="/api/feed.json"
									rel="noreferrer"
									target="_blank"
								>
									<Braces className="size-4" />
									JSON feed
								</a>
							</div>
						</CardContent>
					</Card>
				</section>

				<Tabs className="min-w-0" defaultValue="accounts">
					<TabsList className="w-full justify-start overflow-x-auto rounded-lg border bg-card">
						<TabsTrigger value="accounts">
							<Bot className="size-4" />
							Accounts
						</TabsTrigger>
						<TabsTrigger value="reports">
							<Flag className="size-4" />
							Reports
						</TabsTrigger>
						<TabsTrigger value="integrations">
							<Github className="size-4" />
							Integration
						</TabsTrigger>
					</TabsList>

					<TabsContent className="grid min-w-0 gap-4" value="accounts">
						<Card className="rounded-lg">
							<CardHeader>
								<div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
									<div>
										<CardTitle>Risk feed</CardTitle>
										<CardDescription>
											{filteredProfiles.length} accounts visible with current
											filters
										</CardDescription>
									</div>
									<div className="flex flex-col gap-3 sm:flex-row sm:items-center">
										<div className="flex flex-wrap gap-2">
											{statusFilters.map((status) => (
												<Button
													key={status}
													onClick={() => setStatusFilter(status)}
													size="sm"
													type="button"
													variant={
														statusFilter === status ? "default" : "outline"
													}
												>
													{status === "all"
														? "All"
														: RISK_STATUS_LABELS[status]}
												</Button>
											))}
										</div>
										<div className="relative w-full sm:w-[280px]">
											<Search className="-translate-y-1/2 absolute top-1/2 left-2.5 size-4 text-muted-foreground" />
											<Input
												className="pl-8"
												onChange={(event) => setQuery(event.target.value)}
												placeholder="Filter login, reason, source"
												value={query}
											/>
										</div>
									</div>
								</div>
							</CardHeader>
							<CardContent>
								<ScrollArea className="h-[560px] rounded-lg border">
									<Table className="min-w-[920px]">
										<TableHeader className="sticky top-0 z-10 bg-card">
											<TableRow>
												<TableHead>Account</TableHead>
												<TableHead>Status</TableHead>
												<TableHead>Score</TableHead>
												<TableHead>Metrics</TableHead>
												<TableHead>Signals</TableHead>
												<TableHead>Last seen</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{filteredProfiles.map((profile) => (
												<RiskTableRow key={profile.login} profile={profile} />
											))}
										</TableBody>
									</Table>
								</ScrollArea>
							</CardContent>
						</Card>
					</TabsContent>

					<TabsContent className="grid gap-4" value="reports">
						<Card className="rounded-lg">
							<CardHeader>
								<CardTitle>Maintainer reports</CardTitle>
								<CardDescription>
									Command comments captured from PR conversations
								</CardDescription>
							</CardHeader>
							<CardContent>
								{dashboard.reports.length > 0 ? (
									<div className="grid gap-3">
										{dashboard.reports.map((report) => (
											<ReportItem key={report.id} report={report} />
										))}
									</div>
								) : (
									<EmptyState
										icon={ListFilter}
										title="No maintainer reports yet"
										description="@clankers-list report bot reason: fake bounty"
									/>
								)}
							</CardContent>
						</Card>
					</TabsContent>

					<TabsContent className="grid gap-4" value="integrations">
						<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
							<Card className="rounded-lg">
								<CardHeader>
									<CardTitle>GitHub App manifest</CardTitle>
									<CardDescription>
										/api/github/webhook receives installation, PR, and comment
										events
									</CardDescription>
								</CardHeader>
								<CardContent className="grid gap-3">
									<form action={githubManifestCreateUrl} method="post">
										<input name="manifest" type="hidden" value={manifest} />
										<Button type="submit">
											<Github className="size-4" />
											Register from manifest
										</Button>
									</form>
									<ScrollArea className="h-[310px] rounded-lg border bg-muted/30">
										<code className="block p-3 text-xs">
											{JSON.stringify(appManifest, null, 2)}
										</code>
									</ScrollArea>
								</CardContent>
							</Card>
							<Card className="rounded-lg">
								<CardHeader>
									<CardTitle>Maintainer command</CardTitle>
									<CardDescription>
										Mentions convert PR context into scored reports
									</CardDescription>
								</CardHeader>
								<CardContent className="grid gap-3">
									<code className="block rounded-lg border bg-muted/30 p-3 text-sm">
										@clankers-list report bot reason: fake bounty
									</code>
									<div className="grid grid-cols-2 gap-2">
										<StatPill
											label="Imported"
											value={dashboard.stats.importedUsers}
										/>
										<StatPill
											label="Review"
											value={dashboard.stats.reviewUsers}
										/>
										<StatPill
											label="Blocked"
											value={dashboard.stats.blockedUsers}
										/>
										<StatPill
											label="Repos"
											value={dashboard.stats.activeRepositories}
										/>
									</div>
								</CardContent>
							</Card>
						</div>
					</TabsContent>
				</Tabs>
			</div>
		</main>
	);
}

function AppHeader({ appManifest }: { appManifest: string }) {
	return (
		<header className="grid min-w-0 gap-4 rounded-lg border bg-card p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
			<div className="min-w-0">
				<div className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
					<ShieldCheck className="size-4 text-primary" />
					<span>OSS abuse intelligence</span>
					<Badge variant="outline">GitHub PR guard</Badge>
				</div>
				<h1 className="mt-2 font-semibold text-3xl tracking-tight">
					Clankers List
				</h1>
				<p className="mt-2 max-w-3xl text-muted-foreground text-sm leading-6">
					A shared blocklist and scoring console for suspicious open-source PR
					activity.
				</p>
			</div>
			<div className="flex flex-wrap gap-2">
				<form action={githubManifestCreateUrl} method="post">
					<input name="manifest" type="hidden" value={appManifest} />
					<Button type="submit">
						<Github className="size-4" />
						Register App
					</Button>
				</form>
				<a
					className={buttonVariants({ variant: "outline" })}
					href="/api/feed.json"
					rel="noreferrer"
					target="_blank"
				>
					<ExternalLink className="size-4" />
					JSON feed
				</a>
			</div>
		</header>
	);
}

function RiskPodium({ profiles }: { profiles: RiskProfile[] }) {
	return (
		<div className="grid items-end gap-3 md:grid-cols-3">
			{podiumRanks.map((profileIndex) => {
				const profile = profiles[profileIndex];
				if (!profile) {
					return null;
				}
				return (
					<RiskPodiumCard
						key={profile.login}
						profile={profile}
						rank={(profileIndex + 1) as 1 | 2 | 3}
					/>
				);
			})}
		</div>
	);
}

function GuardPodium({ catchers }: { catchers: Catcher[] }) {
	return (
		<div className="grid items-end gap-3 md:grid-cols-3 xl:grid-cols-1">
			{podiumRanks.map((catcherIndex) => (
				<GuardPodiumCard
					catcher={catchers[catcherIndex]}
					key={catchers[catcherIndex]?.login ?? `empty-${catcherIndex}`}
					rank={(catcherIndex + 1) as 1 | 2 | 3}
				/>
			))}
		</div>
	);
}

function RiskPodiumCard({
	profile,
	rank,
}: {
	profile: RiskProfile;
	rank: 1 | 2 | 3;
}) {
	return (
		<div
			className={cn(
				"grid rounded-lg border bg-muted/30 p-4",
				rank === 1 &&
					"order-1 min-h-[324px] border-chart-5/60 bg-chart-5/10 md:order-2",
				rank === 2 &&
					"order-2 min-h-[286px] border-chart-2/50 bg-chart-2/10 md:order-1",
				rank === 3 && "order-3 min-h-[254px] border-chart-3/50 bg-chart-3/10",
			)}
		>
			<div className="flex items-start justify-between gap-3">
				<RankBadge rank={rank} />
				<StatusBadge status={profile.status} />
			</div>
			<div className="mt-4 flex items-center gap-3">
				<Avatar className="size-14" size="lg">
					{profile.avatarUrl ? (
						<AvatarImage alt={profile.login} src={profile.avatarUrl} />
					) : null}
					<AvatarFallback>
						{profile.login.slice(0, 2).toUpperCase()}
					</AvatarFallback>
				</Avatar>
				<div className="min-w-0">
					<a
						className="block truncate font-semibold hover:underline"
						href={profile.htmlUrl ?? "#"}
						rel="noreferrer"
						target="_blank"
					>
						@{profile.login}
					</a>
					<p className="text-muted-foreground text-xs">
						{profile.reasonCodes[0]
							? reasonLabel(profile.reasonCodes[0])
							: "Shared risk signal"}
					</p>
				</div>
			</div>
			<div className="mt-5">
				<div className="flex items-end justify-between gap-3">
					<div>
						<p className="font-semibold text-4xl tabular-nums">
							{profile.score}
						</p>
						<p className="text-muted-foreground text-xs">risk score</p>
					</div>
					<div className="text-right">
						<p className="font-mono text-sm tabular-nums">
							{profile.confidence}%
						</p>
						<p className="text-muted-foreground text-xs">confidence</p>
					</div>
				</div>
				<Progress className="mt-3 h-2" value={profile.confidence} />
			</div>
			<div className="mt-5 grid grid-cols-3 gap-2">
				<MiniMetric label="PRs" value={profile.prCount} />
				<MiniMetric label="Commits" value={profile.commitCount} />
				<MiniMetric label="Reports" value={profile.reportCount} />
			</div>
		</div>
	);
}

function GuardPodiumCard({
	catcher,
	rank,
}: {
	catcher?: Catcher;
	rank: 1 | 2 | 3;
}) {
	return (
		<div
			className={cn(
				"grid gap-3 rounded-lg border bg-muted/30 p-4",
				rank === 1 && "border-chart-5/60 bg-chart-5/10",
				rank === 2 && "border-chart-2/50 bg-chart-2/10",
				rank === 3 && "border-chart-3/50 bg-chart-3/10",
			)}
		>
			<div className="flex items-start justify-between gap-3">
				<RankBadge rank={rank} />
				<Trophy className="size-5 text-chart-5" />
			</div>
			{catcher ? (
				<>
					<div>
						<p className="truncate font-semibold">@{catcher.login}</p>
						<p className="text-muted-foreground text-xs">
							{catcher.validatedReports} validated of {catcher.reports} reports
						</p>
					</div>
					<div className="flex items-end justify-between gap-3">
						<div>
							<p className="font-semibold text-3xl tabular-nums">
								{catcher.score}
							</p>
							<p className="text-muted-foreground text-xs">guard score</p>
						</div>
						<Medal className="size-8 text-chart-5" />
					</div>
				</>
			) : (
				<div>
					<p className="font-medium">Open guard slot</p>
					<p className="mt-1 text-muted-foreground text-xs">
						First validated callouts will appear here.
					</p>
				</div>
			)}
		</div>
	);
}

function RiskTableRow({ profile }: { profile: RiskProfile }) {
	return (
		<TableRow>
			<TableCell>
				<div className="flex items-center gap-3">
					<Avatar size="sm">
						{profile.avatarUrl ? (
							<AvatarImage alt={profile.login} src={profile.avatarUrl} />
						) : null}
						<AvatarFallback>
							{profile.login.slice(0, 2).toUpperCase()}
						</AvatarFallback>
					</Avatar>
					<div className="min-w-0">
						<a
							className="font-medium text-sm hover:underline"
							href={profile.htmlUrl ?? "#"}
							rel="noreferrer"
							target="_blank"
						>
							@{profile.login}
						</a>
						<p className="max-w-md truncate text-muted-foreground text-xs">
							{profile.summary ?? "No summary yet"}
						</p>
					</div>
				</div>
			</TableCell>
			<TableCell>
				<StatusBadge status={profile.status} />
			</TableCell>
			<TableCell className="min-w-40">
				<div className="flex items-center gap-2">
					<Progress className="h-2 max-w-24" value={profile.confidence} />
					<span className="font-mono text-xs tabular-nums">
						{profile.score}
					</span>
				</div>
			</TableCell>
			<TableCell>
				<div className="grid grid-cols-3 gap-1 text-xs">
					<CompactMetric label="PR" value={profile.prCount} />
					<CompactMetric label="CM" value={profile.commitCount} />
					<CompactMetric label="RP" value={profile.reportCount} />
				</div>
			</TableCell>
			<TableCell>
				<div className="flex max-w-[320px] flex-wrap gap-1">
					{profile.reasonCodes.slice(0, 3).map((reason) => (
						<Badge key={reason} variant="outline">
							{reasonLabel(reason)}
						</Badge>
					))}
				</div>
			</TableCell>
			<TableCell>{formatShortDate(profile.lastSeenAt)}</TableCell>
		</TableRow>
	);
}

function ReportItem({ report }: { report: Report }) {
	return (
		<article className="grid gap-2 rounded-lg border bg-muted/30 p-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<StatusBadge status={report.status} />
					<span className="font-medium text-sm">
						@{report.reporterLogin} flagged @{report.targetLogin}
					</span>
				</div>
				<a
					className="inline-flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
					href={report.sourceUrl}
					rel="noreferrer"
					target="_blank"
				>
					Source
					<ExternalLink className="size-3" />
				</a>
			</div>
			<p className="text-muted-foreground text-sm">
				{report.aiRationale ?? report.reasonText ?? "Pending review"}
			</p>
		</article>
	);
}

function MetricCard({
	icon: Icon,
	label,
	value,
}: {
	icon: typeof Bot;
	label: string;
	value: number;
}) {
	return (
		<Card className="rounded-lg">
			<CardContent className="flex items-center justify-between gap-3">
				<div>
					<p className="text-muted-foreground text-sm">{label}</p>
					<p className="font-semibold text-3xl tabular-nums">
						{value.toLocaleString()}
					</p>
				</div>
				<span className="grid size-9 place-items-center rounded-md bg-primary/10 text-primary">
					<Icon className="size-5" />
				</span>
			</CardContent>
		</Card>
	);
}

function StatusBadge({ status }: { status: RiskStatus | string }) {
	const variant =
		status === "block"
			? "destructive"
			: status === "review" || status === "needs_review"
				? "secondary"
				: "outline";
	const label =
		status in RISK_STATUS_LABELS
			? RISK_STATUS_LABELS[status as RiskStatus]
			: String(status).replaceAll("_", " ");
	return <Badge variant={variant}>{label}</Badge>;
}

function RankBadge({ rank }: { rank: 1 | 2 | 3 }) {
	return (
		<Badge
			className={cn(
				"h-7 rounded-md px-2 font-mono text-sm",
				rank === 1 && "border-chart-5/50 bg-chart-5/15 text-chart-5",
				rank === 2 && "border-chart-2/50 bg-chart-2/15 text-chart-2",
				rank === 3 && "border-chart-3/50 bg-chart-3/15 text-chart-3",
			)}
			variant="outline"
		>
			#{rank}
		</Badge>
	);
}

function StatPill({ label, value }: { label: string; value: number }) {
	return (
		<div className="rounded-lg border bg-muted/30 p-3">
			<p className="text-muted-foreground text-xs">{label}</p>
			<p className="font-semibold text-lg">{value.toLocaleString()}</p>
		</div>
	);
}

function StatRow({
	icon: Icon,
	label,
	value,
}: {
	icon: typeof Bot;
	label: string;
	value: number;
}) {
	return (
		<div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
			<div className="flex min-w-0 items-center gap-2">
				<Icon className="size-4 text-muted-foreground" />
				<span className="truncate text-sm">{label}</span>
			</div>
			<span className="font-mono text-sm tabular-nums">
				{value.toLocaleString()}
			</span>
		</div>
	);
}

function MiniMetric({ label, value }: { label: string; value: number }) {
	return (
		<div className="rounded-md border bg-background/40 p-2">
			<p className="font-mono text-sm tabular-nums">{value.toLocaleString()}</p>
			<p className="text-muted-foreground text-[11px]">{label}</p>
		</div>
	);
}

function CompactMetric({ label, value }: { label: string; value: number }) {
	return (
		<div className="rounded-md border bg-muted/30 px-2 py-1">
			<span className="text-muted-foreground">{label}</span>{" "}
			<span className="font-mono tabular-nums">{value.toLocaleString()}</span>
		</div>
	);
}

function EmptyState({
	icon: Icon,
	title,
	description,
}: {
	description: string;
	icon: typeof Bot;
	title: string;
}) {
	return (
		<div className="flex items-center justify-between gap-4 rounded-lg border border-dashed bg-muted/20 p-5">
			<div>
				<p className="font-medium">{title}</p>
				<p className="mt-1 font-mono text-muted-foreground text-sm">
					{description}
				</p>
			</div>
			<Icon className="size-8 text-muted-foreground" />
		</div>
	);
}

function compactReasonLabel(reason: ReasonCode) {
	const label = REASON_LABELS[reason] ?? reason;
	return label.length > 14 ? `${label.slice(0, 13)}.` : label;
}

function isReasonCode(reason: string): reason is ReasonCode {
	return reason in REASON_LABELS;
}

function reasonLabel(reason: string) {
	return isReasonCode(reason) ? REASON_LABELS[reason] : reason;
}
