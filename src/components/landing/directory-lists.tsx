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
import { Progress } from "@/components/ui/progress";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

import { reasonLabel } from "./analytics";
import { EmptyState, StatusBadge } from "./shared";
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
		<Card className="rounded-lg">
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<AlertTriangle className="size-5 text-destructive" />
					{title}
				</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent>
				{profiles.length > 0 ? (
					<>
						<MobileRiskList profiles={profiles} />
						<DesktopRiskTable profiles={profiles} />
					</>
				) : (
					<EmptyState
						description="The directory is empty. Install the app on a repository or seed/import signal data to start publishing accounts."
						icon={AlertTriangle}
						title="No clankers listed"
					/>
				)}
			</CardContent>
		</Card>
	);
}

export function ProtectorsCard({
	description = "Maintainers whose reports are already captured.",
	protectors,
	startIndex = 0,
	title = "Protectors",
}: {
	description?: string;
	protectors: Protector[];
	startIndex?: number;
	title?: string;
}) {
	return (
		<Card className="rounded-lg">
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<UsersRound className="size-5 text-primary" />
					{title}
				</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent>
				{protectors.length > 0 ? (
					<div className="grid gap-3">
						{protectors.map((protector, index) => (
							<div
								className="flex items-center justify-between gap-3 rounded-lg border bg-muted/25 p-3"
								key={protector.login}
							>
								<div className="min-w-0">
									<p className="truncate font-medium">
										{startIndex + index + 1}. @{protector.login}
									</p>
									<p className="text-muted-foreground text-xs">
										{protector.validatedReports} validated of{" "}
										{protector.reports} reports
									</p>
								</div>
								<Badge variant="secondary">
									<CheckCircle2 className="size-3.5" />
									{protector.score}
								</Badge>
							</div>
						))}
					</div>
				) : (
					<EmptyState
						description="Protector profiles appear after maintainers report accounts from GitHub issues or pull requests."
						icon={UsersRound}
						title="No protectors yet"
					/>
				)}
			</CardContent>
		</Card>
	);
}

function MobileRiskList({ profiles }: { profiles: RiskProfile[] }) {
	return (
		<div className="grid gap-3 md:hidden">
			{profiles.map((profile) => (
				<div className="rounded-lg border bg-muted/20 p-3" key={profile.login}>
					<div className="flex items-start justify-between gap-3">
						<AccountCell compact profile={profile} />
						<StatusBadge status={profile.status} />
					</div>
					<div className="mt-3 grid gap-2">
						<div className="flex items-center justify-between gap-3 text-sm">
							<span className="text-muted-foreground">Score</span>
							<span className="font-mono tabular-nums">
								{profile.score} / {profile.confidence}%
							</span>
						</div>
						<Progress
							aria-label={`Risk confidence for @${profile.login}`}
							className="h-2"
							value={profile.confidence}
						/>
						<div className="flex items-center justify-between gap-3 text-sm">
							<span className="text-muted-foreground">Signal</span>
							<span>{profile.prCount.toLocaleString()} PRs observed</span>
						</div>
						<ReasonBadges reasons={profile.reasonCodes} />
					</div>
				</div>
			))}
		</div>
	);
}

function DesktopRiskTable({ profiles }: { profiles: RiskProfile[] }) {
	return (
		<div className="hidden md:block">
			<Table aria-label="Clanker review feed">
				<TableHeader>
					<TableRow>
						<TableHead>Account</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Score</TableHead>
						<TableHead>Signal</TableHead>
						<TableHead>Reason</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{profiles.map((profile) => (
						<TableRow key={profile.login}>
							<TableCell>
								<AccountCell profile={profile} />
							</TableCell>
							<TableCell>
								<StatusBadge status={profile.status} />
							</TableCell>
							<TableCell className="min-w-36">
								<div className="grid gap-1">
									<div className="flex items-center justify-between gap-2">
										<span className="font-mono text-sm tabular-nums">
											{profile.score}
										</span>
										<span className="text-muted-foreground text-xs">
											{profile.confidence}%
										</span>
									</div>
									<Progress
										aria-label={`Risk confidence for @${profile.login}`}
										className="h-2"
										value={profile.confidence}
									/>
								</div>
							</TableCell>
							<TableCell>
								<span className="text-muted-foreground text-sm">
									{profile.prCount.toLocaleString()} PRs observed
								</span>
							</TableCell>
							<TableCell>
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
			<Avatar className="size-10">
				{profile.avatarUrl ? (
					<AvatarImage alt={profile.login} src={profile.avatarUrl} />
				) : null}
				<AvatarFallback>
					{profile.login.slice(0, 2).toUpperCase()}
				</AvatarFallback>
			</Avatar>
			<div className="min-w-0">
				<a
					className="inline-flex max-w-40 items-center gap-1 truncate font-medium hover:underline md:max-w-52"
					href={profile.htmlUrl ?? "#"}
					rel="noopener noreferrer"
					target="_blank"
				>
					@{profile.login}
					<ExternalLink className="size-3 shrink-0" />
				</a>
				{compact ? null : (
					<p className="text-muted-foreground text-xs">
						{profile.importedSource ?? "GitHub webhook evidence"}
					</p>
				)}
			</div>
		</div>
	);
}

function ReasonBadges({ reasons }: { reasons: string[] }) {
	if (reasons.length === 0) {
		return (
			<span className="text-muted-foreground text-sm">No reason stored</span>
		);
	}

	return (
		<div className="flex max-w-72 flex-wrap gap-1">
			{reasons.slice(0, 2).map((reason) => (
				<Badge key={reason} variant="outline">
					{reasonLabel(reason)}
				</Badge>
			))}
		</div>
	);
}
