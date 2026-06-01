import {
	ArrowRight,
	Bell,
	Bot,
	Check,
	Github,
	Heart,
	Shield,
	Star,
	User,
	X,
} from "lucide-react";
import type { DirectoryDashboard } from "@/actions/directory";
import { githubAppInstallUrl } from "@/components/landing/constants";
import { ConfidenceBadge } from "@/components/oss/confidence-badge";
import { InitialsAvatar } from "@/components/oss/initials-avatar";
import { LiveFeed, type LiveFeedItem } from "@/components/oss/live-feed";
import { Section, SectionHead } from "@/components/oss/section";
import { SignalBars, type SignalKey } from "@/components/oss/signal-bars";
import { StatStrip } from "@/components/oss/stat-strip";
import { TrustGraph } from "@/components/oss/trust-graph";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { REASON_LABELS } from "@/constants/reason-codes";
import { RISK_STATUS_LABELS } from "@/constants/risk-statuses";
import { cn } from "@/lib/utils";

// Illustrative example for the "see exactly why a PR got flagged" + trust-graph
// sections. Deliberately a made-up handle — we don't put a real person on the
// homepage as "the example bot". Live per-account data is on /feed and
// /accounts/$login.
const account: {
	avatar: string;
	color: number;
	confidence: number;
	flagged: number;
	handle: string;
	reporters: string[];
	signals: Record<SignalKey, number>;
	summary: string;
} = {
	avatar: "A9",
	color: 6,
	confidence: 0.97,
	flagged: 142,
	handle: "autopr-helper-99",
	reporters: ["evanw", "kentcdodds", "sindresorhus", "feross", "yyx990803"],
	signals: {
		accountAge: 0.94,
		bioPattern: 0.82,
		commitVoice: 0.86,
		crossRepoOverlap: 0.97,
		diffSignature: 0.91,
		prVolume: 0.88,
	},
	summary:
		"Account opened 27 days ago has filed 184 PRs across 142 unrelated repositories. Diff signature matches a known automated-PR family; five maintainers confirmed prior reports.",
};

const EXAMPLE_REPO_NAMES = ["acme/web", "acme/cli", "acme/docs", "acme/sdk"];

const PROBLEM_ROWS = [
	{
		by: "@miketcosta",
		human: true,
		score: 0.04,
		time: "Tue 2:14 pm",
		title: "fix(parser): handle deeply-nested generics in TS 5.4",
	},
	{
		by: "@autopr-helper-99",
		human: false,
		score: 0.97,
		time: "Tue 2:08 pm",
		title: "Fix: typo in README",
	},
	{
		by: "@fix-typo-bot-42",
		human: false,
		score: 0.99,
		time: "Tue 1:54 pm",
		title: "docs: small grammar fix in CONTRIBUTING",
	},
	{
		by: "@DeepSeek-Coder-AI",
		human: false,
		score: 0.86,
		time: "Tue 1:33 pm",
		title: "refactor: modernize quantization loop",
	},
	{
		by: "@good-first-issue-grinder",
		human: false,
		score: 0.92,
		time: "Tue 1:21 pm",
		title: "fix: extra space in error message",
	},
	{
		by: "@refactor-master-x",
		human: false,
		score: 0.89,
		time: "Tue 1:04 pm",
		title: "refactor: rename internal helpers",
	},
	{
		by: "@grammar-fixer-77",
		human: false,
		score: 0.94,
		time: "Tue 12:48 pm",
		title: "docs: fix typo in setup section",
	},
	{
		by: "@helpful-ai-coder",
		human: false,
		score: 0.83,
		time: "Tue 12:31 pm",
		title: "chore: update install instructions",
	},
];

const SIGNAL_LIST = [
	{
		k: "Account heuristics",
		v: "Created < 60 days, no prior commits, handle entropy",
	},
	{ k: "PR volume", v: "Number of PRs per day across unrelated projects" },
	{
		k: "Diff signature",
		v: "LLM template families, vocabulary, indentation, comment shape",
	},
	{ k: "Cross-repo overlap", v: "Same account flagged or dismissed elsewhere" },
	{
		k: "Bio / handle pattern",
		v: "Self-identified AI assistants, badge-farmer naming",
	},
	{
		k: "Commit-message voice",
		v: "Conventional commits with no semantic content",
	},
];

