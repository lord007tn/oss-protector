import { createFileRoute } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import type * as React from "react";

import { githubRepoUrl } from "@/components/landing/constants";
import {
	PageContainer,
	PageHeader,
	PageShell,
} from "@/components/site/page-shell";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProgressSegments } from "@/components/ui/progress";
import { buildSharedHead } from "@/lib/head";
import { cn } from "@/lib/utils";

type Tier = "platinum" | "gold" | "silver";

const SPONSORS: { tier: Tier; name: string; amount: string }[] = [
	{ amount: "$2,400/mo", name: "GitHub", tier: "platinum" },
	{ amount: "$1,800/mo", name: "Cloudflare", tier: "platinum" },
	{ amount: "$800/mo", name: "Vercel", tier: "gold" },
	{ amount: "$600/mo", name: "Fly.io", tier: "gold" },
	{ amount: "$500/mo", name: "Tigris", tier: "gold" },
	{ amount: "$200/mo", name: "Linear", tier: "silver" },
	{ amount: "$200/mo", name: "PlanetScale", tier: "silver" },
	{ amount: "$200/mo", name: "Sentry", tier: "silver" },
	{ amount: "$200/mo", name: "Anthropic", tier: "silver" },
	{ amount: "$200/mo", name: "Resend", tier: "silver" },
];

const TIERS: Tier[] = ["platinum", "gold", "silver"];

export const Route = createFileRoute("/sponsors")({
	component: SponsorsRoute,
	head: () =>
		buildSharedHead({
			description:
				"How OSS Protector stays free: a transparent breakdown of money in, money out, and every sponsor.",
			path: "/sponsors",
			title: "Sponsors | OSS Protector",
		}),
});

function MonoLabel({ children }: { children: string }) {
	return (
		<div className="mb-3 font-mono text-muted-foreground text-xs uppercase tracking-[0.07em]">
			{children}
		</div>
	);
}

type FundsSegmentTone = NonNullable<
	React.ComponentProps<typeof ProgressSegments>["segments"][number]["tone"]
>;

const FUNDS_SWATCH_COLOR: Record<FundsSegmentTone, string> = {
	destructive: "bg-destructive",
	info: "bg-info",
	muted: "bg-muted-foreground",
	primary: "bg-primary",
	success: "bg-success",
	warning: "bg-warning",
};

function FundsBar({
	segments,
	total,
}: {
	segments: { label: string; value: number; tone: FundsSegmentTone }[];
	total: number;
}) {
	return (
		<div>
			<ProgressSegments
				className="h-2.5"
				segments={segments.map((segment) => ({
					label: segment.label,
					tone: segment.tone,
					value: (segment.value / total) * 100,
				}))}
			/>
			<div className="mt-2.5 flex flex-wrap gap-3.5 font-mono text-muted-foreground text-xs">
				{segments.map((segment) => (
					<span
						className="inline-flex items-center gap-1.5"
						key={segment.label}
					>
						<span
							className={cn(
								"size-2 rounded-[2px]",
								FUNDS_SWATCH_COLOR[segment.tone]
							)}
						/>
						{segment.label} · ${segment.value.toLocaleString()}
					</span>
				))}
			</div>
		</div>
	);
}

function TierCard({
	tier,
	price,
	body,
	cta,
	accent = false,
}: {
	tier: string;
	price: string;
	body: string;
	cta: string;
	accent?: boolean;
}) {
	return (
		<Card
			className={cn(
				"gap-0 p-6",
				accent && "border border-primary/30 bg-primary/10"
			)}
		>
			<div className="mb-1.5 font-mono text-muted-foreground text-xs uppercase tracking-[0.07em]">
				{tier}
			</div>
			<div className="font-medium text-3xl tracking-tight">{price}</div>
			<p className="mt-2.5 mb-4 text-[13.5px] text-muted-foreground leading-relaxed">
				{body}
			</p>
			<a
				className={cn(
					buttonVariants({ variant: accent ? "default" : "outline" }),
					"w-full justify-center"
				)}
				href={githubRepoUrl}
				rel="noreferrer noopener"
				target="_blank"
			>
				<Heart data-icon="inline-start" />
				{cta}
			</a>
		</Card>
	);
}

function tierAvatarColor(tier: Tier) {
	if (tier === "platinum") {
		return "text-primary";
	}
	if (tier === "gold") {
		return "text-warning";
	}
	return "text-muted-foreground";
}

