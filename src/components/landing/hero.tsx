import {
	Activity,
	AlertTriangle,
	ArrowRight,
	Github,
	type LucideIcon,
	MessageSquareWarning,
} from "lucide-react";

import type { DirectoryDashboard } from "@/actions/directory";
import { Badge } from "@/components/ui/badge";
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
					<Badge
						className="gap-1.5 rounded-full bg-muted/40 font-medium text-[11px] text-muted-foreground uppercase tracking-[0.16em]"
						variant="outline"
					>
						<span aria-hidden className="relative flex size-1.5">
							<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
							<span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
						</span>
						Live signal feed
					</Badge>
					<h1 className="text-balance font-semibold text-3xl tracking-tight md:text-[2.75rem] md:leading-[1.05]">
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
							<ArrowRight data-icon="inline-end" />
						</a>
					</div>
				</div>

				<div className="mx-auto grid w-full max-w-3xl gap-3 sm:grid-cols-3">
					<LiveMetric
						icon={AlertTriangle}
						label="Risky accounts"
						tone="destructive"
						value={analytics.riskyAccounts}
					/>
					<LiveMetric
						icon={MessageSquareWarning}
						label="Maintainer reports"
						tone="amber"
						value={dashboard.reports.length}
					/>
					<LiveMetric
						icon={Activity}
						label="Imported records"
						tone="muted"
						value={dashboard.stats.importedUsers}
					/>
				</div>
			</div>
		</section>
	);
}

const TONE_CLASSES = {
	amber: "text-amber-500",
	destructive: "text-destructive",
	muted: "text-muted-foreground",
} as const;

function LiveMetric({
	icon: Icon,
	label,
	tone,
	value,
}: {
	icon: LucideIcon;
	label: string;
	tone: keyof typeof TONE_CLASSES;
	value: number;
}) {
	return (
		<Card className="rounded-md border-muted/60 transition-colors hover:bg-muted/15">
			<CardContent className="flex items-center justify-between gap-3 p-3.5">
				<div>
					<p className="font-medium text-[11px] text-muted-foreground uppercase tracking-[0.14em]">
						{label}
					</p>
					<p className="mt-1 font-mono font-semibold text-2xl tabular-nums">
						{value.toLocaleString()}
					</p>
				</div>
				<span
					className={`grid size-8 place-items-center rounded-md border border-muted bg-muted/30 ${TONE_CLASSES[tone]}`}
				>
					<Icon className="size-4" />
				</span>
			</CardContent>
		</Card>
	);
}