const HOW_CARDS = [
	{
		body: "Creation date, prior commits, bio patterns, handle entropy. The account is the easiest tell — most bots don't bother hiding.",
		num: "01",
		title: "Account heuristics",
	},
	{
		body: "The shape of the patch itself. LLM-authored PRs have a distinctive vocabulary, indentation, and comment style we can match.",
		num: "02",
		title: "Diff signature",
	},
	{
		body: "One PR is a data point. A hundred PRs across a hundred unrelated repos is a fingerprint. We see the whole graph.",
		num: "03",
		title: "Cross-repo correlation",
	},
];

export function HomePage({ dashboard }: { dashboard: DirectoryDashboard }) {
	const { stats } = dashboard;
	const recentFlags: LiveFeedItem[] = dashboard.riskProfiles
		.toSorted((first, second) => second.lastSeenAt - first.lastSeenAt)
		.slice(0, 7)
		.map((profile) => ({
			avatarUrl: profile.avatarUrl,
			login: profile.login,
			reason: profile.reasonCodes[0]
				? REASON_LABELS[profile.reasonCodes[0]]
				: RISK_STATUS_LABELS[profile.status],
			score: profile.score,
		}));
	const coverageRepos = dashboard.repositories.slice(0, 18);
	const repoCount = stats.activeRepositories;
	return (
		<>
			<HeroSection recentFlags={recentFlags} stats={stats} />

			<Section>
				<SectionHead
					eyebrow="The signal-to-noise crisis"
					sub="Maintainers are quitting. Not from the work — from reviewing the work that isn't work. Here's last Tuesday in a real OSS inbox."
					title={
						<>
							For every <span className="text-primary">one</span> person fixing
							a real bug, <span className="text-primary">fourteen</span> are
							farming a contribution badge.
						</>
					}
				/>
				<div className="grid items-start gap-8 lg:grid-cols-[1.4fr_1fr]">
					<ProblemQueue />
					<div>
						<blockquote className="text-balance font-normal text-xl leading-snug tracking-tight">
							"I logged in on Tuesday. I had 47 notifications.{" "}
							<span className="text-primary">One</span> was from a human. I
							closed the laptop and didn't open it again that week."
						</blockquote>
						<div className="mt-3.5 text-muted-foreground text-sm">
							Maintainer, mid-tier TypeScript library, 2025
						</div>
						<div className="mt-7 rounded-xl border bg-card p-5">
							<div className="mb-2.5 font-mono text-muted-foreground text-xs">
								WHAT WE BLOCK
							</div>
							<div className="flex flex-col gap-2 text-[14px] text-muted-foreground">
								<div>· LLM-authored "helpful" PRs with no context</div>
								<div>· Single-character typo farming at scale</div>
								<div>· Contribution-badge grinders</div>
								<div>· Cosmetic refactors that break tests silently</div>
								<div>· Coordinated cross-repo PR waves</div>
							</div>
						</div>
					</div>
				</div>
			</Section>

			<Section>
				<SectionHead
					eyebrow="How it works"
					sub="We never act on a single signal. Every flag combines account heuristics, diff pattern matching, and cross-repo correlation — and every flag is reviewable by anyone."
					title="Three signals. One decision. Always public."
				/>
				<div className="grid gap-4 md:grid-cols-3">
					{HOW_CARDS.map((card) => (
						<div className="rounded-2xl border bg-card p-7" key={card.num}>
							<div className="mb-4 font-mono text-muted-foreground text-xs tracking-wider">
								/ {card.num}
							</div>
							<div className="mb-2 font-medium text-lg tracking-tight">
								{card.title}
							</div>
							<p className="text-[14px] text-muted-foreground leading-relaxed">
								{card.body}
							</p>
						</div>
					))}
				</div>
			</Section>

			<Section>
				<SectionHead
					eyebrow="Confidence breakdown"
					sub="Confidence is a weighted sum of six independent signals. You see the full breakdown on every PR — and you can audit our weights on GitHub."
					title="No black box. See exactly why a PR got flagged."
				/>
				<div className="grid items-stretch gap-8 lg:grid-cols-[1fr_1.1fr]">
					<div className="rounded-2xl border bg-popover p-6 shadow-soft">
						<div className="mb-4 flex items-center gap-3">
							<InitialsAvatar
								className="size-10 text-sm"
								color={account.color}
								initials={account.avatar}
							/>
							<div>
								<div className="flex items-center gap-2">
									<span className="font-medium text-[15px]">
										@{account.handle}
									</span>
									<Badge variant="outline">example</Badge>
								</div>
								<div className="font-mono text-muted-foreground text-xs">
									illustrative breakdown
								</div>
							</div>
						</div>
						<div className="mb-4 flex items-center gap-2.5">
							<ConfidenceBadge value={account.confidence} />
							<span className="text-muted-foreground text-sm">
								confidence · flag
							</span>
						</div>
						<SignalBars signals={account.signals} />
						<Alert className="mt-4" variant="destructive-soft">
							<AlertDescription>{account.summary}</AlertDescription>
						</Alert>
					</div>
					<div>
						<div className="mb-4 font-mono text-muted-foreground text-sm">
							SIGNALS WE USE
						</div>
						<div className="rounded-2xl border bg-card p-1.5">
							{SIGNAL_LIST.map((item, index) => (
								<div
									className={cn(
										"grid grid-cols-[150px_1fr] items-center gap-3 px-3 py-2.5 text-[13px]",
										index < SIGNAL_LIST.length - 1 && "border-border border-b"
									)}
									key={item.k}
								>
									<div className="font-medium">{item.k}</div>
									<div className="text-muted-foreground">{item.v}</div>
								</div>
							))}
						</div>
						<a
							className={cn(buttonVariants({ variant: "outline" }), "mt-4")}
							href="/feed"
						>
							See real flags in the public feed
							<ArrowRight data-icon="inline-end" />
						</a>
					</div>
				</div>
			</Section>

			<Section>
				<SectionHead
					eyebrow="Side-by-side"
					title="What GitHub shows you. What you actually need to see."
				/>
				<div className="grid gap-4 lg:grid-cols-2">
					<CompareGitHub />
					<CompareOverlay />
				</div>
			</Section>

			<Section>
				<SectionHead
					eyebrow="The trust graph"
					sub="Every flag links the account to the maintainers who reported it and the repositories it affected. Disputes are open, dismissals are tracked, false positives are surfaced."
					title="Every flag is public. Every report leaves a trail."
				/>
				<div className="rounded-2xl border bg-card p-6">
					<TrustGraph
						affectedCount={account.flagged}
						handle={account.handle}
						initials={account.avatar}
						repoNames={EXAMPLE_REPO_NAMES}
						reporterCount={account.reporters.length}
						reporters={account.reporters}
					/>
				</div>
			</Section>

			<Section>
				<SectionHead
					eyebrow="Maintainer workflow"
					sub="OSS Protector never touches your PRs — no bot comments, no status checks. Flagged contributors land in your notifications and dashboard queue, ready to confirm, dismiss, or allow in one click."
					title="Quiet by default. Loud when it matters."
				/>
				<div className="grid items-center gap-6 lg:grid-cols-2">
					<FlagCardMock />
					<ConfirmFlow />
				</div>
			</Section>

			<Section>
				<SectionHead
					eyebrow="Coverage"
					title={
						repoCount > 0
							? `Quietly working across ${repoCount.toLocaleString()} ${repoCount === 1 ? "repository" : "repositories"}.`
							: "Be the first repository we protect."
					}
				/>
				{coverageRepos.length === 0 ? (
					<p className="text-[15px] text-muted-foreground leading-relaxed">
						No repositories are protected yet. Install the GitHub App to add
						yours. Public flag data shows up here as soon as the first PR is
						reviewed.
					</p>
				) : (
					<div className="flex flex-wrap gap-2">
						{coverageRepos.map((repo) => (
							<Badge
								key={repo.fullName}
								render={
									// biome-ignore lint/a11y/useAnchorContent: anchor content is injected from the component children at runtime via the Base UI render prop
									<a
										aria-label={repo.fullName}
										href={`/repo/${repo.fullName}`}
									/>
								}
								size="tag"
								variant="outline"
							>
								<Star />
								{repo.fullName}
							</Badge>
						))}
						{repoCount > coverageRepos.length ? (
							<Badge size="tag" variant="primary">
								+ {(repoCount - coverageRepos.length).toLocaleString()} more
							</Badge>
						) : null}
					</div>
				)}
			</Section>

			<Section narrow>
				<SectionHead
					center
					eyebrow="Pricing"
					title={
						<>
							Free. <span className="text-primary">For everyone. Forever.</span>
						</>
					}
				/>
				<div className="hero-glow relative overflow-hidden rounded-3xl border bg-card px-8 py-14 text-center">
					<div className="relative font-medium text-7xl leading-none tracking-tight">
						$<span className="text-primary">0</span>
					</div>
					<p className="relative mx-auto mt-4 mb-7 max-w-xl text-[15.5px] text-muted-foreground">
						OSS Protector is run by maintainers, for maintainers. No paid tiers,
						no enterprise plan, no upsell. If you want to support the project,
						sponsor us on GitHub, but the tool stays free for everyone.
					</p>
					<div className="relative flex flex-wrap justify-center gap-2.5">
						<a className={cn(buttonVariants({ size: "lg" }))} href="/login">
							<Github data-icon="inline-start" />
							Sign in with GitHub
						</a>
						<a
							className={cn(buttonVariants({ size: "lg", variant: "outline" }))}
							href={githubAppInstallUrl}
						>
							<Shield data-icon="inline-start" />
							Install the App
						</a>
					</div>
					<a
						className="relative mt-3 inline-flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground"
						href="/sponsors"
					>
						<Heart className="size-3.5" />
						Sponsor the project
					</a>
				</div>
			</Section>
		</>
	);
}

