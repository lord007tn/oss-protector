import { createFileRoute } from "@tanstack/react-router";
import {
	Activity,
	Bot,
	ExternalLink,
	Flag,
	Github,
	GitPullRequest,
	ListFilter,
	ShieldCheck,
	Trophy,
} from "lucide-react";
import { useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
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
import { getDashboardFn } from "@/functions/dashboard";
import { useDashboard } from "@/hooks/api/dashboard/use-dashboard";
import { formatShortDate } from "@/lib/time";

export const Route = createFileRoute("/")({
	component: Home,
	loader: async () => getDashboardFn(),
});

const statusFilters = ["all", "watch", "review", "block"] as const;
const githubManifestCreateUrl =
	"https://github.com/settings/apps/new?state=clankers-list";

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
	const [statusFilter, setStatusFilter] =
		useState<(typeof statusFilters)[number]>("all");
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

	const appUrl = import.meta.env.VITE_APP_URL ?? "http://localhost:3000";
	const appManifest = buildGithubAppManifest(appUrl);
	const manifest = JSON.stringify(appManifest);

	return (
		<main className="min-h-screen bg-background">
			<div className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-5 md:px-6 lg:px-8">
				<header className="grid min-w-0 gap-4 rounded-lg border bg-card p-4 md:grid-cols-[1fr_auto] md:items-center">
					<div className="min-w-0">
						<div className="flex items-center gap-2 text-muted-foreground text-sm">
							<ShieldCheck className="size-4 text-primary" />
							OSS abuse intelligence
						</div>
						<h1 className="mt-1 font-semibold text-2xl tracking-tight md:text-3xl">
							Clankers List
						</h1>
						<p className="mt-2 max-w-3xl text-muted-foreground text-sm leading-6">
							Shared GitHub signals for suspicious PR activity, maintainer bot
							reports, OpenRouter validation, and a public feed other OSS
							projects can consume.
						</p>
					</div>
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
							<ExternalLink className="size-4" />
							JSON feed
						</a>
					</div>
				</header>

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
						<TabsTrigger value="catchers">
							<Trophy className="size-4" />
							Catchers
						</TabsTrigger>
						<TabsTrigger value="integrations">
							<Github className="size-4" />
							Integration
						</TabsTrigger>
					</TabsList>

					<TabsContent className="grid min-w-0 gap-4" value="accounts">
						<Card className="rounded-lg">
							<CardHeader>
								<CardTitle>Risk feed</CardTitle>
								<CardDescription>
									{filteredProfiles.length} accounts visible with current
									filters
								</CardDescription>
							</CardHeader>
							<CardContent className="grid gap-4">
								<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
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
												{status === "all" ? "All" : RISK_STATUS_LABELS[status]}
											</Button>
										))}
									</div>
									<div className="relative w-full md:max-w-xs">
										<ListFilter className="-translate-y-1/2 absolute top-1/2 left-2.5 size-4 text-muted-foreground" />
										<Input
											className="pl-8"
											onChange={(event) => setQuery(event.target.value)}
											placeholder="Filter login, reason, source"
											value={query}
										/>
									</div>
								</div>
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Account</TableHead>
											<TableHead>Status</TableHead>
											<TableHead>Confidence</TableHead>
											<TableHead>Signals</TableHead>
											<TableHead>Last seen</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{filteredProfiles.map((profile) => (
											<TableRow key={profile.login}>
												<TableCell>
													<div className="flex items-center gap-3">
														<Avatar size="sm">
															{profile.avatarUrl ? (
																<AvatarImage
																	alt={profile.login}
																	src={profile.avatarUrl}
																/>
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
												<TableCell className="min-w-36">
													<div className="flex items-center gap-2">
														<Progress
															className="h-2 max-w-24"
															value={profile.confidence}
														/>
														<span className="tabular-nums text-xs">
															{profile.confidence}%
														</span>
													</div>
												</TableCell>
												<TableCell>
													<div className="flex flex-wrap gap-1">
														{profile.reasonCodes.slice(0, 3).map((reason) => (
															<Badge key={reason} variant="outline">
																{REASON_LABELS[reason as ReasonCode] ?? reason}
															</Badge>
														))}
													</div>
												</TableCell>
												<TableCell>
													{formatShortDate(profile.lastSeenAt)}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
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
								<div className="grid gap-3">
									{dashboard.reports.map((report) => (
										<article
											className="grid gap-2 rounded-lg border bg-muted/30 p-3"
											key={report.id}
										>
											<div className="flex flex-wrap items-center justify-between gap-2">
												<div className="flex items-center gap-2">
													<StatusBadge status={report.status} />
													<span className="font-medium text-sm">
														@{report.reporterLogin} flagged @
														{report.targetLogin}
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
												{report.aiRationale ??
													report.reasonText ??
													"Pending review"}
											</p>
										</article>
									))}
								</div>
							</CardContent>
						</Card>
					</TabsContent>

					<TabsContent className="grid gap-4" value="catchers">
						<section className="grid gap-3">
							<div className="flex items-center justify-between gap-3">
								<div>
									<h2 className="font-semibold text-lg">
										Most bots called out
									</h2>
									<p className="text-muted-foreground text-sm">
										Highest risk accounts across imports and maintainer
										reports.
									</p>
								</div>
								<Bot className="size-5 text-muted-foreground" />
							</div>
							<div className="grid gap-3 md:grid-cols-3">
								{topRiskProfiles.map((profile, index) => (
									<Card className="rounded-lg" key={profile.login}>
										<CardHeader>
											<CardTitle className="flex items-center gap-2">
												<span className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary text-sm">
													#{index + 1}
												</span>
												@{profile.login}
											</CardTitle>
											<CardDescription>
												{profile.summary ?? "Shared OSS risk signal"}
											</CardDescription>
										</CardHeader>
										<CardContent>
											<div className="flex items-end justify-between gap-3">
												<div>
													<p className="font-semibold text-3xl">
														{profile.score}
													</p>
													<p className="text-muted-foreground text-xs">
														risk score
													</p>
												</div>
												<StatusBadge status={profile.status} />
											</div>
										</CardContent>
									</Card>
								))}
							</div>
						</section>

						<section className="grid gap-3">
							<div className="flex items-center justify-between gap-3">
								<div>
									<h2 className="font-semibold text-lg">Best guards</h2>
									<p className="text-muted-foreground text-sm">
										Maintainers with the strongest validated reporting score.
									</p>
								</div>
								<Trophy className="size-5 text-muted-foreground" />
							</div>
							<div className="grid gap-3 md:grid-cols-3">
								{topCatchers.map((catcher, index) => (
									<Card className="rounded-lg" key={catcher.login}>
									<CardHeader>
										<CardTitle className="flex items-center gap-2">
											<span className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary text-sm">
												#{index + 1}
											</span>
											@{catcher.login}
										</CardTitle>
										<CardDescription>
											{catcher.validatedReports} validated of {catcher.reports}{" "}
											reports
										</CardDescription>
									</CardHeader>
									<CardContent>
										<div className="flex items-end justify-between gap-3">
											<div>
												<p className="font-semibold text-3xl">
													{catcher.score}
												</p>
												<p className="text-muted-foreground text-xs">
													guard score
												</p>
											</div>
											<Trophy className="size-8 text-chart-5" />
										</div>
									</CardContent>
								</Card>
							))}
								{topCatchers.length === 0 ? (
									<Card className="rounded-lg border-dashed md:col-span-3">
										<CardContent className="flex items-center justify-between gap-4 p-5">
											<div>
												<p className="font-medium">No guard reports yet</p>
												<p className="text-muted-foreground text-sm">
													Install the GitHub App and mention @clankers-list in
													a PR or issue comment to start the leaderboard.
												</p>
											</div>
											<ShieldCheck className="size-8 text-muted-foreground" />
										</CardContent>
									</Card>
								) : null}
							</div>
						</section>
					</TabsContent>

					<TabsContent className="grid gap-4" value="integrations">
						<div className="grid gap-4 lg:grid-cols-[1fr_420px]">
							<Card className="rounded-lg">
								<CardHeader>
									<CardTitle>GitHub App</CardTitle>
									<CardDescription>
										Webhook URL: /api/github/webhook
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
									<code className="block overflow-x-auto rounded-lg border bg-muted p-3 text-xs">
										{JSON.stringify(appManifest, null, 2)}
									</code>
								</CardContent>
							</Card>
							<Card className="rounded-lg">
								<CardHeader>
									<CardTitle>Comment command</CardTitle>
									<CardDescription>
										Maintainers can flag PR authors from the PR thread
									</CardDescription>
								</CardHeader>
								<CardContent className="grid gap-3">
									<code className="block rounded-lg border bg-muted p-3 text-sm">
										@clankers-list report bot reason: fake bounty
									</code>
									<div className="grid grid-cols-2 gap-2 text-sm">
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

function StatPill({ label, value }: { label: string; value: number }) {
	return (
		<div className="rounded-lg border bg-muted/30 p-3">
			<p className="text-muted-foreground text-xs">{label}</p>
			<p className="font-semibold text-lg">{value.toLocaleString()}</p>
		</div>
	);
}
