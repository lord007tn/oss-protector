import { createFileRoute } from "@tanstack/react-router";
import {
	ArrowRight,
	ChevronRight,
	Github,
	Settings,
	Shield,
} from "lucide-react";
import type { ReactNode } from "react";

import type { RepoProfileResult } from "@/actions/repo-profile";
import {
	githubAppInstallUrl,
	publicAppUrl,
} from "@/components/landing/constants";
import { StatusBadge } from "@/components/landing/shared";
import { InitialsAvatar } from "@/components/oss/initials-avatar";
import { PageContainer, PageShell } from "@/components/site/page-shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { REASON_LABELS, type ReasonCode } from "@/constants/reason-codes";
import { getRepoProfileFn } from "@/functions/repo-profile";
import { relativeTime } from "@/lib/directory-view";
import { cn } from "@/lib/utils";

const avatarColor = (login: string) => ((login.charCodeAt(0) || 0) % 6) + 1;
const initials = (login: string) => login.slice(0, 2).toUpperCase();

export const Route = createFileRoute("/repo/$owner/$name")({
	component: RepoRoute,
	head: ({ params }) => ({
		links: [
			{
				href: `${publicAppUrl}/repo/${params.owner}/${params.name}`,
				rel: "canonical",
			},
		],
		meta: [
			{ title: `${params.owner}/${params.name} | OSS Protector` },
			{
				content: `Public flag activity and coverage for ${params.owner}/${params.name}.`,
				name: "description",
			},
		],
	}),
	loader: ({ params }) =>
		getRepoProfileFn({ data: { name: params.name, owner: params.owner } }),
});

function RepoStat({
	label,
	value,
	sub,
}: {
	label: string;
	value: ReactNode;
	sub: string;
}) {
	return (
		<div className="rounded-2xl border bg-card p-5">
			<div className="font-mono text-muted-foreground text-xs uppercase tracking-[0.06em]">
				{label}
			</div>
			<div className="mt-2 font-medium text-3xl tabular-nums tracking-tight">
				{value}
			</div>
			<div className="mt-1 font-mono text-muted-foreground text-xs">{sub}</div>
		</div>
	);
}

function RepoRoute() {
	const profile = Route.useLoaderData() as RepoProfileResult;

	return (
		<PageShell>
			<PageContainer className="py-9">
				<div className="mb-4 flex items-center gap-2 text-muted-foreground text-sm">
					<a className="hover:text-foreground" href="/">
						Home
					</a>
					<ChevronRight className="size-3" />
					<a className="hover:text-foreground" href="/accounts">
						Accounts
					</a>
					<ChevronRight className="size-3" />
					<span className="font-mono">{profile.fullName}</span>
				</div>

				<RepoHeader profile={profile} />

				<div className="mt-5 grid gap-4 sm:grid-cols-3">
					<RepoStat
						label="Reports · all-time"
						sub="captured for this repo"
						value={profile.reportCount.toLocaleString()}
					/>
					<RepoStat
						label="Flagged accounts"
						sub="distinct authors reported"
						value={profile.flaggedAccounts.toLocaleString()}
					/>
					<RepoStat
						label="Coverage"
						sub={profile.isProtected ? "OSS Protector active" : "not installed"}
						value={profile.isProtected ? "On" : "Off"}
					/>
				</div>

				<div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
					<RecentFlags profile={profile} />
					<div className="flex flex-col gap-5">
						<TopAccounts profile={profile} />
						<div className="flex items-start gap-2.5 rounded-xl border border-info/25 bg-info/10 p-3.5 text-[13.5px] text-muted-foreground leading-relaxed">
							<Shield className="mt-0.5 size-3.5 shrink-0 text-info" />
							<div>
								<b className="text-foreground">Public data.</b> Repo-level flag
								stats are public for every public repo we've scored. Maintainer
								controls require installing the GitHub App.
							</div>
						</div>
					</div>
				</div>
			</PageContainer>
		</PageShell>
	);
}

