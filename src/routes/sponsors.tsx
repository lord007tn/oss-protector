import { createFileRoute } from "@tanstack/react-router";
import { Heart } from "lucide-react";

import { githubRepoUrl } from "@/components/landing/constants";
import {
	PageContainer,
	PageHeader,
	PageShell,
} from "@/components/site/page-shell";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { buildSharedHead } from "@/lib/head";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/sponsors")({
	component: SponsorsRoute,
	head: () =>
		buildSharedHead({
			description:
				"How OSS Protector stays free: who funds it, what it costs to run, and how to support the project.",
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

// What it actually costs to run today — qualitative, because the project is new
// and runs within free/low tiers. No fabricated dollar figures.
const COST_ITEMS: { area: string; detail: string }[] = [
	{
		area: "Compute & hosting",
		detail: "Cloudflare Workers — currently within the free tier.",
	},
	{
		area: "Database",
		detail: "Cloudflare D1 (SQLite) — currently within the free tier.",
	},
	{
		area: "AI review",
		detail:
			"OpenRouter, using free models today. Paid models are opt-in (BYOK).",
	},
	{
		area: "Email",
		detail: "Resend for sign-in codes — within the free tier.",
	},
];

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
					description="OSS Protector is new and self-funded. Here's exactly what it costs to run and how sponsorship works — when there's money to report, this page will show every cent."
					title="How we stay free."
				/>

				<div className="mt-6 grid gap-4 md:grid-cols-2">
					<div className="rounded-2xl border bg-card p-6">
						<MonoLabel>Money in</MonoLabel>
						<div className="font-medium text-4xl tracking-tight">
							$0
							<span className="ml-1 text-lg text-muted-foreground">/ mo</span>
						</div>
						<div className="mt-1.5 font-mono text-[13px] text-muted-foreground">
							No sponsors yet — the project is just getting started.
						</div>
					</div>
					<div className="rounded-2xl border bg-card p-6">
						<MonoLabel>What it costs to run</MonoLabel>
						<div className="flex flex-col gap-2.5">
							{COST_ITEMS.map((item) => (
								<div
									className="grid grid-cols-[130px_1fr] items-start gap-3 text-[13px]"
									key={item.area}
								>
									<div className="font-medium">{item.area}</div>
									<div className="text-muted-foreground">{item.detail}</div>
								</div>
							))}
						</div>
					</div>
				</div>

				<div className="mt-5">
					<Empty className="rounded-2xl border bg-card p-10">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<Heart />
							</EmptyMedia>
							<EmptyTitle>No sponsors yet</EmptyTitle>
							<EmptyDescription>
								Every sponsor will be published on this page, publicly. Be the
								first to back open-source abuse intelligence.
							</EmptyDescription>
						</EmptyHeader>
						<a
							className={cn(buttonVariants())}
							href={githubRepoUrl}
							rel="noreferrer noopener"
							target="_blank"
						>
							<Heart data-icon="inline-start" />
							Become the first sponsor
						</a>
					</Empty>
				</div>

				<div className="mt-5 grid gap-4 md:grid-cols-3">
					<TierCard
						body="A small ongoing contribution. Your handle on the sponsors page."
						cta="Sponsor on GitHub"
						price="$5+/mo"
						tier="Individual"
					/>
					<TierCard
						accent
						body="Your logo on this page. Helps cover compute and AI review as usage grows."
						cta="Become a sponsor"
						price="$50+/mo"
						tier="Company"
					/>
					<TierCard
						body="For foundations backing critical OSS infrastructure. Let's talk."
						cta="Get in touch"
						price="custom"
						tier="Foundation"
					/>
				</div>

				<div className="mt-5 rounded-2xl border bg-card p-6">
					<MonoLabel>Governance</MonoLabel>
					<p className="text-[15px] text-muted-foreground leading-relaxed">
						OSS Protector is maintained in the open. The scoring code and signal
						weights are public — you can read exactly how a flag is computed on
						the{" "}
						<a className="text-primary hover:underline" href="/methodology">
							methodology page
						</a>
						. <em>Sponsors do not influence what we flag.</em> Funding pays for
						infrastructure, never for placement on the blocklist.
					</p>
				</div>
			</PageContainer>
		</PageShell>
	);
}