function SponsorsRoute() {
	return (
		<PageShell>
			<PageContainer className="py-9" width="narrow">
				<PageHeader
					actions={
						<a
							className={cn(buttonVariants())}
							href={githubRepoUrl}
							rel="noreferrer noopener"
							target="_blank"
						>
							<Heart data-icon="inline-start" />
							Sponsor the project
						</a>
					}
					description="Servers cost money. Inference costs money. Time costs money. Here's exactly who pays for OSS Protector — and how much it costs to run."
					title="How we stay free."
				/>

				<div className="mt-6 grid gap-4 md:grid-cols-2">
					<div className="rounded-2xl border bg-card p-6">
						<MonoLabel>Money in · May 2026</MonoLabel>
						<div className="font-medium text-4xl text-success tracking-tight">
							$7,300
							<span className="ml-1 text-lg text-muted-foreground">/ mo</span>
						</div>
						<div className="mt-1.5 font-mono text-[13px] text-muted-foreground">
							from 47 sponsors · 12 corporate, 35 individual
						</div>
						<div className="mt-3.5">
							<FundsBar
								segments={[
									{ label: "Corporate", tone: "primary", value: 6300 },
									{ label: "Individuals", tone: "info", value: 1000 },
								]}
								total={7300}
							/>
						</div>
					</div>
					<div className="rounded-2xl border bg-card p-6">
						<MonoLabel>Money out · May 2026</MonoLabel>
						<div className="font-medium text-4xl tracking-tight">
							$6,180
							<span className="ml-1 text-lg text-muted-foreground">/ mo</span>
						</div>
						<div className="mt-1.5 font-mono text-[13px] text-muted-foreground">
							$1,120 surplus → reserve fund (4 months runway)
						</div>
						<div className="mt-3.5">
							<FundsBar
								segments={[
									{ label: "Compute", tone: "primary", value: 2800 },
									{ label: "Storage", tone: "warning", value: 1400 },
									{ label: "ML re-train", tone: "info", value: 980 },
									{ label: "Domain/SaaS", tone: "muted", value: 600 },
									{ label: "Sec/audit", tone: "success", value: 400 },
								]}
								total={6180}
							/>
						</div>
					</div>
				</div>

				<div className="mt-5 rounded-2xl border bg-card p-6">
					<div className="mb-4 flex items-baseline justify-between">
						<div className="font-mono text-muted-foreground text-xs uppercase tracking-[0.07em]">
							Sponsors
						</div>
						<span className="font-mono text-muted-foreground text-xs">
							we publish every sponsor publicly
						</span>
					</div>
					{TIERS.map((tier) => (
						<div className="mb-4 last:mb-0" key={tier}>
							<div className="mb-2.5 font-mono text-[11px] text-muted-foreground uppercase tracking-[0.08em]">
								{tier}
							</div>
							<div className="flex flex-wrap gap-2.5">
								{SPONSORS.filter((sponsor) => sponsor.tier === tier).map(
									(sponsor) => (
										<div
											className="flex items-center gap-2.5 rounded-xl border bg-muted px-4 py-3"
											key={sponsor.name}
										>
											<Avatar size="sm">
												<AvatarFallback
													className={cn(
														"bg-card font-mono font-semibold",
														tierAvatarColor(tier)
													)}
												>
													{sponsor.name.slice(0, 1)}
												</AvatarFallback>
											</Avatar>
											<div>
												<div className="font-medium text-[13.5px]">
													{sponsor.name}
												</div>
												<div className="font-mono text-[11px] text-muted-foreground">
													{sponsor.amount}
												</div>
											</div>
										</div>
									)
								)}
							</div>
						</div>
					))}
				</div>

				<div className="mt-5 grid gap-4 md:grid-cols-3">
					<TierCard
						body="A small ongoing contribution. Your handle on the contributors page."
						cta="Sponsor on GitHub"
						price="$5+/mo"
						tier="Individual"
					/>
					<TierCard
						accent
						body="Logo on this page and in the trust graph footer. Helps cover compute."
						cta="Become a sponsor"
						price="$200+/mo"
						tier="Company"
					/>
					<TierCard
						body="Multi-year commitment for foundations sponsoring critical OSS infra."
						cta="Get in touch"
						price="custom"
						tier="Foundation"
					/>
				</div>

				<div className="mt-5 rounded-2xl border bg-card p-6">
					<MonoLabel>Governance</MonoLabel>
					<p className="text-[15px] text-muted-foreground leading-relaxed">
						OSS Protector is governed by a steering committee of{" "}
						<b className="text-foreground">5 maintainers</b> elected from the
						top of the trust graph each year. The committee approves methodology
						changes, sponsor admissions, and budget.{" "}
						<em>
							Sponsors do not influence what we flag — the code that decides is
							open and the weights are public on the methodology page.
						</em>
					</p>
					<div className="mt-4 flex flex-wrap gap-2.5">
						{["evanw", "kentcdodds", "thockin", "yyx990803", "sebmarkbage"].map(
							(member, index) => (
								<Badge
									className="font-mono"
									key={member}
									size="tag"
									variant="outline"
								>
									@{member}
									{index === 0 ? (
										<span className="ml-1 text-primary">· chair</span>
									) : null}
								</Badge>
							)
						)}
					</div>
				</div>
			</PageContainer>
		</PageShell>
	);
}
