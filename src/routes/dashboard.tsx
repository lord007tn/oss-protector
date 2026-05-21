import { createFileRoute } from "@tanstack/react-router";
import {
	Activity,
	Check,
	ChevronRight,
	Gavel,
	Github,
	Hash,
	Inbox,
	RotateCcw,
	Shield,
	User,
	X,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import { AccountAvatar } from "@/components/oss/account-avatar";
import { ConfidenceBadge } from "@/components/oss/confidence-badge";
import {
	PageContainer,
	PageHeader,
	PageShell,
} from "@/components/site/page-shell";
import { SignInGate } from "@/components/site/sign-in-gate";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { REPORT_STATUS_LABELS } from "@/constants/report-statuses";
import type { AppealReviewItem } from "@/data-access/appeals";
import type {
	DashboardActivityItem,
	DashboardAllowEntry,
	DashboardQueueItem,
	DashboardRepo,
	MaintainerDashboard,
} from "@/data-access/maintainer-dashboard";
import { reasonLabel, relativeTime } from "@/lib/directory-view";
import { repoShortName } from "@/lib/oss";
import { useMaintainerDashboard } from "@/lib/use-maintainer-dashboard";
import { useSessionState } from "@/lib/use-session-state";
import { cn } from "@/lib/utils";

type DashTab = "activity" | "allow" | "appeals" | "coverage" | "inbox";
type Decision = "allow" | "confirm" | "dismiss" | "reset";
type QueueDecision = Exclude<Decision, "reset">;
type StatusVariant = "destructive" | "info" | "success" | "warning";

const EMPTY_DASHBOARD: MaintainerDashboard = {
	activity: [],
	allowlist: [],
	appeals: [],
	queue: [],
	repos: [],
	stats: {
		allowedCount: 0,
		appealCount: 0,
		blockedCount: 0,
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
				<div className="rounded-2xl border bg-card p-12 text-center text-muted-foreground text-sm">
					Loading your console…
				</div>
			</PageContainer>
		);
	}

	if (error && !dashboard) {
		return (
			<PageContainer className="py-9">
				<div className="rounded-2xl border bg-card p-12 text-center text-destructive text-sm">
					{error}
				</div>
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
				label: "Activity",
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
				<aside className="sticky top-20 hidden h-fit rounded-2xl border bg-card p-3 lg:block">
					{nav.map((item) => (
						<button
							className={cn(
								"flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors",
								active === item.key
									? "bg-muted text-foreground"
									: "text-muted-foreground hover:bg-muted hover:text-foreground"
							)}
							key={item.key}
							onClick={() => setActive(item.key)}
							type="button"
						>
							<span className="text-muted-foreground">{item.icon}</span>
							<span className="flex-1 text-left">{item.label}</span>
							<span className="font-mono text-muted-foreground text-xs">
								{item.count}
							</span>
						</button>
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
				</aside>

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
		<div className="rounded-2xl border bg-card p-5">
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
		</div>
	);
}

function EmptyConsole() {
	return (
		<div className="mt-6 rounded-2xl border bg-card p-10 text-center">
			<Shield className="mx-auto size-8 text-muted-foreground" />
			<div className="mt-4 font-medium text-lg">No repositories yet</div>
			<p className="mx-auto mt-2 max-w-md text-[14px] text-muted-foreground leading-relaxed">
				Install OSS Protector on a repository or organization you maintain. Once
				the install is linked to your account, your review queue, coverage, and
				allowlist show up here.
			</p>
			<a className={cn(buttonVariants(), "mt-5")} href="/install">
				<Github data-icon="inline-start" />
				Install OSS Protector
			</a>
		</div>
	);
}

function InstallCta() {
	return (
		<div className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl border border-primary/30 bg-primary/10 p-5">
			<div className="flex-1">
				<div className="font-medium">Want this everywhere you maintain?</div>
				<div className="mt-1 text-[13.5px] text-muted-foreground">
					OSS Protector is free to install on any repo or org. The trust graph
					grows with every maintainer who joins.
				</div>
			</div>
			<a className={buttonVariants()} href="/install">
				<Github data-icon="inline-start" />
				Add another repo
			</a>
		</div>
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

			<div className="mt-5 rounded-2xl border bg-card p-5">
				<div className="mb-4 font-medium text-[15px]">Repo coverage</div>
				{data.repos.map((repo) => (
					<CoverageBar key={repo.id} repo={repo} />
				))}
			</div>

			<div className="mt-5 overflow-hidden rounded-2xl border bg-card">
				<div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
					<div>
						<div className="font-medium text-[16px]">Review queue</div>
						<div className="mt-0.5 text-[13px] text-muted-foreground">
							{data.queue.length} report{data.queue.length === 1 ? "" : "s"}{" "}
							waiting. Decide once — applies across all your repos.
						</div>
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
				</div>

				{sorted.length === 0 ? (
					<div className="p-12 text-center text-muted-foreground text-sm">
						All caught up. Nothing to review.
					</div>
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
			</div>
		</>
	);
}

function CoverageBar({ repo }: { repo: DashboardRepo }) {
	const max = Math.max(repo.reportCount, 1);
	return (
		<div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-border border-b py-3 text-[13px] last:border-0">
			<div>
				<div className="font-mono text-[13px]">{repo.fullName}</div>
				<div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
					<div
						className="h-full bg-primary"
						style={{ width: `${(repo.flaggedCount / max) * 100}%` }}
					/>
				</div>
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
		<div className="overflow-hidden rounded-2xl border bg-card">
			<div className="border-b px-5 py-4">
				<div className="font-medium text-[16px]">Coverage</div>
				<div className="mt-0.5 text-[13px] text-muted-foreground">
					Repositories under installations you maintain. Counts reflect reports
					captured on each repo.
				</div>
			</div>
			<div className="px-5 pb-2">
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
			</div>
			<div className="border-t bg-muted px-5 py-3">
				<a
					className={buttonVariants({ size: "sm", variant: "outline" })}
					href="/install"
				>
					<Github data-icon="inline-start" />
					Add a repository
				</a>
			</div>
		</div>
	);
}

function activityDotClass(status: string) {
	if (status === "validated") {
		return "border-destructive";
	}
	if (status === "dismissed") {
		return "border-success";
	}
	return "border-info";
}

function ActivityView({ items }: { items: DashboardActivityItem[] }) {
	if (items.length === 0) {
		return (
			<div className="rounded-2xl border bg-card p-10 text-center text-muted-foreground text-sm">
				No activity yet. Reports captured on your repos will appear here.
			</div>
		);
	}
	return (
		<div className="rounded-2xl border bg-card p-6">
			<div className="mb-5">
				<div className="font-medium text-[16px]">Activity</div>
				<div className="mt-0.5 text-[13px] text-muted-foreground">
					Recent reports captured across your repos. Read-only ledger.
				</div>
			</div>
			<div className="relative pl-6">
				<div className="absolute top-1 bottom-1 left-[6px] w-px bg-border" />
				{items.map((item) => (
					<div className="relative pb-5 last:pb-0" key={item.id}>
						<div
							className={cn(
								"absolute top-1.5 left-[1px] size-2.5 rounded-full border-2 bg-background",
								activityDotClass(item.status)
							)}
						/>
						<div className="font-mono text-muted-foreground text-xs">
							{relativeTime(item.createdAt)}
						</div>
						<div className="mt-0.5 font-medium text-sm">
							@{item.login} · {reasonLabel(item.reasonCode)}
						</div>
						<div className="mt-0.5 text-[13px] text-muted-foreground">
							{item.repoFullName} · {REPORT_STATUS_LABELS[item.status]}
						</div>
					</div>
				))}
			</div>
		</div>
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
		<div className="overflow-hidden rounded-2xl border bg-card">
			<div className="border-b px-5 py-4">
				<div className="font-medium text-[16px]">Appeals</div>
				<div className="mt-0.5 text-[13px] text-muted-foreground">
					People who say they were wrongly flagged. Upholding an appeal
					allowlists the account across your repos; rejecting leaves the flag in
					place.
				</div>
			</div>
			{items.length === 0 ? (
				<div className="p-12 text-center text-muted-foreground text-sm">
					No appeals waiting. Submissions from the public appeal form show up
					here for review.
				</div>
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
		<div className="overflow-hidden rounded-2xl border bg-card">
			<div className="flex items-center justify-between border-b px-5 py-4">
				<div>
					<div className="font-medium text-[16px]">Allowlist</div>
					<div className="mt-0.5 text-[13px] text-muted-foreground">
						Trusted authors. Their PRs bypass flagging in your repos.
					</div>
				</div>
			</div>
			{entries.length === 0 ? (
				<div className="p-10 text-center text-muted-foreground text-sm">
					No allowlisted authors yet. Use the Allow action on a queue item to
					trust an author.
				</div>
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
		</div>
	);
}