function HeroSection({
	recentFlags,
	stats,
}: {
	recentFlags: LiveFeedItem[];
	stats: DirectoryDashboard["stats"];
}) {
	const fmt = (value: number) => value.toLocaleString();
	// Fresh installs (and the public instance before it has data) would otherwise
	// show a wall of zeros, which reads as broken. Fall back to honest qualitative
	// stats until there's real coverage to report.
	const hasData =
		stats.trackedUsers > 0 ||
		stats.activeRepositories > 0 ||
		stats.trackedPrs > 0;
	return (
		<section className="hero-glow hero-grid relative overflow-hidden px-4 pt-20 pb-12 md:px-8">
			<div className="relative z-10 mx-auto grid w-full max-w-[1240px] items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
				<div>
					<span className="inline-flex items-center gap-2 rounded-full border bg-muted px-3 py-1.5 font-mono text-muted-foreground text-xs">
						<span className="inline-block size-1.5 rounded-full bg-success" />
						community-run · MIT licensed
					</span>
					<h1 className="mt-4 mb-5 text-balance font-medium text-[clamp(40px,5.4vw,68px)] leading-[0.98] tracking-tight">
						Stop reviewing
						<br />
						<span className="text-muted-foreground line-through decoration-[3px] decoration-destructive">
							bot
						</span>{" "}
						<span className="text-primary">noise.</span>
					</h1>
					<p className="mb-7 max-w-xl text-[17.5px] text-muted-foreground leading-relaxed">
						OSS Protector is a community-run GitHub App that flags AI-generated
						spam pull requests before they hit your review queue. Free,
						transparent, and built by maintainers, for maintainers.
					</p>
					<div className="flex flex-wrap items-center gap-2.5">
						<a className={cn(buttonVariants({ size: "lg" }))} href="/login">
							<Github data-icon="inline-start" />
							Sign in with GitHub
						</a>
						<a
							className={cn(buttonVariants({ size: "lg", variant: "outline" }))}
							href={githubAppInstallUrl}
						>
							<Shield data-icon="inline-start" />
							Install the App
						</a>
					</div>
					<a
						className="mt-3 inline-flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground"
						href="/feed"
					>
						or browse the public feed
						<ArrowRight className="size-3.5" />
					</a>
					{hasData ? (
						<div className="mt-7 flex flex-wrap gap-6 font-mono text-muted-foreground text-xs">
							<span>
								<b className="font-medium text-foreground tabular-nums">
									{fmt(stats.trackedUsers)}
								</b>{" "}
								flagged accounts
							</span>
							<span>
								<b className="font-medium text-foreground tabular-nums">
									{fmt(stats.activeRepositories)}
								</b>{" "}
								repos protected
							</span>
							<span>
								<b className="font-medium text-foreground tabular-nums">
									{fmt(stats.signals)}
								</b>{" "}
								signals tracked
							</span>
						</div>
					) : (
						<div className="mt-7 font-mono text-muted-foreground text-xs">
							Just launched. Be the first repository we protect.
						</div>
					)}
				</div>
				<LiveFeed height={460} items={recentFlags} />
			</div>

			<div className="relative z-10 mx-auto mt-16 w-full max-w-[1240px]">
				<StatStrip
					stats={
						hasData
							? [
									{ label: "flagged accounts", value: fmt(stats.trackedUsers) },
									{
										label: "pull requests tracked",
										value: fmt(stats.trackedPrs),
									},
									{ label: "open reports", value: fmt(stats.openReports) },
									{ label: "forever, no tiers", value: "$0" },
								]
							: [
									{ label: "forever, no tiers", value: "$0" },
									{ label: "open source", value: "MIT" },
									{ label: "to protect a repo", value: "1 click" },
									{ label: "scoring", value: "public" },
								]
					}
				/>
			</div>
		</section>
	);
}

