import { createFileRoute, notFound } from "@tanstack/react-router";
import {
	ArrowLeft,
	Check,
	ExternalLink,
	Flag,
	Github,
	GitPullRequest,
	X,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import type { AccountProfileResult } from "@/actions/account-profile";
import { publicAppUrl } from "@/components/landing/constants";
import { AccountAvatar } from "@/components/oss/account-avatar";
import { ConfidenceBadge } from "@/components/oss/confidence-badge";
import { MaintainerControls } from "@/components/oss/maintainer-controls";
import { TrustGraph } from "@/components/oss/trust-graph";
import { NotFoundView } from "@/components/site/error-states";
import { PageContainer, PageShell } from "@/components/site/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { REASON_DESCRIPTIONS } from "@/constants/reason-codes";
import { getAccountProfileFn } from "@/functions/account-profile";
import {
	avatarInitials,
	reasonLabel,
	relativeTime,
	riskStatusBadge,
} from "@/lib/directory-view";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/accounts_/$login")({
	component: AccountRoute,
	head: ({ params, loaderData }) => {
		// The loader throws notFound() for unknown accounts, leaving loaderData
		// undefined. Without this guard the document title would echo the
		// non-existent handle (e.g. "@does-not-exist | OSS Protector").
		if (!loaderData) {
			return {
				meta: [
					{ title: "Account not found | OSS Protector" },
					{ content: "noindex", name: "robots" },
				],
			};
		}
		return {
			links: [
				{ href: `${publicAppUrl}/accounts/${params.login}`, rel: "canonical" },
			],
			meta: [
				{ title: `@${params.login} | OSS Protector` },
				{
					content: `Risk profile, evidence, reports, and trust graph for @${params.login}.`,
					name: "description",
				},
			],
		};
	},
	loader: async ({ params }) => {
		const profile = await getAccountProfileFn({
			data: { login: params.login },
		});
		if (profile.notFound) {
			throw notFound();
		}
		return profile;
	},
	notFoundComponent: () => <NotFoundView />,
});

function CardLabel({ children }: { children: ReactNode }) {
	return (
		<div className="mb-4 font-mono text-muted-foreground text-xs uppercase tracking-[0.07em]">
			{children}
		</div>
	);
}

function humanizeSignal(signalType: string): string {
	return signalType.replaceAll("_", " ");
}

