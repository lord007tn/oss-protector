import { createFileRoute } from "@tanstack/react-router";
import { Github, Shield } from "lucide-react";

import { githubRepoUrl, publicAppUrl } from "@/components/landing/constants";
import {
	PageContainer,
	PageHeader,
	PageShell,
} from "@/components/site/page-shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
	RISK_SCORE_BANDS,
	RISK_STATUS_DESCRIPTIONS,
	RISK_STATUS_LABELS,
} from "@/constants/risk-statuses";
import { cn } from "@/lib/utils";

// The signals that actually move the published score, with the maximum points
// each can contribute. The score is additive (0–100), not a weighted average —
// deterministic signals form the core and the LLM verdict sits on top.
const METHODS = [
	{
		num: "01",
		contribution: "−28 … +35",
		title: "Account heuristics & reputation",
		body: "Account age, followers, owned-repo stars, total public contributions, and bio/handle patterns. Reputation is a dampener as much as a signal.",
		detail:
			"A fresh, follower-less account paired with other evidence is corroborated upward (young-account boost, gated on existing evidence). A long-lived, starred, prolific account is dampened downward (reputation penalty, capped at −28) — unless a maintainer has validated a report, in which case human judgment wins. Bio/handle bot-patterns (ai-helper-*, gpt-*, '*-bot-NN'), a machine-random handle, and a bot-like follow graph (follows many, followed by few) each add a small gated corroborator.",
		code: `youngAccountBoost = evidence>0 && ageDays<30 ? +8..12 : 0
botPatternBoost  = evidence>0 && handle/bio matches ? +10 : 0
reputationPenalty = validatedReport ? 0
                  : age + stars + contributions + followers  // 0..-28`,
	},
	{
		num: "02",
		contribution: "up to +65",
		title: "LLM review (on top of the core)",
		body: "An LLM reads the PR title, body, patch, commit messages, the conversation/review comments, and the author's account context, and returns a verdict, a reason code, and a confidence.",
		detail:
			"Credential- and malicious-risk dimensions are clamped to 0 unless the actual patch contains matching tokens, so the model can't hallucinate a 'credential phishing' label onto a benign PR. The verdict adds weight on top of the deterministic core — it does not replace it.",
		code: `confidence >= 90 → +65
confidence >= 80 → +50
confidence >= 65 → +30
otherwise        → 0   (surfaced for review, no score)`,
	},
	{
		num: "03",
		contribution: "+55 / +25",
		title: "Cross-repo campaigns & velocity",
		body: "One PR is a data point. The same title/patch across unrelated repos — or a burst of PRs scattered across many unrelated orgs in a week — is a fingerprint.",
		detail:
			"Duplicate campaigns require at least 3 matching-title PRs across at least 2 repositories (+55). Separately, PR velocity weighted by org-diversity flags scattershot bursts: a prolific maintainer working inside their own org scores low because diversity is low, while 15 PRs across 8 unrelated owners in 7 days does not (+up to 25).",
		code: `campaign: matches(sameTitle) >= 3 && repos >= 2 → +55
velocity: prs_7d >= 15 && distinctOwners >= 8 → +25
          (capped so velocity alone stays in 'watch')`,
	},
	{
		num: "04",
		contribution: "up to +25",
		title: "Deterministic PR heuristics",
		body: "Diff signature and commit-message voice, computed without any model so they're reproducible on appeal.",
		detail:
			"Diff signature flags scattershot/templated patches (many files each touched by one line, near-identical change sizes). Commit voice flags vacuous or duplicated messages ('update', 'fix', identical lines). These run on every PR and on the backfill.",
		code: `diffSignature = scattershot + uniformity   // 0..1
commitVoice   = vacuousRatio + identicalRatio // 0..1
weight = max(diffSignature, commitVoice) → +10..25`,
	},
	{
		num: "05",
		contribution: "up to +35",
		title: "Maintainer reports & corrections",
		body: "A maintainer's report or correction command on a PR is the strongest human signal. Validated reports add weight; dismiss/allow corrections subtract it.",
		detail:
			"Reports are weighted by the reporter's historical accuracy (validated ÷ total, with a prior so new reporters trend neutral) and capped per reporter so a single account can't report-bomb a target. Corrections are idempotent against webhook re-delivery.",
		code: `reportScore = Σ_reporter ( maxValidatedReport × trust )
trust = clamp(validated / max(total, 3), 0.2, 1)
dismiss = -30   confirm = +25   allow/reset = reset`,
	},
	{
		num: "06",
		contribution: "+48 / decay",
		title: "External imports & time-decay",
		body: "Accounts imported from public OSS-abuse blocklists start elevated. All reports and signals lose weight as they age.",
		detail:
			"Imported accounts get a +48 base pending local verification. Every report and signal keeps full weight for 30 days, then decays linearly to a floor of 0.2 by one year — old context still counts, just less than fresh evidence.",
		code: `importedBlocklist → +48 (review locally)
ageDecay = 1.0 (≤30d) → 0.2 (≥365d), linear between`,
	},
] as const;