function RepoHeader({ profile }: { profile: RepoProfileResult }) {
	return (
		<div className="grid items-center gap-5 rounded-2xl border bg-card p-7 md:grid-cols-[72px_1fr_auto]">
			<div className="flex size-18 items-center justify-center rounded-xl border bg-muted text-primary">
				<Shield className="size-9" />
			</div>
			<div className="min-w-0">
				<div className="font-mono text-muted-foreground text-xs">
					{profile.ownerLogin}/
				</div>
				<h1 className="mt-0.5 mb-2 flex flex-wrap items-center gap-2.5 font-medium text-3xl tracking-tight">
					<span className="font-mono">{profile.name}</span>
					{profile.isProtected ? (
						<Badge variant="success">
							<Shield />
							protected
						</Badge>
					) : (
						<Badge variant="warning">not yet protected</Badge>
					)}
				</h1>
				<div className="flex flex-wrap gap-4 font-mono text-muted-foreground text-xs">
					{profile.tracked ? (
						<span>{profile.reportCount} reports captured</span>
					) : (
						<span>not yet seen by OSS Protector</span>
					)}
					{profile.isPrivate ? <span>private repo</span> : null}
				</div>
			</div>
			<div className="flex flex-col gap-2">
				<a
					className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
					href={profile.htmlUrl}
					rel="noreferrer noopener"
					target="_blank"
				>
					<Github data-icon="inline-start" />
					Open on GitHub
				</a>
				{profile.isProtected ? (
					<a
						className={cn(buttonVariants({ size: "sm", variant: "ghost" }))}
						href="/dashboard"
					>
						<Settings data-icon="inline-start" />
						Open in dashboard
					</a>
				) : (
					<a
						className={cn(buttonVariants({ size: "sm" }))}
						href={githubAppInstallUrl}
					>
						<Shield data-icon="inline-start" />
						Add to your install
					</a>
				)}
			</div>
		</div>
	);
}

function RecentFlags({ profile }: { profile: RepoProfileResult }) {
	return (
		<div className="overflow-hidden rounded-2xl border bg-card">
			<div className="flex items-center justify-between border-b px-5 py-4">
				<div>
					<div className="font-medium text-[15px]">
						Recent flags · {profile.flags.length}
					</div>
					<div className="mt-0.5 text-muted-foreground text-xs">
						Public flag history for this repository.
					</div>
				</div>
				<a
					className={cn(buttonVariants({ size: "sm", variant: "ghost" }))}
					href="/feed"
				>
					All flags
					<ArrowRight data-icon="inline-end" />
				</a>
			</div>
			{profile.flags.length === 0 ? (
				<div className="px-5 py-10 text-center text-muted-foreground text-sm">
					{profile.isPrivate
						? "Flag detail is hidden for private repositories."
						: "No flags recorded for this repository yet."}
				</div>
			) : (
				profile.flags.map((flag) => (
					<a
						className="grid grid-cols-[28px_1fr_auto] items-center gap-3 border-t px-5 py-3 transition-colors hover:bg-muted"
						href={`/accounts/${flag.login}`}
						key={`${flag.login}-${flag.prNumber ?? flag.createdAt}`}
					>
						<InitialsAvatar
							className="size-7 text-[10px]"
							color={avatarColor(flag.login)}
							initials={initials(flag.login)}
						/>
						<div className="min-w-0">
							<div className="flex items-center gap-2 text-[13.5px]">
								<span className="font-medium">@{flag.login}</span>
								{flag.prNumber ? (
									<span className="font-mono text-muted-foreground text-xs">
										#{flag.prNumber}
									</span>
								) : null}
							</div>
							<div className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
								{REASON_LABELS[flag.reasonCode as ReasonCode] ??
									flag.reasonCode}
							</div>
						</div>
						<div className="flex items-center gap-3">
							<span className="font-mono text-muted-foreground text-xs tabular-nums">
								{flag.confidence}%
							</span>
							<span className="hidden font-mono text-muted-foreground text-xs sm:inline">
								{relativeTime(flag.createdAt)}
							</span>
						</div>
					</a>
				))
			)}
		</div>
	);
}

function TopAccounts({ profile }: { profile: RepoProfileResult }) {
	return (
		<div className="rounded-2xl border bg-card p-5">
			<div className="mb-3 font-mono text-muted-foreground text-xs uppercase tracking-[0.07em]">
				Most-reported accounts in this repo
			</div>
			{profile.topAccounts.length === 0 ? (
				<p className="text-[13.5px] text-muted-foreground">
					No reported accounts yet.
				</p>
			) : (
				profile.topAccounts.map((account) => (
					<a
						className="grid grid-cols-[28px_1fr_auto] items-center gap-2.5 border-border border-t py-2.5 first:border-0"
						href={`/accounts/${account.login}`}
						key={account.login}
					>
						<InitialsAvatar
							className="size-7 text-[10px]"
							color={avatarColor(account.login)}
							initials={initials(account.login)}
						/>
						<div className="min-w-0">
							<div className="truncate font-medium text-[13px]">
								@{account.login}
							</div>
							<div className="text-muted-foreground text-xs">
								{account.reportCount} report
								{account.reportCount === 1 ? "" : "s"} · score {account.score}
							</div>
						</div>
						<StatusBadge status={account.status} />
					</a>
				))
			)}
		</div>
	);
}
