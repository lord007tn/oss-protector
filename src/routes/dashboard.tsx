import { createFileRoute } from "@tanstack/react-router";
import {
	Activity,
	Check,
	ChevronRight,
	Gavel,
	Github,
	Hash,
	Inbox,
	Loader2,
	RotateCcw,
	Settings,
	Shield,
	Trash2,
	User,
	X,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import { RepoPolicyView } from "@/components/dashboard/repo-policy-view";
import { AccountAvatar } from "@/components/oss/account-avatar";
import { ConfidenceBadge } from "@/components/oss/confidence-badge";
import {
	PageContainer,
	PageHeader,
	PageShell,
} from "@/components/site/page-shell";
import { SignInGate } from "@/components/site/sign-in-gate";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { REPORT_STATUS_LABELS } from "@/constants/report-statuses";
import type { AppealReviewItem } from "@/data-access/appeals";
import type {
	DashboardActivityItem,
	DashboardAllowEntry,
	DashboardQueueItem,
	DashboardRepo,
	MaintainerDashboard,
} from "@/data-access/maintainer-dashboard";
import type {
	RepoDecisionKind,
	RepoDecisionRow,
} from "@/data-access/repo-decisions";
import { reasonLabel, relativeTime } from "@/lib/directory-view";
import { repoShortName } from "@/lib/oss";
import { useMaintainerDashboard } from "@/lib/use-maintainer-dashboard";
import { useSessionState } from "@/lib/use-session-state";
import { cn } from "@/lib/utils";

type DashTab =
	| "activity"
	| "allow"
	| "appeals"
	| "coverage"
	| "inbox"
	| "overrides"
	| "policy";
type Decision = "allow" | "confirm" | "dismiss" | "reset";
type QueueDecision = Exclude<Decision, "reset">;
type StatusVariant = "destructive" | "info" | "success" | "warning";

const EMPTY_DASHBOARD: MaintainerDashboard = {
	activity: [],
	allowlist: [],
	appeals: [],
	queue: [],
	repoOverrides: [],
	repos: [],
	stats: {
		allowedCount: 0,
		appealCount: 0,
		blockedCount: 0,
		overrideCount: 0,
		queueCount: 0,
		repoCount: 0,
	},
};

export const Route = createFileRoute("/dashboard")({
	component: DashboardRoute,
	head: () => ({
		meta: [{ title: "Dashboard | OSS Protector" }],
	}),
});

function statusVariant(status: string): StatusVariant {
	if (status === "validated") {
		return "destructive";
	}
	if (status === "dismissed") {
		return "success";
	}
	if (status === "needs_review") {
		return "warning";
	}
	return "info";
}

function DashboardRoute() {
	const { signedIn } = useSessionState();
	if (!signedIn) {
		return (
			<PageShell>
				<SignInGate />
			</PageShell>
		);
	}
	return (
		<PageShell authed consoleLabel="Maintainer console">
			<DashboardContent />
		</PageShell>
	);
}

function DashboardContent() {
	const { session, signedIn } = useSessionState();
	const { dashboard, error, loading, refresh } =
		useMaintainerDashboard(signedIn);
	const [active, setActive] = useState<DashTab>("inbox");
	const [pendingLogin, setPendingLogin] = useState<null | string>(null);
	const [pendingAppealId, setPendingAppealId] = useState<null | string>(null);

	const who =
		session?.user?.name?.trim() || session?.user?.email || "@maintainer";

	const decide = async (login: string, decision: Decision) => {
		setPendingLogin(login);
		try {
			const response = await fetch("/api/maintainer/decision", {
				body: JSON.stringify({ decision, login }),
				headers: { "Content-Type": "application/json" },
				method: "POST",
			});
			const data = (await response.json()) as {
				error?: string;
				status?: null | string;
			};
			if (!response.ok) {
				toast.error(data.error ?? "Action failed.");
				return;
			}
			toast.success(`@${login} → ${data.status ?? decision}.`);
			await refresh();
		} catch {
			toast.error("Network error — try again.");
		} finally {
			setPendingLogin(null);
		}
	};

	const resolve = async (id: string, resolution: "reject" | "uphold") => {
		setPendingAppealId(id);
		try {
			const response = await fetch("/api/appeals/resolve", {
				body: JSON.stringify({ id, resolution }),
				headers: { "Content-Type": "application/json" },
				method: "POST",
			});
			const data = (await response.json()) as {
				error?: string;
				status?: string;
			};
			if (!response.ok) {
				toast.error(data.error ?? "Action failed.");
				return;
			}
			toast.success(`Appeal ${data.status ?? resolution}.`);
			await refresh();
		} catch {
			toast.error("Network error — try again.");
		} finally {
			setPendingAppealId(null);
		}
	};

	if (loading && !dashboard) {
		return (
			<PageContainer className="py-9">
				<Card>
					<CardContent className="p-12 text-center text-muted-foreground text-sm">
						Loading your console…
					</CardContent>
				</Card>
			</PageContainer>
		);
	}

	if (error && !dashboard) {
		return (
			<PageContainer className="py-9">
				<Alert variant="destructive">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			</PageContainer>
		);
	}

	const data = dashboard ?? EMPTY_DASHBOARD;

	if (data.repos.length === 0 && data.appeals.length === 0) {
		return (
			<PageContainer className="py-9">
				<PageHeader
					description={
						<>
							Signed in as{" "}
							<span className="font-mono text-foreground">{who}</span>.
						</>
					}
					title="Your dashboard"
				/>
				<EmptyConsole />
			</PageContainer>
		);
	}

	const nav: { count: string; icon: ReactNode; key: DashTab; label: string }[] =
		[
			{
				count: String(data.stats.queueCount),
				icon: <Inbox className="size-3.5" />,
				key: "inbox",
				label: "Review queue",
			},
			{
				count: String(data.stats.appealCount),
				icon: <Gavel className="size-3.5" />,
				key: "appeals",
				label: "Appeals",
			},
			{
				count: String(data.activity.length),
				icon: <Activity className="size-3.5" />,
				key: "activity",
				label: "Audit log",
			},
			{
				count: String(data.stats.repoCount),
				icon: <Shield className="size-3.5" />,
				key: "coverage",
				label: "Coverage",
			},
			{
				count: String(data.stats.allowedCount),
				icon: <User className="size-3.5" />,
				key: "allow",
				label: "Allowlist",
			},
			{
				count: String(data.stats.overrideCount),
				icon: <Hash className="size-3.5" />,
				key: "overrides",
				label: "Repo overrides",
			},
			{
				count: "—",
				icon: <Settings className="size-3.5" />,
				key: "policy",
				label: "Repo policy",
			},
		];

	return (
		<PageContainer className="py-9">
			<PageHeader
				description={
					<>
						Signed in as{" "}
						<span className="font-mono text-foreground">{who}</span>. Protecting{" "}
						{data.stats.repoCount}{" "}
						{data.stats.repoCount === 1 ? "repository" : "repositories"}.
					</>
				}
				title="Your dashboard"
			/>

			<div className="mt-6 grid gap-6 lg:grid-cols-[240px_1fr]">
				<Card className="sticky top-20 hidden h-fit p-3 lg:block">
					{nav.map((item) => (
						<Button
							className="w-full justify-start gap-2.5"
							key={item.key}
							onClick={() => setActive(item.key)}
							type="button"
							variant={active === item.key ? "secondary" : "ghost"}
						>
							<span className="text-muted-foreground">{item.icon}</span>
							<span className="flex-1 text-left">{item.label}</span>
							<span className="font-mono text-muted-foreground text-xs">
								{item.count}
							</span>
						</Button>
					))}
					<div className="mt-3 mb-1.5 px-2.5 font-mono text-[11px] text-muted-foreground uppercase tracking-[0.07em]">
						Your repos
					</div>
					{data.repos.map((repo) => (
						<div
							className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-muted-foreground"
							key={repo.id}
						>
							<Hash className="size-3" />
							<span className="flex-1 truncate text-[12.5px]">
								{repoShortName(repo.fullName)}
							</span>
							<span className="font-mono text-muted-foreground text-xs">
								{repo.flaggedCount}
							</span>
						</div>
					))}
				</Card>

				<div>
					<div className="mb-5 flex flex-wrap gap-1 lg:hidden">
						{nav.map((item) => (
							<Button
								key={item.key}
								onClick={() => setActive(item.key)}
								size="sm"
								type="button"
								variant={active === item.key ? "secondary" : "ghost"}
							>
								{item.label}
							</Button>
						))}
					</div>

					{active === "inbox" ? (
						<InboxView
							data={data}
							onDecide={decide}
							pendingLogin={pendingLogin}
						/>
					) : null}
					{active === "appeals" ? (
						<AppealsView
							items={data.appeals}
							onResolve={resolve}
							pendingId={pendingAppealId}
						/>
					) : null}
					{active === "activity" ? (
						<ActivityView items={data.activity} />
					) : null}
					{active === "coverage" ? <CoverageView repos={data.repos} /> : null}
					{active === "allow" ? (
						<AllowlistView
							entries={data.allowlist}
							onReset={(login) => decide(login, "reset")}
							pendingLogin={pendingLogin}
						/>
					) : null}
					{active === "overrides" ? (
						<OverridesView
							onChange={refresh}
							overrides={data.repoOverrides}
							repos={data.repos}
						/>
					) : null}
					{active === "policy" ? <RepoPolicyView repos={data.repos} /> : null}

					<InstallCta />
				</div>
			</div>
		</PageContainer>
	);
}

function StatCard({
	hint,
	label,
	value,
}: {
	hint?: string;
	label: string;
	value: string;
}) {
	return (
		<Card className="p-5">
			<div className="font-mono text-muted-foreground text-xs uppercase tracking-[0.06em]">
				{label}
			</div>
			<div className="mt-2 font-medium text-3xl tabular-nums tracking-tight">
				{value}
			</div>
			{hint ? (
				<div className="mt-1.5 font-mono text-muted-foreground text-xs">
					{hint}
				</div>
			) : null}
		</Card>
	);
}

function EmptyConsole() {
	return (
		<Empty className="mt-6">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<Shield />
				</EmptyMedia>
				<EmptyTitle>No repositories yet</EmptyTitle>
				<EmptyDescription>
					Install OSS Protector on a repository or organization you maintain.
					Once the install is linked to your account, your review queue,
					coverage, and allowlist show up here.
				</EmptyDescription>
			</EmptyHeader>
			<a className={buttonVariants()} href="/install">
				<Github data-icon="inline-start" />
				Install OSS Protector
			</a>
		</Empty>
	);
}

function InstallCta() {
	return (
		<Alert
			className="mt-6 flex flex-wrap items-center gap-4 p-5"
			variant="primary"
		>
			<div className="flex-1">
				<AlertTitle>Want this everywhere you maintain?</AlertTitle>
				<AlertDescription className="mt-1">
					OSS Protector is free to install on any repo or org. The trust graph
					grows with every maintainer who joins.
				</AlertDescription>
			</div>
			<a className={buttonVariants()} href="/install">
				<Github data-icon="inline-start" />
				Add another repo
			</a>
		</Alert>
	);
}

function InboxView({
	data,
	onDecide,
	pendingLogin,
}: {
	data: MaintainerDashboard;
	onDecide: (login: string, decision: QueueDecision) => void;
	pendingLogin: null | string;
}) {
	const [sortMode, setSortMode] = useState<"conf" | "time">("conf");
	const sorted = [...data.queue].sort((a, b) =>
		sortMode === "conf"
			? b.confidence - a.confidence
			: b.createdAt - a.createdAt
	);

	return (
		<>
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<StatCard
					label="In review queue"
					value={String(data.stats.queueCount)}
				/>
				<StatCard label="Blocked" value={String(data.stats.blockedCount)} />
				<StatCard label="Allowlisted" value={String(data.stats.allowedCount)} />
				<StatCard label="Repositories" value={String(data.stats.repoCount)} />
			</div>

			<Card className="mt-5 p-5">
				<div className="mb-4 font-medium text-[15px]">Repo coverage</div>
				{data.repos.map((repo) => (
					<CoverageBar key={repo.id} repo={repo} />
				))}
			</Card>

			<Card className="mt-5 gap-0 py-0">
				<CardHeader className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
					<div>
						<CardTitle className="text-[16px]">Review queue</CardTitle>
						<CardDescription className="mt-0.5 text-[13px]">
							{data.queue.length} report{data.queue.length === 1 ? "" : "s"}{" "}
							waiting. Decide once — applies across all your repos.
						</CardDescription>
					</div>
					<Button
						onClick={() =>
							setSortMode((mode) => (mode === "conf" ? "time" : "conf"))
						}
						size="sm"
						type="button"
						variant="ghost"
					>
						Sort: {sortMode === "conf" ? "confidence ↓" : "newest ↓"}
					</Button>
				</CardHeader>

				{sorted.length === 0 ? (
					<Empty className="p-12">
						<EmptyDescription>
							All caught up. Nothing to review.
						</EmptyDescription>
					</Empty>
				) : (
					sorted.map((item) => (
						<QueueItem
							item={item}
							key={item.reportId}
							onDecide={onDecide}
							pending={pendingLogin === item.login}
						/>
					))
				)}
			</Card>
		</>
	);
}

function CoverageBar({ repo }: { repo: DashboardRepo }) {
	const max = Math.max(repo.reportCount, 1);
	return (
		<div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-border border-b py-3 text-[13px] last:border-0">
			<div>
				<div className="font-mono text-[13px]">{repo.fullName}</div>
				<Progress
					className="mt-1.5"
					tone="primary"
					trackClassName="h-1.5"
					value={(repo.flaggedCount / max) * 100}
				/>
			</div>
			<div className="font-mono text-destructive">
				{repo.flaggedCount} flagged
			</div>
			<div className="font-mono text-muted-foreground text-xs">
				{repo.reportCount} report{repo.reportCount === 1 ? "" : "s"}
			</div>
		</div>
	);
}

function QueueItem({
	item,
	onDecide,
	pending,
}: {
	item: DashboardQueueItem;
	onDecide: (login: string, decision: QueueDecision) => void;
	pending: boolean;
}) {
	return (
		<div className="grid grid-cols-[44px_1fr] items-center gap-3.5 border-t px-5 py-4 lg:grid-cols-[44px_1fr_auto]">
			<AccountAvatar
				avatarUrl={item.avatarUrl}
				className="size-11 text-sm"
				login={item.login}
			/>
			<div className="min-w-0">
				<div className="flex flex-wrap items-center gap-2 text-sm">
					<a
						className="font-medium hover:underline"
						href={`/accounts/${item.login}`}
					>
						@{item.login}
					</a>
					<ChevronRight className="size-3 text-muted-foreground/60" />
					<span className="font-mono text-muted-foreground text-xs">
						{item.repoFullName}
					</span>
					{item.prNumber ? (
						<span className="font-mono text-muted-foreground/70 text-xs">
							#{item.prNumber}
						</span>
					) : null}
				</div>
				<div className="mt-1 text-[14px]">{reasonLabel(item.reasonCode)}</div>
				<div className="mt-2 flex flex-wrap items-center gap-2">
					<ConfidenceBadge value={item.confidence / 100} />
					<Badge variant={statusVariant(item.status)}>
						{REPORT_STATUS_LABELS[item.status]}
					</Badge>
					{item.prUrl ? (
						<a
							className="font-mono text-muted-foreground text-xs hover:text-foreground"
							href={item.prUrl}
							rel="noopener noreferrer"
							target="_blank"
						>
							View PR ↗
						</a>
					) : null}
				</div>
			</div>
			<div className="col-span-2 flex gap-2 lg:col-span-1">
				<Button
					disabled={pending}
					onClick={() => onDecide(item.login, "confirm")}
					size="sm"
					type="button"
					variant="success"
				>
					<Check />
					Confirm
				</Button>
				<Button
					disabled={pending}
					onClick={() => onDecide(item.login, "dismiss")}
					size="sm"
					type="button"
					variant="ghost"
				>
					<X />
					Dismiss
				</Button>
				<Button
					disabled={pending}
					onClick={() => onDecide(item.login, "allow")}
					size="sm"
					type="button"
					variant="ghost"
				>
					Allow
				</Button>
			</div>
		</div>
	);
}

function CoverageView({ repos }: { repos: DashboardRepo[] }) {
	return (
		<Card className="gap-0 py-0">
			<CardHeader className="border-b px-5 py-4">
				<CardTitle className="text-[16px]">Coverage</CardTitle>
				<CardDescription className="mt-0.5 text-[13px]">
					Repositories under installations you maintain. Counts reflect reports
					captured on each repo.
				</CardDescription>
			</CardHeader>
			<CardContent className="px-5 pb-2">
				{repos.map((repo) => (
					<div
						className="grid grid-cols-1 items-center gap-2 border-border border-b py-4 last:border-0 md:grid-cols-[1.6fr_1fr_1fr]"
						key={repo.id}
					>
						<div>
							<div className="font-mono text-[14px]">{repo.fullName}</div>
							<div className="mt-1 flex items-center gap-1.5 text-muted-foreground text-xs">
								<span>{repo.ownerLogin}</span>
								<span>·</span>
								<span>{repo.isPrivate ? "private" : "public"}</span>
							</div>
						</div>
						<div className="font-mono text-destructive text-sm">
							{repo.flaggedCount} flagged author
							{repo.flaggedCount === 1 ? "" : "s"}
						</div>
						<div className="font-mono text-muted-foreground text-sm">
							{repo.reportCount} report{repo.reportCount === 1 ? "" : "s"}
						</div>
					</div>
				))}
			</CardContent>
			<CardFooter className="border-t bg-muted px-5 py-3">
				<a
					className={buttonVariants({ size: "sm", variant: "outline" })}
					href="/install"
				>
					<Github data-icon="inline-start" />
					Add a repository
				</a>
			</CardFooter>
		</Card>
	);
}

type AuditFilter = "all" | "decisions" | "overrides" | "reports";

const AUDIT_FILTERS: { key: AuditFilter; label: string }[] = [
	{ key: "all", label: "All" },
	{ key: "decisions", label: "Decisions" },
	{ key: "overrides", label: "Repo overrides" },
	{ key: "reports", label: "Reports" },
];

const CORRECTION_LABEL: Record<string, string> = {
	allow: "Allowlisted",
	confirm: "Confirmed report",
	dismiss: "Dismissed report",
	reset: "Reset profile",
};

const CORRECTION_DOT: Record<string, string> = {
	allow: "border-success",
	confirm: "border-destructive",
	dismiss: "border-success",
	reset: "border-info",
};

function reportDotClass(status: string) {
	if (status === "validated") {
		return "border-destructive";
	}
	if (status === "dismissed") {
		return "border-success";
	}
	return "border-info";
}

function ReportTimelineRow({
	item,
}: {
	item: Extract<DashboardActivityItem, { eventType: "report" }>;
}) {
	return (
		<div className="relative pb-5 last:pb-0">
			<div
				className={cn(
					"absolute top-1.5 left-[1px] size-2.5 rounded-full border-2 bg-background",
					reportDotClass(item.status)
				)}
			/>
			<div className="font-mono text-muted-foreground text-xs">
				{relativeTime(item.createdAt)}
			</div>
			<div className="mt-0.5 font-medium text-sm">
				Report · @{item.login} · {reasonLabel(item.reasonCode)}
			</div>
			<div className="mt-0.5 text-[13px] text-muted-foreground">
				{item.repoFullName} · {REPORT_STATUS_LABELS[item.status]}
			</div>
		</div>
	);
}

function CorrectionTimelineRow({
	item,
}: {
	item: Extract<DashboardActivityItem, { eventType: "correction" }>;
}) {
	return (
		<div className="relative pb-5 last:pb-0">
			<div
				className={cn(
					"absolute top-1.5 left-[1px] size-2.5 rounded-full border-2 bg-background",
					CORRECTION_DOT[item.correctionKind] ?? "border-info"
				)}
			/>
			<div className="font-mono text-muted-foreground text-xs">
				{relativeTime(item.createdAt)}
			</div>
			<div className="mt-0.5 font-medium text-sm">
				{CORRECTION_LABEL[item.correctionKind] ?? "Decision"} · @{item.login}
			</div>
			<div className="mt-0.5 text-[13px] text-muted-foreground">
				by @{item.correctedByLogin}
				{item.repoFullName ? ` · ${item.repoFullName}` : ""}
			</div>
		</div>
	);
}

function RepoDecisionTimelineRow({
	item,
}: {
	item: Extract<DashboardActivityItem, { eventType: "repo_decision" }>;
}) {
	return (
		<div className="relative pb-5 last:pb-0">
			<div
				className={cn(
					"absolute top-1.5 left-[1px] size-2.5 rounded-full border-2 bg-background",
					item.decision === "block" ? "border-destructive" : "border-success"
				)}
			/>
			<div className="font-mono text-muted-foreground text-xs">
				{relativeTime(item.createdAt)}
			</div>
			<div className="mt-0.5 font-medium text-sm">
				Repo override · @{item.login} ·{" "}
				{item.decision === "block" ? "Block" : "Allow"}
			</div>
			<div className="mt-0.5 text-[13px] text-muted-foreground">
				{item.repoFullName} · by @{item.correctedByLogin}
				{item.note ? ` · "${item.note}"` : ""}
			</div>
		</div>
	);
}

function TimelineRow({ item }: { item: DashboardActivityItem }) {
	if (item.eventType === "report") {
		return <ReportTimelineRow item={item} />;
	}
	if (item.eventType === "correction") {
		return <CorrectionTimelineRow item={item} />;
	}
	return <RepoDecisionTimelineRow item={item} />;
}

function ActivityView({ items }: { items: DashboardActivityItem[] }) {
	const [filter, setFilter] = useState<AuditFilter>("all");

	const filtered = items.filter((item) => {
		if (filter === "decisions") {
			return item.eventType === "correction";
		}
		if (filter === "overrides") {
			return item.eventType === "repo_decision";
		}
		if (filter === "reports") {
			return item.eventType === "report";
		}
		return true;
	});

	return (
		<Card className="p-6">
			<div className="mb-4 flex flex-wrap items-start justify-between gap-3">
				<div>
					<CardTitle className="text-[16px]">Audit log</CardTitle>
					<CardDescription className="mt-0.5 text-[13px]">
						Reports captured and maintainer decisions applied across your repos.
						Read-only.
					</CardDescription>
				</div>
				<Tabs
					onValueChange={(value) => setFilter(value as AuditFilter)}
					value={filter}
				>
					<TabsList>
						{AUDIT_FILTERS.map((option) => (
							<TabsTrigger key={option.key} value={option.key}>
								{option.label}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
			</div>

			{filtered.length === 0 ? (
				<Empty className="bg-muted/30 p-8">
					<EmptyDescription>
						{filter === "all"
							? "No activity yet. Reports and decisions on your repos will appear here."
							: `No ${filter} yet on your repos.`}
					</EmptyDescription>
				</Empty>
			) : (
				<div className="relative pl-6">
					<div className="absolute top-1 bottom-1 left-[6px] w-px bg-border" />
					{filtered.map((item) => (
						<TimelineRow item={item} key={item.id} />
					))}
				</div>
			)}
		</Card>
	);
}

function riskVariant(status: null | string): StatusVariant {
	if (status === "allow") {
		return "success";
	}
	if (status === "block" || status === "high_risk") {
		return "destructive";
	}
	return "warning";
}

function AppealCard({
	item,
	onResolve,
	pending,
}: {
	item: AppealReviewItem;
	onResolve: (id: string, resolution: "reject" | "uphold") => void;
	pending: boolean;
}) {
	return (
		<div className="border-t px-5 py-4">
			<div className="flex flex-wrap items-start gap-3.5">
				<AccountAvatar
					avatarUrl={item.avatarUrl}
					className="size-11 text-sm"
					login={item.login}
				/>
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2 text-sm">
						<a
							className="font-medium hover:underline"
							href={`/accounts/${item.login}`}
						>
							@{item.login}
						</a>
						<Badge variant="info">
							{item.relationship === "rep"
								? "Representative"
								: "Account holder"}
						</Badge>
						{item.riskStatus ? (
							<Badge variant={riskVariant(item.riskStatus)}>
								{item.riskStatus} · {item.riskScore ?? 0}
							</Badge>
						) : (
							<span className="font-mono text-muted-foreground text-xs">
								not tracked
							</span>
						)}
						<span className="font-mono text-muted-foreground/70 text-xs">
							{relativeTime(item.createdAt)}
						</span>
					</div>
					<p className="mt-2 whitespace-pre-wrap break-words text-[14px] text-muted-foreground leading-relaxed">
						{item.story}
					</p>
					{item.email ? (
						<div className="mt-1.5 font-mono text-muted-foreground/70 text-xs">
							{item.email}
						</div>
					) : null}
				</div>
				<div className="flex gap-2">
					<Button
						disabled={pending}
						onClick={() => onResolve(item.id, "uphold")}
						size="sm"
						type="button"
						variant="success"
					>
						<Check />
						Uphold
					</Button>
					<Button
						disabled={pending}
						onClick={() => onResolve(item.id, "reject")}
						size="sm"
						type="button"
						variant="ghost"
					>
						<X />
						Reject
					</Button>
				</div>
			</div>
		</div>
	);
}

function AppealsView({
	items,
	onResolve,
	pendingId,
}: {
	items: AppealReviewItem[];
	onResolve: (id: string, resolution: "reject" | "uphold") => void;
	pendingId: null | string;
}) {
	return (
		<Card className="gap-0 py-0">
			<CardHeader className="border-b px-5 py-4">
				<CardTitle className="text-[16px]">Appeals</CardTitle>
				<CardDescription className="mt-0.5 text-[13px]">
					People who say they were wrongly flagged. Upholding an appeal
					allowlists the account across your repos; rejecting leaves the flag in
					place.
				</CardDescription>
			</CardHeader>
			{items.length === 0 ? (
				<Empty className="p-12">
					<EmptyDescription>
						No appeals waiting. Submissions from the public appeal form show up
						here for review.
					</EmptyDescription>
				</Empty>
			) : (
				items.map((item) => (
					<AppealCard
						item={item}
						key={item.id}
						onResolve={onResolve}
						pending={pendingId === item.id}
					/>
				))
			)}
		</Card>
	);
}

function OverridesView({
	onChange,
	overrides,
	repos,
}: {
	onChange: () => void;
	overrides: RepoDecisionRow[];
	repos: DashboardRepo[];
}) {
	const [login, setLogin] = useState("");
	const [note, setNote] = useState("");
	const [repositoryId, setRepositoryId] = useState(repos[0]?.id ?? "");
	const [decision, setDecision] = useState<RepoDecisionKind>("block");
	const [pending, setPending] = useState(false);
	const [pendingRow, setPendingRow] = useState<null | string>(null);

	const submit = async () => {
		if (!repositoryId) {
			toast.error("Pick a repository.");
			return;
		}
		if (login.trim().length < 1) {
			toast.error("Provide an account handle.");
			return;
		}
		setPending(true);
		try {
			const response = await fetch("/api/maintainer/repo-decision", {
				body: JSON.stringify({
					decision,
					note: note.trim() || null,
					repositoryId,
					targetLogin: login.trim(),
				}),
				headers: { "Content-Type": "application/json" },
				method: "POST",
			});
			const data = (await response.json()) as { error?: string };
			if (!response.ok) {
				toast.error(data.error ?? "Couldn't save the override.");
				return;
			}
			toast.success(`Saved ${decision} for @${login.trim()}.`);
			setLogin("");
			setNote("");
			onChange();
		} finally {
			setPending(false);
		}
	};

	const remove = async (row: RepoDecisionRow) => {
		setPendingRow(row.id);
		try {
			const response = await fetch("/api/maintainer/repo-decision", {
				body: JSON.stringify({
					repositoryId: row.repositoryId,
					targetLogin: row.login,
				}),
				headers: { "Content-Type": "application/json" },
				method: "DELETE",
			});
			const data = (await response.json()) as { error?: string };
			if (!response.ok) {
				toast.error(data.error ?? "Couldn't remove the override.");
				return;
			}
			toast.success(`Removed override for @${row.login}.`);
			onChange();
		} finally {
			setPendingRow(null);
		}
	};

	if (repos.length === 0) {
		return (
			<Empty>
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<Shield />
					</EmptyMedia>
					<EmptyTitle>No repositories yet</EmptyTitle>
					<EmptyDescription>
						Install OSS Protector on a repo before adding per-repo allow / block
						overrides.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			<Card className="p-6">
				<div className="mb-4">
					<CardTitle className="text-[16px]">Add repo override</CardTitle>
					<CardDescription className="mt-0.5 text-[13px]">
						Override the shared score for one account on one of your repos.
						Block force-flags every PR; Allow short-circuits AI review for that
						author on that repo.
					</CardDescription>
				</div>
				<div className="grid gap-3 md:grid-cols-[2fr_1fr_auto]">
					<div className="grid gap-1.5">
						<Label className="text-[12.5px]" htmlFor="override-login">
							Account handle
						</Label>
						<Input
							autoComplete="off"
							id="override-login"
							onChange={(event) => setLogin(event.target.value)}
							placeholder="@autopr-helper-99"
							value={login}
						/>
					</div>
					<div className="grid gap-1.5">
						<Label className="text-[12.5px]" htmlFor="override-repo">
							Repository
						</Label>
						<Select
							onValueChange={(value) => setRepositoryId(value ?? "")}
							value={repositoryId}
						>
							<SelectTrigger className="h-9 w-full" id="override-repo">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{repos.map((repo) => (
									<SelectItem key={repo.id} value={repo.id}>
										{repo.fullName}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="grid gap-1.5">
						<Label className="text-[12.5px]">Decision</Label>
						<Tabs
							onValueChange={(value) => setDecision(value as RepoDecisionKind)}
							value={decision}
						>
							<TabsList>
								{(["block", "allow"] as RepoDecisionKind[]).map((kind) => (
									<TabsTrigger key={kind} value={kind}>
										{kind === "block" ? "Block" : "Allow"}
									</TabsTrigger>
								))}
							</TabsList>
						</Tabs>
					</div>
				</div>
				<div className="mt-3 grid gap-1.5">
					<Label className="text-[12.5px]" htmlFor="override-note">
						Note (optional)
					</Label>
					<Input
						id="override-note"
						maxLength={280}
						onChange={(event) => setNote(event.target.value)}
						placeholder="Why this override applies — surfaced in the audit log."
						value={note}
					/>
				</div>
				<div className="mt-4">
					<Button disabled={pending} onClick={submit} type="button">
						{pending ? <Loader2 className="animate-spin" /> : <Check />}
						Save override
					</Button>
				</div>
			</Card>

			<Card className="gap-0 py-0">
				<CardHeader className="flex items-center justify-between border-b px-5 py-4">
					<div>
						<CardTitle className="text-[16px]">Active overrides</CardTitle>
						<CardDescription className="mt-0.5 text-[13px]">
							Repo-scoped. Don't affect the shared OSS Protector score.
						</CardDescription>
					</div>
				</CardHeader>
				{overrides.length === 0 ? (
					<Empty className="p-10">
						<EmptyDescription>No overrides on your repos yet.</EmptyDescription>
					</Empty>
				) : (
					overrides.map((row) => (
						<div
							className="grid grid-cols-[32px_1fr_auto] items-center gap-3.5 border-t px-5 py-3.5"
							key={row.id}
						>
							<AccountAvatar
								avatarUrl={row.avatarUrl}
								className="size-8 text-[10px]"
								login={row.login}
							/>
							<div className="min-w-0">
								<div className="flex flex-wrap items-center gap-2">
									<a
										className="font-medium text-[14px] hover:underline"
										href={`/accounts/${row.login}`}
									>
										@{row.login}
									</a>
									<Badge
										variant={
											row.decision === "block" ? "destructive" : "success"
										}
									>
										{row.decision === "block" ? "Block" : "Allow"}
									</Badge>
									<span className="font-mono text-muted-foreground text-xs">
										{row.repoFullName}
									</span>
								</div>
								<div className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
									{row.note ? `"${row.note}"` : "No note."} ·{" "}
									{relativeTime(row.updatedAt)}
								</div>
							</div>
							<Button
								disabled={pendingRow === row.id}
								onClick={() => remove(row)}
								size="sm"
								type="button"
								variant="ghost"
							>
								{pendingRow === row.id ? (
									<Loader2 className="animate-spin" />
								) : (
									<Trash2 />
								)}
								Remove
							</Button>
						</div>
					))
				)}
			</Card>
		</div>
	);
}

function AllowlistView({
	entries,
	onReset,
	pendingLogin,
}: {
	entries: DashboardAllowEntry[];
	onReset: (login: string) => void;
	pendingLogin: null | string;
}) {
	return (
		<Card className="gap-0 py-0">
			<CardHeader className="flex items-center justify-between border-b px-5 py-4">
				<div>
					<CardTitle className="text-[16px]">Allowlist</CardTitle>
					<CardDescription className="mt-0.5 text-[13px]">
						Trusted authors. Their PRs bypass flagging in your repos.
					</CardDescription>
				</div>
			</CardHeader>
			{entries.length === 0 ? (
				<Empty className="p-10">
					<EmptyDescription>
						No allowlisted authors yet. Use the Allow action on a queue item to
						trust an author.
					</EmptyDescription>
				</Empty>
			) : (
				entries.map((entry) => (
					<div
						className="grid grid-cols-[32px_1fr_auto] items-center gap-3.5 border-t px-5 py-3.5"
						key={entry.login}
					>
						<AccountAvatar
							avatarUrl={entry.avatarUrl}
							className="size-8 text-[10px]"
							login={entry.login}
						/>
						<div>
							<a
								className="font-medium text-[14px] hover:underline"
								href={`/accounts/${entry.login}`}
							>
								@{entry.login}
							</a>
							<div className="mt-0.5 text-muted-foreground text-xs">
								{entry.summary ?? "Allowlisted author."} ·{" "}
								{relativeTime(entry.updatedAt)}
							</div>
						</div>
						<Button
							disabled={pendingLogin === entry.login}
							onClick={() => onReset(entry.login)}
							size="sm"
							type="button"
							variant="ghost"
						>
							<RotateCcw />
							Reset
						</Button>
					</div>
				))
			)}
		</Card>
	);
}