export const Route = createFileRoute("/methodology")({
	component: MethodologyRoute,
	head: () => ({
		links: [{ href: `${publicAppUrl}/methodology`, rel: "canonical" }],
		meta: [
			{ title: "Methodology | OSS Protector" },
			{
				content:
					"How OSS Protector computes a risk score: a deterministic core (account, cross-repo, PR heuristics, maintainer reports) with an LLM review on top, time-decay, reporter-trust, and a reputation dampener.",
				name: "description",
			},
		],
	}),
});

function CodeBlock({ children }: { children: string }) {
	return (
		<pre className="overflow-x-auto rounded-xl border bg-[var(--code)] p-3.5 font-mono text-[12px] text-foreground leading-relaxed">
			{children}
		</pre>
	);
}

function MonoLabel({ children }: { children: string }) {
	return (
		<div className="mb-3 font-mono text-muted-foreground text-xs uppercase tracking-[0.07em]">
			{children}
		</div>
	);
}

function MethodologyRoute() {
	return (
		<PageShell>
			<PageContainer className="py-9">
				<PageHeader
					actions={
						<div className="flex items-center gap-2">
							<a
								className={cn(
									buttonVariants({ size: "sm", variant: "outline" })
								)}
								href={githubRepoUrl}
								rel="noreferrer noopener"
								target="_blank"
							>
								<Github data-icon="inline-start" />
								View source
							</a>
							<Badge>Open scoring engine</Badge>
						</div>
					}
					description="How a risk score gets computed. A deterministic core — account reputation, cross-repo patterns, PR heuristics, and maintainer reports — with an LLM review layered on top. The score is advisory: we post nothing to your PRs and never auto-block."
					title="Methodology"
				/>

				<div className="mt-6 grid items-start gap-8 lg:grid-cols-[1.4fr_1fr]">
					<div className="flex flex-col gap-5">
						{METHODS.map((method) => (
							<div className="rounded-2xl border bg-card p-6" key={method.num}>
								<div className="mb-2 flex items-baseline justify-between">
									<span className="font-mono text-muted-foreground text-xs tracking-wider">
										— {method.num}
									</span>
									<span className="font-mono text-primary text-xs">
										{method.contribution}
									</span>
								</div>
								<h3 className="font-medium text-xl tracking-tight">
									{method.title}
								</h3>
								<p className="mt-2 mb-3 text-[14px] text-muted-foreground leading-relaxed">
									{method.body}
								</p>
								<p className="mb-3.5 text-[13px] text-muted-foreground/80 leading-relaxed">
									{method.detail}
								</p>
								<CodeBlock>{method.code}</CodeBlock>
							</div>
						))}
					</div>

					<div className="flex flex-col gap-5">
						<div className="rounded-2xl border bg-card p-6">
							<MonoLabel>Final score</MonoLabel>
							<CodeBlock>{`score = clamp0_100(
  maintainerReports        // trust-weighted, decayed
  + llmReview              // verdict on top
  + duplicateCampaign
  + prHeuristics
  + activity (≤ +20)
  + youngAccount + botPattern   // gated on evidence
  + externalBlocklist
  − reputationDampener     // skipped if a report is validated
)`}</CodeBlock>
							<p className="mt-3 text-[12.5px] text-muted-foreground leading-relaxed">
								The score routes a flag to the maintainer's dashboard. We never
								post a PR comment, status check, or auto-block — a human always
								decides what happens to a contributor.
							</p>
						</div>

						<div className="rounded-2xl border bg-card p-6">
							<MonoLabel>Score bands</MonoLabel>
							<div className="flex flex-col gap-3">
								{RISK_SCORE_BANDS.map((band) => (
									<div key={band.status}>
										<div className="flex items-baseline justify-between">
											<span className="font-medium text-sm">
												{RISK_STATUS_LABELS[band.status]}
											</span>
											<span className="font-mono text-muted-foreground text-xs tabular-nums">
												{band.min}–{band.max}
											</span>
										</div>
										<p className="mt-0.5 text-[12.5px] text-muted-foreground leading-relaxed">
											{RISK_STATUS_DESCRIPTIONS[band.status]}
										</p>
									</div>
								))}
							</div>
						</div>

						<div className="rounded-2xl border bg-card p-6">
							<MonoLabel>What we don't use</MonoLabel>
							<ul className="ml-4 list-disc space-y-1 text-[13px] text-muted-foreground leading-relaxed">
								<li>
									Private repository contents (unless a repo policy opts in)
								</li>
								<li>Profile photos (we don't fetch images)</li>
								<li>Private email addresses or real names</li>
								<li>Geographic location or IP</li>
								<li>
									A single signal — no one input flags an account on its own
								</li>
							</ul>
						</div>

						<div className="flex items-start gap-2.5 rounded-xl border border-primary/30 bg-primary/10 p-3.5 text-[13.5px] text-muted-foreground leading-relaxed">
							<Shield className="mt-0.5 size-3.5 shrink-0 text-primary" />
							<div>
								<b className="text-foreground">Listed and think it's wrong?</b>{" "}
								The score drops to 0 the moment a maintainer dismisses or
								allowlists you. See{" "}
								<a className="underline underline-offset-2" href="/appeal">
									how to appeal
								</a>
								.
							</div>
						</div>
					</div>
				</div>
			</PageContainer>
		</PageShell>
	);
}
