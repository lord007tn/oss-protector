import {
	Activity,
	AlertTriangle,
	Github,
	type LucideIcon,
	MessageSquareWarning,
	ShieldCheck,
} from "lucide-react";

import type { DirectoryDashboard } from "@/actions/directory";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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
			<div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 md:px-6 md:py-16">
				<div className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
					<div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-[0.18em]">
						<ShieldCheck className="size-3.5" />
						GitHub App · public clanker feed
					</div>
					<h1 className="text-balance font-semibold text-3xl tracking-tight md:text-[2.75rem] md:leading-[1.1]">
						A shared watchlist for open-source maintainers.
					</h1>
					<p className="max-w-xl text-pretty text-muted-foreground text-sm leading-6 md:text-[15px] md:leading-7">
						OSS Protector turns maintainer reports and imported abuse signals
						into a clanker feed projects can review before merging suspicious
						pull requests.
					</p>
					<div className="mt-1 flex flex-wrap justify-center gap-2">
						<a
							className={buttonVariants({ size: "sm" })}
							href={githubAppInstallUrl}
						>
							<Github data-icon="inline-start" />
							Install GitHub App
						</a>
						<a
							className={buttonVariants({ size: "sm", variant: "outline" })}
							href="/clankers"
						>
							Browse clankers
						</a>
					</div>
				</div>

				<div className="mx-auto grid w-full max-w-3xl gap-3 sm:grid-cols-3">
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
		<Card className="rounded-md border-muted/60">
			<CardContent className="flex items-center justify-between gap-3 p-3.5">
				<div>
					<p className="text-muted-foreground text-xs uppercase tracking-wide">
						{label}
					</p>
					<p className="mt-1 font-semibold text-2xl tabular-nums">
						{value.toLocaleString()}
					</p>
				</div>
				<span className="grid size-8 place-items-center rounded-md border border-muted bg-muted/30 text-muted-foreground">
					<Icon className="size-4" />
				</span>
			</CardContent>
		</Card>
	);
}
