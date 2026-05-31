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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
	loader: async ({ params }) => {
		const profile = await getAccountProfileFn({
			data: { login: params.login },
		});
		if (profile.notFound) {
			throw notFound();
		}
		return profile;
	},
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
	component: AccountRoute,
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

				<Card className="grid items-center gap-5 p-7 md:grid-cols-[96px_1fr_auto]">
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
				</Card>

				{disputing ? (
					<Card className="mt-4 border-primary/30 p-6">
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
							<Alert variant="success">
								<Check />
								<AlertTitle>Thanks — your dispute is in.</AlertTitle>
								<AlertDescription>
									We'll review with three trust-graph maintainers within 48
									hours.
								</AlertDescription>
							</Alert>
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
					</Card>
				) : null}

				<MaintainerControls login={profile.login} />

				<div className="mt-6 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
					<div className="flex flex-col gap-5">
						<Card>
							<CardContent>
								<CardLabel>Why flagged</CardLabel>
								{profile.reasonCodes.length === 0 ? (
									<p className="text-[13.5px] text-muted-foreground">
										No reason codes recorded.
									</p>
								) : (
									<ul className="flex flex-col gap-3">
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
							</CardContent>
						</Card>

						<Card>
							<CardContent>
								<CardLabel>
									Evidence signals · {profile.signals.length}
								</CardLabel>
								{profile.signals.length === 0 ? (
									<p className="text-[13.5px] text-muted-foreground">
										No public signals recorded.
									</p>
								) : (
									<div className="flex flex-col">
										{profile.signals.slice(0, 12).map((signal, i) => (
											<div
												key={`${signal.observedAt}-${signal.signalType}-${signal.source}`}
											>
												{i > 0 && <Separator />}
												<div className="grid grid-cols-[1fr_auto] items-center gap-3 py-2.5 text-sm">
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
														variant={
															signal.weight >= 0 ? "destructive" : "success"
														}
													>
														{signal.weight >= 0 ? "+" : ""}
														{signal.weight}
													</Badge>
												</div>
											</div>
										))}
									</div>
								)}
							</CardContent>
						</Card>
					</div>

					<Card>
						<CardContent>
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
									{profile.publicPrs.slice(0, 12).map((pr, i) => (
										<div key={pr.htmlUrl}>
											{i > 0 && <Separator />}
											<a
												className="flex items-start justify-between gap-3 py-2.5 text-sm transition-colors hover:text-foreground"
												href={pr.htmlUrl}
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
										</div>
									))}
								</div>
							)}
						</CardContent>
					</Card>
				</div>

				<Card className="mt-5">
					<CardContent>
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
					</CardContent>
				</Card>

				<div className="mt-5 grid gap-5 md:grid-cols-2">
					<Card>
						<CardContent>
							<CardLabel>Reported by</CardLabel>
							{reporters.length === 0 ? (
								<p className="text-[13.5px] text-muted-foreground">
									No public maintainer reports on file.
								</p>
							) : (
								<div className="flex flex-wrap gap-2">
									{reporters.map((login) => (
										<Badge
											key={login}
											render={
												// biome-ignore lint/a11y/useAnchorContent: anchor content is injected from the component children at runtime via the Base UI render prop
												<a
													aria-label={login}
													href={`https://github.com/${login}`}
													rel="noreferrer noopener"
													target="_blank"
												/>
											}
											size="tag"
											variant="success"
										>
											<Check />
											{login}
										</Badge>
									))}
								</div>
							)}
						</CardContent>
					</Card>

					<Card>
						<CardContent>
							<CardLabel>Affected repositories</CardLabel>
							{affectedRepos.length === 0 ? (
								<p className="text-[13.5px] text-muted-foreground">
									No public repositories recorded.
								</p>
							) : (
								<div className="flex flex-wrap gap-2">
									{affectedRepos.slice(0, 12).map((name) => (
										<Badge
											key={name}
											render={
												// biome-ignore lint/a11y/useAnchorContent: anchor content is injected from the component children at runtime via the Base UI render prop
												<a aria-label={name} href={`/repo/${name}`} />
											}
											size="tag"
											variant="outline"
										>
											{name}
										</Badge>
									))}
								</div>
							)}
						</CardContent>
					</Card>
				</div>
			</PageContainer>
		</PageShell>
	);
}