function AccountRoute() {
	const profile = Route.useLoaderData() as AccountProfileResult;
	const [disputing, setDisputing] = useState(false);
	const [disputeText, setDisputeText] = useState("");
	const [disputeSent, setDisputeSent] = useState(false);
	const [disputePending, setDisputePending] = useState(false);

	const submitDispute = async () => {
		setDisputePending(true);
		try {
			const response = await fetch("/api/appeal", {
				body: JSON.stringify({
					login: profile.login,
					relationship: "self",
					story: disputeText,
				}),
				headers: { "Content-Type": "application/json" },
				method: "POST",
			});
			const data = (await response.json()) as { error?: string };
			if (!response.ok) {
				toast.error(data.error ?? "Couldn't submit the dispute.");
				return;
			}
			setDisputeSent(true);
		} catch {
			toast.error("Network error — try again.");
		} finally {
			setDisputePending(false);
		}
	};

	const status = riskStatusBadge(profile.status);
	const reporters = [...new Set(profile.reports.map((r) => r.reporterLogin))];
	const affectedRepos = [
		...new Set(profile.publicPrs.map((pr) => pr.repositoryFullName)),
	];

	return (
		<PageShell>
			<PageContainer className="py-9">
				<a
					className={cn(buttonVariants({ variant: "ghost" }), "mb-4")}
					href="/accounts"
				>
					<ArrowLeft data-icon="inline-start" />
					Back to directory
				</a>

				<div className="grid items-center gap-5 rounded-2xl border bg-card p-7 md:grid-cols-[96px_1fr_auto]">
					<AccountAvatar
						avatarUrl={profile.avatarUrl}
						className="size-24 text-3xl"
						login={profile.login}
					/>
					<div>
						<h1 className="flex flex-wrap items-center gap-2.5 font-medium text-2xl tracking-tight">
							@{profile.login}
							<Badge variant={status.variant}>{status.label}</Badge>
							{profile.importedSource ? (
								<Badge variant="secondary">imported</Badge>
							) : null}
						</h1>
						<div className="mt-1.5 font-mono text-muted-foreground text-xs">
							last seen {relativeTime(profile.lastSeenAt)} · {profile.prCount}{" "}
							PRs · {profile.reportCount} reports ·{" "}
							{profile.validatedReportCount} validated
							{profile.importedSource
								? ` · imported from ${profile.importedSource}`
								: ""}
						</div>
						<p className="mt-3 max-w-2xl text-[14.5px] text-muted-foreground leading-relaxed">
							{profile.summary ?? "No summary on file for this account."}
						</p>
					</div>
					<div className="flex flex-col items-stretch gap-2.5 md:items-end">
						<div className="font-mono text-muted-foreground text-xs">
							RISK SCORE
						</div>
						<ConfidenceBadge value={profile.score / 100} />
						<a
							className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
							href={profile.htmlUrl ?? `https://github.com/${profile.login}`}
							rel="noreferrer noopener"
							target="_blank"
						>
							<Github data-icon="inline-start" />
							View on GitHub
						</a>
						<Button
							onClick={() => setDisputing((value) => !value)}
							size="sm"
							type="button"
							variant="ghost"
						>
							<Flag data-icon="inline-start" />
							{disputing ? "Cancel dispute" : "Dispute flag"}
						</Button>
					</div>
				</div>

				{disputing ? (
					<div className="mt-4 rounded-2xl border border-primary/30 bg-card p-6">
						<div className="mb-2 flex items-center justify-between">
							<div className="font-medium text-[15px]">
								{disputeSent ? "Dispute received" : "Dispute this flag"}
							</div>
							<Button
								onClick={() => {
									setDisputing(false);
									setDisputeSent(false);
									setDisputeText("");
								}}
								size="icon-sm"
								type="button"
								variant="ghost"
							>
								<X />
							</Button>
						</div>
						{disputeSent ? (
							<div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/10 p-3.5">
								<Check className="size-4.5 text-success" />
								<div>
									<div className="font-medium">
										Thanks — your dispute is in.
									</div>
									<div className="mt-0.5 text-muted-foreground text-sm">
										We'll review with three trust-graph maintainers within 48
										hours.
									</div>
								</div>
							</div>
						) : (
							<>
								<p className="mb-3 text-[13.5px] text-muted-foreground leading-relaxed">
									Tell us what we got wrong. The fastest path is asking a
									maintainer of the repo where the report came from to run{" "}
									<code className="font-mono text-xs">
										@oss-protector allow
									</code>{" "}
									on the PR.
								</p>
								<Textarea
									onChange={(event) => setDisputeText(event.target.value)}
									placeholder="e.g. This account is a real maintainer at our org who just joined GitHub recently…"
									rows={4}
									value={disputeText}
								/>
								<div className="mt-3 flex justify-end gap-2">
									<Button
										onClick={() => setDisputing(false)}
										type="button"
										variant="ghost"
									>
										Cancel
									</Button>
									<Button
										disabled={disputeText.trim().length < 60 || disputePending}
										onClick={submitDispute}
										type="button"
									>
										Submit dispute
									</Button>
								</div>
							</>
						)}
					</div>
				) : null}

				<MaintainerControls login={profile.login} />

				<div className="mt-6 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
					<div className="flex flex-col gap-5">
						<div className="rounded-2xl border bg-card p-6">
							<CardLabel>Why flagged</CardLabel>
							{profile.reasonCodes.length === 0 ? (
								<p className="text-[13.5px] text-muted-foreground">
									No reason codes recorded.
								</p>
							) : (
								<ul className="space-y-3">
									{profile.reasonCodes.map((code) => (
										<li key={code}>
											<div className="font-medium text-sm">
												{reasonLabel(code)}
											</div>
											<div className="mt-0.5 text-[13px] text-muted-foreground leading-relaxed">
												{REASON_DESCRIPTIONS[code]}
											</div>
										</li>
									))}
								</ul>
							)}
						</div>

						<div className="rounded-2xl border bg-card p-6">
							<CardLabel>Evidence signals · {profile.signals.length}</CardLabel>
							{profile.signals.length === 0 ? (
								<p className="text-[13.5px] text-muted-foreground">
									No public signals recorded.
								</p>
							) : (
								<div className="flex flex-col">
									{profile.signals.slice(0, 12).map((signal) => (
										<div
											className="grid grid-cols-[1fr_auto] items-center gap-3 border-border border-b py-2.5 text-sm last:border-0"
											key={`${signal.observedAt}-${signal.signalType}-${signal.source}`}
										>
											<div className="min-w-0">
												<div className="font-medium capitalize">
													{humanizeSignal(signal.signalType)}
												</div>
												<div className="font-mono text-muted-foreground text-xs">
													{signal.source.replaceAll("_", " ")}
													{signal.repositoryFullName
														? ` · ${signal.repositoryFullName}`
														: ""}{" "}
													· {relativeTime(signal.observedAt)}
												</div>
											</div>
											<Badge
												variant={signal.weight >= 0 ? "destructive" : "success"}
											>
												{signal.weight >= 0 ? "+" : ""}
												{signal.weight}
											</Badge>
										</div>
									))}
								</div>
							)}
						</div>
					</div>

					<div className="rounded-2xl border bg-card p-6">
						<CardLabel>
							Public pull requests · {profile.publicPrs.length}
						</CardLabel>
						{profile.publicPrs.length === 0 ? (
							<div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
								<GitPullRequest className="size-6" />
								<p className="text-sm">
									No public PRs observed on installed repositories yet.
								</p>
							</div>
						) : (
							<div className="flex flex-col">
								{profile.publicPrs.slice(0, 12).map((pr) => (
									<a
										className="flex items-start justify-between gap-3 border-border border-b py-2.5 text-sm transition-colors last:border-0 hover:text-foreground"
										href={pr.htmlUrl}
										key={pr.htmlUrl}
										rel="noreferrer noopener"
										target="_blank"
									>
										<div className="min-w-0">
											<div className="truncate font-medium">{pr.title}</div>
											<div className="font-mono text-muted-foreground text-xs">
												{pr.repositoryFullName}#{pr.number} · {pr.state}
											</div>
										</div>
										<ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
									</a>
								))}
							</div>
						)}
					</div>
				</div>

				<div className="mt-5 rounded-2xl border bg-card p-6">
					<CardLabel>Trust graph</CardLabel>
					<p className="-mt-2 mb-4 text-[13.5px] text-muted-foreground">
						Maintainers who reported this account and the repositories it
						touched. Every link is auditable.
					</p>
					<TrustGraph
						affectedCount={affectedRepos.length}
						handle={profile.login}
						height={300}
						initials={avatarInitials(profile.login)}
						repoNames={affectedRepos}
						reporterCount={reporters.length}
						reporters={reporters}
					/>
				</div>

				<div className="mt-5 grid gap-5 md:grid-cols-2">
					<div className="rounded-2xl border bg-card p-6">
						<CardLabel>Reported by</CardLabel>
						{reporters.length === 0 ? (
							<p className="text-[13.5px] text-muted-foreground">
								No public maintainer reports on file.
							</p>
						) : (
							<div className="flex flex-wrap gap-2">
								{reporters.map((login) => (
									<a
										className="inline-flex items-center gap-1 rounded-full border border-success/25 bg-success/10 px-3 py-1 font-mono text-[12.5px] text-success"
										href={`https://github.com/${login}`}
										key={login}
										rel="noreferrer noopener"
										target="_blank"
									>
										<Check className="size-3" />
										{login}
									</a>
								))}
							</div>
						)}
					</div>

					<div className="rounded-2xl border bg-card p-6">
						<CardLabel>Affected repositories</CardLabel>
						{affectedRepos.length === 0 ? (
							<p className="text-[13.5px] text-muted-foreground">
								No public repositories recorded.
							</p>
						) : (
							<div className="flex flex-wrap gap-2">
								{affectedRepos.slice(0, 12).map((name) => (
									<a
										className="inline-flex items-center rounded-full border bg-card px-3 py-1 font-mono text-[12.5px] text-muted-foreground transition-colors hover:border-input hover:text-foreground"
										href={`/repo/${name}`}
										key={name}
									>
										{name}
									</a>
								))}
							</div>
						)}
					</div>
				</div>
			</PageContainer>
		</PageShell>
	);
}