function ProblemQueue() {
	return (
		<div className="overflow-hidden rounded-2xl border bg-card">
			<div className="flex items-center justify-between border-b px-4 py-3 font-mono text-muted-foreground text-xs">
				<span>maintainer inbox · last Tuesday</span>
				<span>15 PRs</span>
			</div>
			{PROBLEM_ROWS.map((row) => (
				<div
					className="grid grid-cols-[22px_1fr_auto] items-center gap-3 border-b px-4 py-2.5 text-sm last:border-0"
					key={`${row.by}-${row.title}`}
				>
					<span className={row.human ? "text-success" : "text-destructive"}>
						{row.human ? (
							<User className="size-3.5" />
						) : (
							<Bot className="size-3.5" />
						)}
					</span>
					<div className="min-w-0">
						<div className="truncate font-medium text-[13.5px]">
							{row.title}
						</div>
						<div className="font-mono text-[11.5px] text-muted-foreground/70">
							{row.by} · {row.time}
						</div>
					</div>
					{row.human ? (
						<Badge variant="success">
							<Check />
							human
						</Badge>
					) : (
						<Badge variant="destructive">
							<Bot />
							{Math.round(row.score * 100)}%
						</Badge>
					)}
				</div>
			))}
		</div>
	);
}

function CompareGitHub() {
	return (
		<div className="overflow-hidden rounded-2xl border bg-card">
			<div className="flex items-center gap-2 border-b px-3.5 py-2.5 font-mono text-muted-foreground text-xs">
				<Github className="size-3.5" />
				github.com/withastro/astro
			</div>
			<div className="flex items-start gap-3 p-5">
				<InitialsAvatar
					className="size-10 text-[13px]"
					color={1}
					initials="C9"
				/>
				<div className="flex-1">
					<div className="flex flex-wrap items-center gap-1.5 text-sm">
						<span className="font-medium">autopr-helper-99</span>
						<span className="text-muted-foreground">opened</span>
						<span className="font-mono text-muted-foreground">#84221</span>
						<span className="text-muted-foreground">2 hours ago</span>
					</div>
					<div className="mt-1.5 font-medium text-[15px]">
						fix: typo in README
					</div>
					<Badge className="mt-1.5" variant="outline">
						<Check />
						Contributor
					</Badge>
					<p className="mt-3.5 text-[13.5px] text-muted-foreground leading-relaxed">
						"Hello! I noticed a small typo in the README and wanted to help. Let
						me know if you'd like any other improvements!"
					</p>
				</div>
			</div>
		</div>
	);
}

