import { createFileRoute } from "@tanstack/react-router";
import {
	AlertTriangle,
	ArrowLeft,
	ExternalLink,
	Github,
	GitPullRequest,
	History,
	Lock,
	ShieldQuestion,
} from "lucide-react";

import type { ClankerProfileResult } from "@/actions/clanker-profile";
import { publicAppUrl } from "@/components/landing/constants";
import { Footer } from "@/components/landing/footer";
import { ScoreMeter, StatusBadge } from "@/components/landing/shared";
import { SiteHeader } from "@/components/landing/site-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
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
import { Separator } from "@/components/ui/separator";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { REASON_LABELS, type ReasonCode } from "@/constants/reason-codes";
import { REPORT_STATUS_LABELS } from "@/constants/report-statuses";
import { getClankerProfileFn } from "@/functions/clanker-profile";

export const Route = createFileRoute("/clankers_/$login")({
	component: ClankerProfileRoute,
	head: ({ params }) => ({
		links: [
			{
				href: `${publicAppUrl}/clankers/${params.login}`,
				rel: "canonical",
			},
		],
		meta: [
			{ title: `@${params.login} — OSS Protector profile` },
			{
				content: `Public review profile for @${params.login} on OSS Protector. Recent public PRs, reports, and risk score.`,
				name: "description",
			},
		],
	}),
	loader: async ({ params }) =>
		getClankerProfileFn({ data: { login: params.login } }),
});

function ClankerProfileRoute() {
	const profile = Route.useLoaderData() as ClankerProfileResult | undefined;
	const { login } = Route.useParams();

	if (!profile || profile.notFound) {
		return <NotFoundView login={login} />;
	}

	return <ProfileView profile={profile} />;
}

function NotFoundView({ login }: { login: string }) {
	return (
		<main className="min-h-screen bg-background text-foreground">
			<SiteHeader />
			<div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-12 md:px-6 md:py-16">
				<BackLink />
				<Empty className="rounded-md border border-dashed bg-muted/15 py-12">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<AlertTriangle />
						</EmptyMedia>
						<EmptyTitle>No profile for @{login}</EmptyTitle>
						<EmptyDescription>
							OSS Protector hasn&apos;t observed this GitHub account on any
							covered repository yet. If you expected to see them here, the bot
							may not be installed on the repo where they contributed.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</div>
			<Footer />
		</main>
	);
}

function ProfileView({ profile }: { profile: ClankerProfileResult }) {
	return (
		<main className="min-h-screen bg-background text-foreground">
			<SiteHeader />
			<div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-10 md:px-6">
				<BackLink />
				<ProfileHeader profile={profile} />
				<div className="grid gap-4 md:grid-cols-3">
					<StatCard
						label="Public PRs observed"
						sublabel={`${profile.totalPrs} total${profile.privatePrCount > 0 ? `, ${profile.privatePrCount} private` : ""}`}
						value={profile.publicPrs.length}
					/>
					<StatCard
						label="Reports"
						sublabel={`${profile.validatedReportCount} validated`}
						value={profile.reportCount}
					/>
					<StatCard
						label="Reasons stored"
						sublabel="Per current profile"
						value={profile.reasonCodes.length}
					/>
				</div>

				<ContestAlert />

				<PublicPullRequestsCard profile={profile} />
				<ReportsCard profile={profile} />
			</div>
			<Footer />
		</main>
	);
}

function BackLink() {
	return (
		<a
			className="inline-flex w-fit items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
			href="/clankers"
		>
			<ArrowLeft className="size-3.5" />
			Back to all clankers
		</a>
	);
}

