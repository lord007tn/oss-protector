import {
	AlertTriangle,
	CheckCircle2,
	ExternalLink,
	UsersRound,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

import { reasonLabel } from "./analytics";
import { EmptyState, ScoreMeter, StatusBadge } from "./shared";
import type { Protector, RiskProfile } from "./types";

export function RiskProfilesCard({
	description = "Clankers currently published in the public review feed.",
	profiles,
	title = "Clankers",
}: {
	description?: string;
	profiles: RiskProfile[];
	title?: string;
}) {
	return (
		<Card className="rounded-md border-muted/60">
			<CardHeader className="space-y-1 pb-3">
				<CardTitle className="flex items-center gap-2 font-medium text-base">
					<AlertTriangle className="size-4 text-destructive" />
					{title}
				</CardTitle>
				<CardDescription className="text-xs">{description}</CardDescription>
			</CardHeader>
			<CardContent className="p-0 pb-2">
				{profiles.length > 0 ? (
					<>
						<MobileRiskList profiles={profiles} />
						<DesktopRiskTable profiles={profiles} />
					</>
				) : (
					<div className="px-4 pb-4">
						<EmptyState
							description="No accounts match the current filters. Try clearing filters or installing the app on more repositories."
							icon={AlertTriangle}
							title="No clankers listed"
						/>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

export function ProtectorsCard({
	description = "Maintainers whose reports are captured as review signals.",
	protectors,
	startIndex = 0,
	title = "Review signals",
}: {
	description?: string;
	protectors: Protector[];
	startIndex?: number;
	title?: string;
}) {
	return (
		<Card className="rounded-md border-muted/60">
			<CardHeader className="space-y-1 pb-3">
				<CardTitle className="flex items-center gap-2 font-medium text-base">
					<UsersRound className="size-4 text-muted-foreground" />
					{title}
				</CardTitle>
				<CardDescription className="text-xs">{description}</CardDescription>
			</CardHeader>
			<CardContent>
				{protectors.length > 0 ? (
					<ul className="grid gap-1.5">
						{protectors.map((protector, index) => (
							<li
								className="flex items-center justify-between gap-3 rounded-md border border-muted/50 bg-muted/15 px-3 py-2 transition-colors hover:bg-muted/25"
								key={protector.login}
							>
								<div className="min-w-0">
									<p className="truncate font-medium text-sm">
										<span className="font-mono text-muted-foreground text-xs tabular-nums">
											{String(startIndex + index + 1).padStart(2, "0")}
										</span>{" "}
										· @{protector.login}
									</p>
									<p className="text-muted-foreground text-xs">
										<span className="tabular-nums">
											{protector.validatedReports}
										</span>{" "}
										validated ·{" "}
										<span className="tabular-nums">
											{protector.needsReviewReports +
												protector.submittedReports}
										</span>{" "}
										under review ·{" "}
										<span className="tabular-nums">{protector.reports}</span>{" "}
										total
									</p>
								</div>
								<Badge
									className="gap-1.5 font-mono text-[11px] tabular-nums"
									variant="secondary"
								>
									<CheckCircle2 className="size-3 text-emerald-500" />
									{protector.score}
								</Badge>
							</li>
						))}
					</ul>
				) : (
					<EmptyState
						description="Maintainer review signals appear after reports are submitted from GitHub issues or pull requests."
						icon={UsersRound}
						title="No review signals yet"
					/>
				)}
			</CardContent>
		</Card>
	);
}

function MobileRiskList({ profiles }: { profiles: RiskProfile[] }) {
	return (
		<ul className="grid gap-2 px-4 md:hidden">
			{profiles.map((profile) => (
				<li
					className="grid gap-2 rounded-md border border-muted/60 bg-muted/15 p-3"
					key={profile.login}
				>
					<div className="flex items-start justify-between gap-3">
						<AccountCell compact profile={profile} />
						<StatusBadge status={profile.status} />
					</div>
					<ScoreMeter score={profile.score} status={profile.status} />
					<div className="flex items-center justify-between gap-3 text-xs">
						<span className="text-muted-foreground">Signal</span>
						<span className="tabular-nums">
							{profile.prCount.toLocaleString()} PRs
						</span>
					</div>
					<ReasonBadges reasons={profile.reasonCodes} />
				</li>
			))}
		</ul>
	);
}

function DesktopRiskTable({ profiles }: { profiles: RiskProfile[] }) {
	return (
		<div className="hidden md:block">
			<Table aria-label="Clanker review feed">
				<TableHeader>
					<TableRow>
						<TableHead className="pl-4 font-medium text-muted-foreground text-xs uppercase tracking-wide">
							Account
						</TableHead>
						<TableHead className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
							Status
						</TableHead>
						<TableHead className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
							Score
						</TableHead>
						<TableHead className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
							Signal
						</TableHead>
						<TableHead className="pr-4 font-medium text-muted-foreground text-xs uppercase tracking-wide">
							Reason
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{profiles.map((profile) => (
						<TableRow
							className="transition-colors hover:bg-muted/25"
							key={profile.login}
						>
							<TableCell className="pl-4">
								<AccountCell profile={profile} />
							</TableCell>
							<TableCell>
								<StatusBadge status={profile.status} />
							</TableCell>
							<TableCell>
								<Tooltip>
									<TooltipTrigger
										render={(props) => (
											<div {...props}>
												<ScoreMeter
													score={profile.score}
													status={profile.status}
												/>
											</div>
										)}
									/>
									<TooltipContent>
										<p className="text-xs">
											Score is a 0-100 risk index. Higher = more concrete
											evidence.
										</p>
									</TooltipContent>
								</Tooltip>
							</TableCell>
							<TableCell>
								<span className="text-muted-foreground text-sm tabular-nums">
									{profile.prCount.toLocaleString()} PRs
								</span>
							</TableCell>
							<TableCell className="pr-4">
								<ReasonBadges reasons={profile.reasonCodes} />
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function AccountCell({
	compact = false,
	profile,
}: {
	compact?: boolean;
	profile: RiskProfile;
}) {
	return (
		<div className="flex min-w-0 items-center gap-3 md:min-w-56">
			<Avatar className="size-8">
				{profile.avatarUrl ? (
					<AvatarImage alt={profile.login} src={profile.avatarUrl} />
				) : null}
				<AvatarFallback>
					{profile.login.slice(0, 2).toUpperCase()}
				</AvatarFallback>
			</Avatar>
			<div className="min-w-0">
				<a
					className="inline-flex max-w-40 items-center gap-1 truncate font-medium text-sm hover:underline md:max-w-52"
					href={`/clankers/${profile.login}`}
				>
					@{profile.login}
				</a>
				{compact ? null : (
					<p className="flex items-center gap-1 text-[11px] text-muted-foreground">
						<a
							className="inline-flex items-center gap-0.5 hover:text-foreground hover:underline"
							href={profile.htmlUrl ?? `https://github.com/${profile.login}`}
							rel="noopener noreferrer"
							target="_blank"
						>
							GitHub
							<ExternalLink className="size-2.5" />
						</a>
						<span>·</span>
						<span>{profile.importedSource ?? "Live webhook signal"}</span>
					</p>
				)}
			</div>
		</div>
	);
}

function ReasonBadges({ reasons }: { reasons: string[] }) {
	if (reasons.length === 0) {
		return (
			<span className="text-muted-foreground text-xs">No reason stored</span>
		);
	}

	return (
		<div className="flex max-w-72 flex-wrap gap-1">
			{reasons.slice(0, 2).map((reason) => (
				<Badge
					className="font-medium text-[11px]"
					key={reason}
					variant="outline"
				>
					{reasonLabel(reason)}
				</Badge>
			))}
			{reasons.length > 2 ? (
				<Badge
					className="font-mono text-[11px] text-muted-foreground tabular-nums"
					variant="outline"
				>
					+{reasons.length - 2}
				</Badge>
			) : null}
		</div>
	);
}