function CompareOverlay() {
	return (
		<div className="overflow-hidden rounded-2xl border border-primary/30 bg-card">
			<div className="flex items-center gap-2 border-b px-3.5 py-2.5 font-mono text-primary text-xs">
				<Shield className="size-3.5" />+ OSS Protector overlay
			</div>
			<div className="flex items-start gap-3 p-5">
				<InitialsAvatar
					className="size-10 text-[13px]"
					color={1}
					initials="C9"
				/>
				<div className="flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<span className="font-medium text-sm">autopr-helper-99</span>
						<ConfidenceBadge value={0.97} />
						<span className="font-mono text-muted-foreground text-xs">
							account age 27d
						</span>
					</div>
					<div className="mt-1.5 font-medium text-[15px]">
						fix: typo in README
					</div>
					<div className="mt-2 flex flex-wrap gap-2">
						<Badge variant="destructive">
							<Bot />
							likely automated
						</Badge>
						<Badge variant="warning">14 prior reports</Badge>
						<Badge variant="outline">184 PRs · 142 repos</Badge>
					</div>
					<Alert className="mt-3.5" variant="destructive-soft">
						<AlertDescription>
							<b className="text-foreground">Why flagged.</b> Account opened 27
							days ago has filed 184 PRs across 142 unrelated repositories. Diff
							signature matches the "helpful-assistant" family. Five maintainers
							confirmed prior reports.
						</AlertDescription>
					</Alert>
					<div className="mt-3 flex flex-wrap gap-2">
						<Button size="sm" type="button" variant="success">
							<Check />
							Confirm
						</Button>
						<Button size="sm" type="button" variant="ghost">
							<X />
							Dismiss
						</Button>
						<Button size="sm" type="button" variant="ghost">
							Allow author
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}

function FlagCardMock() {
	return (
		<div className="overflow-hidden rounded-2xl border bg-card">
			<div className="flex items-center gap-2.5 border-b bg-muted px-3.5 py-2.5 text-sm">
				<Bell className="size-3.5" />
				<span className="font-medium">New flag in your review queue</span>
				<span className="ml-auto font-mono text-muted-foreground text-xs">
					2 minutes ago
				</span>
			</div>
			<div className="p-4 text-[13.5px] text-muted-foreground leading-relaxed">
				<div className="mb-2.5 flex items-center gap-2">
					<ConfidenceBadge value={0.97} />
					<Badge variant="destructive">
						<Bot />
						likely automated
					</Badge>
				</div>
				<p>
					<span className="font-mono">@autopr-helper-99</span> opened a PR on{" "}
					<span className="font-mono text-foreground">acme/web</span>. The
					account was created 27 days ago and has filed{" "}
					<b className="text-foreground">184 PRs across 142 repositories</b>.
					The diff signature matches the "helpful-assistant v3" template family.
				</p>
				<p className="mt-2.5 text-[12.5px]">
					Reported by <span className="text-foreground">@evanw</span>,{" "}
					<span className="text-foreground">@kentcdodds</span>, and 3 others.
				</p>
			</div>
			<div className="flex flex-wrap gap-2 border-t bg-muted px-3.5 py-3">
				<Button size="sm" type="button" variant="success">
					<Check />
					Confirm flag
				</Button>
				<Button size="sm" type="button" variant="ghost">
					<X />
					Dismiss
				</Button>
				<Button size="sm" type="button" variant="ghost">
					Allow author
				</Button>
			</div>
		</div>
	);
}

function ConfirmFlow() {
	return (
		<div>
			<h3 className="mb-3.5 font-medium text-2xl tracking-tight">
				Three buttons. <span className="text-primary">Three seconds.</span>
			</h3>
			<p className="text-[15px] text-muted-foreground leading-relaxed">
				<b className="text-foreground">Confirm</b>: adds the account to the
				shared blocklist for your repos.
				<br />
				<b className="text-foreground">Dismiss</b>: clears it from your queue.
				We learn from it.
				<br />
				<b className="text-foreground">Allow author</b>: marks them as trusted
				in your repos forever. Whitelist, not blocklist.
			</p>
			<Alert className="mt-5" variant="success">
				<AlertDescription>
					<b className="text-success">★ Federated decisions.</b> When you
					confirm a flag, every other repo running OSS Protector benefits. The
					blocklist is shared. The trust graph grows. Bots get nowhere to go.
				</AlertDescription>
			</Alert>
		</div>
	);
}
