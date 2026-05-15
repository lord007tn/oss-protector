import {
	Activity,
	AlertTriangle,
	Github,
	type LucideIcon,
	MessageSquareWarning,
	ShieldCheck,
	UsersRound,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { DirectoryDashboard } from "@/data-access/directory";

import { githubAppInstallUrl } from "./constants";
import type { LandingAnalytics } from "./types";

export function Hero({
	analytics,
	dashboard,
}: {
	analytics: LandingAnalytics;
	dashboard: DirectoryDashboard;
}) {
	return (
		<section className="border-b">
			<div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-12 md:px-6 md:py-20">
				<div className="mx-auto flex max-w-3xl flex-col items-center gap-5 text-center">
					<img
						alt="OSS Protector"
						className="size-16 rounded-2xl border bg-card object-cover shadow-sm"
						height={64}
						src="/oss-protector-mark.svg"
						width={64}
					/>
					<Badge className="rounded-md" variant="secondary">
						<ShieldCheck className="size-3.5" />
						GitHub App + public clanker feed
					</Badge>
					<h1 className="text-balance font-semibold text-4xl md:text-5xl">
						A shared watchlist for open-source maintainers.
					</h1>
					<p className="max-w-2xl text-pretty text-lg text-muted-foreground leading-8">
						OSS Protector turns maintainer reports and imported abuse signals
						into a simple clanker feed that projects can review before they
						merge suspicious pull requests.
					</p>
					<div className="flex flex-wrap justify-center gap-3">
						<a
							className={buttonVariants({ size: "lg" })}
							href={githubAppInstallUrl}
						>
							<Github data-icon="inline-start" />
							Install GitHub App
						</a>
						<a
							className={buttonVariants({ size: "lg", variant: "outline" })}
							href="/clankers"
						>
							<UsersRound data-icon="inline-start" />
							View clankers
						</a>
					</div>
				</div>

				<div className="mx-auto grid w-full max-w-4xl gap-4 md:grid-cols-3">
					<LiveMetric
						icon={AlertTriangle}
						label="Risky accounts"
						value={analytics.riskyAccounts}
					/>
					<LiveMetric
						icon={MessageSquareWarning}
						label="Maintainer reports"
						value={dashboard.reports.length}
					/>
					<LiveMetric
						icon={Activity}
						label="Imported records"
						value={dashboard.stats.importedUsers}
					/>
				</div>
			</div>
		</section>
	);
}

function LiveMetric({
	icon: Icon,
	label,
	value,
}: {
	icon: LucideIcon;
	label: string;
	value: number;
}) {
	return (
		<Card className="rounded-lg">
			<CardContent className="flex items-center justify-between gap-3 p-4">
				<div>
					<p className="text-muted-foreground text-sm">{label}</p>
					<p className="mt-1 font-semibold text-3xl tabular-nums">
						{value.toLocaleString()}
					</p>
				</div>
				<span className="grid size-10 place-items-center rounded-lg border bg-muted/35 text-primary">
					<Icon className="size-5" />
				</span>
			</CardContent>
		</Card>
	);
}