function ProfileHeader({ profile }: { profile: ClankerProfileResult }) {
	const lastSeenLabel = profile.lastSeenAt
		? new Date(profile.lastSeenAt * 1000).toLocaleString("en", {
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit",
				month: "short",
				year: "numeric",
			})
		: "—";

	return (
		<Card className="rounded-md border-muted/60">
			<CardHeader className="grid gap-4 sm:grid-cols-[auto_1fr_auto] sm:items-start">
				<Avatar className="size-14">
					{profile.avatarUrl ? (
						<AvatarImage alt={profile.login} src={profile.avatarUrl} />
					) : null}
					<AvatarFallback>
						{profile.login.slice(0, 2).toUpperCase()}
					</AvatarFallback>
				</Avatar>
				<div className="grid gap-1.5">
					<CardTitle className="flex flex-wrap items-center gap-2 font-semibold text-2xl tracking-tight">
						<a
							className="inline-flex items-center gap-1 hover:underline"
							href={profile.htmlUrl ?? `https://github.com/${profile.login}`}
							rel="noopener noreferrer"
							target="_blank"
						>
							@{profile.login}
							<ExternalLink className="size-4 text-muted-foreground" />
						</a>
						<StatusBadge status={profile.status} />
					</CardTitle>
					<CardDescription className="text-xs leading-5">
						{profile.summary ?? "No summary on file."}
					</CardDescription>
					<div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-muted-foreground text-xs">
						<span>
							Last seen: <span className="tabular-nums">{lastSeenLabel}</span>
						</span>
						{profile.importedSource ? (
							<span>· Imported from {profile.importedSource}</span>
						) : null}
					</div>
				</div>
				<div className="sm:justify-self-end">
					<ScoreMeter score={profile.score} status={profile.status} />
				</div>
			</CardHeader>
			{profile.reasonCodes.length > 0 ? (
				<CardContent className="pt-0">
					<div className="flex flex-wrap gap-1.5">
						{profile.reasonCodes.map((code) => (
							<Badge key={code} variant="outline">
								{REASON_LABELS[code as ReasonCode] ?? code}
							</Badge>
						))}
					</div>
				</CardContent>
			) : null}
		</Card>
	);
}

function StatCard({
	label,
	sublabel,
	value,
}: {
	label: string;
	sublabel: string;
	value: number;
}) {
	return (
		<Card className="rounded-md border-muted/60">
			<CardContent className="flex flex-col gap-0.5 p-4">
				<p className="font-medium text-[11px] text-muted-foreground uppercase tracking-[0.14em]">
					{label}
				</p>
				<p className="font-mono font-semibold text-2xl tabular-nums">
					{value.toLocaleString()}
				</p>
				<p className="text-muted-foreground text-xs">{sublabel}</p>
			</CardContent>
		</Card>
	);
}

function ContestAlert() {
	return (
		<Alert>
			<ShieldQuestion />
			<AlertTitle>Looking at your own profile?</AlertTitle>
			<AlertDescription>
				OSS Protector is a review aid, not a verdict. If something on this page
				is wrong, see{" "}
				<a className="underline underline-offset-2" href="/contest">
					how to contest a listing
				</a>{" "}
				— most cases are resolved by a maintainer running{" "}
				<code className="font-mono text-[11px]">@oss-protector dismiss</code> or{" "}
				<code className="font-mono text-[11px]">@oss-protector allow</code> on
				the original PR.
			</AlertDescription>
		</Alert>
	);
}

function PublicPullRequestsCard({
	profile,
}: {
	profile: ClankerProfileResult;
}) {
	return (
		<Card className="rounded-md border-muted/60">
			<CardHeader className="space-y-1 pb-3">
				<CardTitle className="flex items-center gap-2 font-medium text-base">
					<GitPullRequest className="size-4 text-muted-foreground" />
					Public PRs the bot has seen
				</CardTitle>
				<CardDescription className="text-xs leading-5">
					Pull requests authored by @{profile.login} on repositories where OSS
					Protector is installed. Only public repos are linked. Click through to
					inspect each PR on GitHub.
					{profile.privatePrCount > 0 ? (
						<>
							{" "}
							<span className="inline-flex items-center gap-1 align-middle">
								<Lock className="size-3" />
								<span className="tabular-nums">{profile.privatePrCount}</span>{" "}
								additional private-repo PR
								{profile.privatePrCount === 1 ? "" : "s"} hidden.
							</span>
						</>
					) : null}
				</CardDescription>
			</CardHeader>
			<CardContent className="p-0 pb-2">
				{profile.publicPrs.length === 0 ? (
					<div className="px-4 pb-4">
						<Empty className="rounded-md border border-dashed bg-muted/15 py-8">
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<GitPullRequest />
								</EmptyMedia>
								<EmptyTitle>No public PRs to show</EmptyTitle>
								<EmptyDescription>
									{profile.totalPrs > 0
										? `All ${profile.totalPrs} observed PR${profile.totalPrs === 1 ? "" : "s"} are on private repositories.`
										: "The bot hasn't observed any PRs from this account yet."}
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					</div>
				) : (
					<div className="hidden md:block">
						<Table aria-label={`Public PRs by @${profile.login}`}>
							<TableHeader>
								<TableRow>
									<TableHead className="pl-4 font-medium text-muted-foreground text-xs uppercase tracking-wide">
										PR
									</TableHead>
									<TableHead className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
										Repository
									</TableHead>
									<TableHead className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
										State
									</TableHead>
									<TableHead className="pr-4 font-medium text-muted-foreground text-xs uppercase tracking-wide">
										Open on GitHub
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{profile.publicPrs.map((pr) => (
									<TableRow
										className="transition-colors hover:bg-muted/25"
										key={pr.htmlUrl}
									>
										<TableCell className="max-w-md truncate pl-4 font-medium text-sm">
											{pr.title}
										</TableCell>
										<TableCell className="font-mono text-muted-foreground text-xs">
											{pr.repositoryFullName}#{pr.number}
										</TableCell>
										<TableCell className="text-muted-foreground text-xs uppercase">
											{pr.state}
										</TableCell>
										<TableCell className="pr-4">
											<a
												className="inline-flex items-center gap-1 text-sm hover:underline"
												href={pr.htmlUrl}
												rel="noopener noreferrer"
												target="_blank"
											>
												<Github className="size-3.5" />
												View
												<ExternalLink className="size-3" />
											</a>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				)}

				<MobilePrList prs={profile.publicPrs} />
			</CardContent>
		</Card>
	);
}

function MobilePrList({ prs }: { prs: ClankerProfileResult["publicPrs"] }) {
	if (prs.length === 0) {
		return null;
	}
	return (
		<ul className="grid gap-2 px-4 pb-2 md:hidden">
			{prs.map((pr) => (
				<li
					className="rounded-md border border-muted/60 bg-muted/15 p-3"
					key={pr.htmlUrl}
				>
					<p className="line-clamp-2 font-medium text-sm">{pr.title}</p>
					<p className="mt-1 font-mono text-muted-foreground text-xs">
						{pr.repositoryFullName}#{pr.number} · {pr.state}
					</p>
					<a
						className={`mt-2 ${buttonVariants({ size: "sm", variant: "outline" })}`}
						href={pr.htmlUrl}
						rel="noopener noreferrer"
						target="_blank"
					>
						<Github data-icon="inline-start" />
						Open on GitHub
					</a>
				</li>
			))}
		</ul>
	);
}

function ReportsCard({ profile }: { profile: ClankerProfileResult }) {
	if (profile.reports.length === 0) {
		return null;
	}
	return (
		<Card className="rounded-md border-muted/60">
			<CardHeader className="space-y-1 pb-3">
				<CardTitle className="flex items-center gap-2 font-medium text-base">
					<History className="size-4 text-muted-foreground" />
					Recent reports
				</CardTitle>
				<CardDescription className="text-xs leading-5">
					Maintainer reports captured for this account. Source links for
					private-repo reports are withheld.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<ul className="grid gap-2">
					{profile.reports.slice(0, 10).map((report) => (
						<li
							className="grid gap-1 rounded-md border border-muted/60 bg-muted/15 px-3 py-2"
							key={`${report.createdAt}-${report.reporterLogin}-${report.reasonCode}`}
						>
							<div className="flex flex-wrap items-center justify-between gap-2">
								<div className="flex flex-wrap items-center gap-2 text-sm">
									<span className="font-medium">@{report.reporterLogin}</span>
									<Badge variant="outline">
										{REASON_LABELS[report.reasonCode] ?? report.reasonCode}
									</Badge>
									<StatusBadge status={report.status} />
								</div>
								<span className="font-mono text-muted-foreground text-xs tabular-nums">
									{new Date(report.createdAt * 1000).toLocaleDateString("en", {
										day: "numeric",
										month: "short",
										year: "numeric",
									})}
								</span>
							</div>
							<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
								<span>
									Status: {REPORT_STATUS_LABELS[report.status] ?? report.status}
								</span>
								<span>
									AI verdict:{" "}
									<code className="font-mono text-[11px]">
										{report.aiVerdict ?? "n/a"}
									</code>{" "}
									({report.confidence}%)
								</span>
								{report.sourceUrl ? (
									<a
										className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
										href={report.sourceUrl}
										rel="noopener noreferrer"
										target="_blank"
									>
										Source
										<ExternalLink className="size-3" />
									</a>
								) : (
									<span className="inline-flex items-center gap-1">
										<Lock className="size-3" /> private-repo source
									</span>
								)}
							</div>
						</li>
					))}
				</ul>
				{profile.reports.length > 10 ? (
					<>
						<Separator className="my-3" />
						<p className="text-muted-foreground text-xs">
							Showing 10 of {profile.reports.length} reports.
						</p>
					</>
				) : null}
			</CardContent>
		</Card>
	);
}
