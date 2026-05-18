import { createFileRoute } from "@tanstack/react-router";
import {
	ArrowRight,
	CheckCircle2,
	Github,
	KeyRound,
	Loader2,
} from "lucide-react";
import { useState } from "react";
import type { GithubManifestConversion } from "@/actions/github-manifest";
import {
	githubAppInstallUrl,
	githubRepoUrl,
} from "@/components/landing/constants";
import { Footer } from "@/components/landing/footer";
import { SiteHeader } from "@/components/landing/site-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/install")({
	component: InstallRoute,
	validateSearch: (search) => ({
		code: typeof search.code === "string" ? search.code : undefined,
		installation_id:
			typeof search.installation_id === "string" ||
			typeof search.installation_id === "number"
				? String(search.installation_id)
				: undefined,
		setup_action:
			typeof search.setup_action === "string" ? search.setup_action : undefined,
	}),
});

function InstallRoute() {
	const {
		code,
		installation_id: installationId,
		setup_action: setupAction,
	} = Route.useSearch();

	// Three flows land here:
	//   1. Public install completion: GitHub redirects with installation_id+setup_action,
	//      no `code`. Show a confirmation + next steps.
	//   2. Manifest exchange (one-time during App creation): `code` is present.
	//   3. Direct visit: nothing in the URL. Show a marketing-y prompt.
	if (installationId && !code) {
		return (
			<InstallSuccess action={setupAction} installationId={installationId} />
		);
	}

	if (code) {
		return <ManifestExchange code={code} setupAction={setupAction} />;
	}

	return <NoParamsLanding />;
}

function InstallSuccess({
	action,
	installationId,
}: {
	action: string | undefined;
	installationId: string;
}) {
	return (
		<main className="min-h-screen bg-background">
			<SiteHeader />
			<div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-10 md:px-6 md:py-14">
				<div className="grid gap-2">
					<span className="font-medium text-muted-foreground text-xs uppercase tracking-[0.18em]">
						Install complete
					</span>
					<h1 className="font-semibold text-2xl tracking-tight md:text-3xl">
						OSS Protector is now watching your repositories.
					</h1>
					<p className="text-muted-foreground text-sm leading-6 md:text-[15px]">
						Installation{" "}
						<code className="font-mono text-[12px]">#{installationId}</code>
						{action ? (
							<>
								{" "}
								(<code className="font-mono text-[12px]">{action}</code>)
							</>
						) : null}{" "}
						was registered. Future pull requests on covered repos will get an
						automatic OSS Protector assessment.
					</p>
				</div>

				<Alert>
					<CheckCircle2 />
					<AlertTitle>First run checklist</AlertTitle>
					<AlertDescription>
						Open a pull request on a selected repository to trigger the first
						assessment. Public repositories can be analyzed immediately; private
						repositories keep patch content out of AI review unless your repo
						policy explicitly opts in.
					</AlertDescription>
				</Alert>

				<Card className="rounded-md border-muted/60">
					<CardHeader className="space-y-1 pb-3">
						<CardTitle className="font-medium text-base">
							What should happen next
						</CardTitle>
						<CardDescription className="text-xs leading-5">
							The bot records the webhook, reviews supported PR events, and
							posts a comment with confidence, reason code, and scoring
							breakdown when there is enough signal.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<ul className="grid gap-2 text-muted-foreground text-sm leading-6">
							<li>
								Check that the repository you expect was selected in GitHub.
							</li>
							<li>
								Use{" "}
								<code className="font-mono text-xs">
									@oss-protector dismiss
								</code>{" "}
								or{" "}
								<code className="font-mono text-xs">@oss-protector allow</code>{" "}
								on false positives.
							</li>
							<li>
								Add{" "}
								<code className="font-mono text-xs">
									.github/oss-protector.json
								</code>{" "}
								if the repo needs stricter thresholds, trusted bots, or ignored
								paths.
							</li>
						</ul>
					</CardContent>
				</Card>

				<Card className="rounded-md border-muted/60">
					<CardHeader className="space-y-1 pb-3">
						<CardTitle className="font-medium text-base">
							Maintainer commands
						</CardTitle>
						<CardDescription className="text-xs leading-5">
							Anyone with OWNER, MEMBER, or COLLABORATOR association on the repo
							can correct the system from any PR comment.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<pre className="overflow-x-auto rounded-md border bg-foreground p-3 font-mono text-background text-xs leading-6">
							<code>
								{[
									"@oss-protector flag this user reason: fake bounty",
									"@oss-protector dismiss   # false positive on the PR's author",
									"@oss-protector confirm   # validate the latest open report",
									"@oss-protector allow     # permanently allowlist the PR author",
								].join("\n")}
							</code>
						</pre>
					</CardContent>
				</Card>

				<div className="flex flex-wrap gap-2">
					<a className={buttonVariants({ size: "sm" })} href="/clankers">
						Browse the public review feed
						<ArrowRight data-icon="inline-end" />
					</a>
					<a
						className={buttonVariants({ size: "sm", variant: "outline" })}
						href={`${githubRepoUrl}/blob/master/docs/repository-policy.md`}
						rel="noopener noreferrer"
						target="_blank"
					>
						Repository policy
					</a>
					<a
						className={buttonVariants({ size: "sm", variant: "ghost" })}
						href="/contest"
					>
						Contest a listing
					</a>
				</div>
			</div>
			<Footer />
		</main>
	);
}

function NoParamsLanding() {
	return (
		<main className="min-h-screen bg-background">
			<SiteHeader />
			<div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-10 md:px-6 md:py-14">
				<div className="grid gap-2">
					<span className="font-medium text-muted-foreground text-xs uppercase tracking-[0.18em]">
						Install
					</span>
					<h1 className="font-semibold text-2xl tracking-tight md:text-3xl">
						Install the OSS Protector GitHub App.
					</h1>
					<p className="text-muted-foreground text-sm leading-6 md:text-[15px]">
						Add one shared GitHub App to the repositories you want protected.
						The bot will post a structured PR assessment on every new pull
						request and accept maintainer commands in comments.
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<a
						className={buttonVariants({ size: "sm" })}
						href={githubAppInstallUrl}
					>
						<Github data-icon="inline-start" />
						Install on GitHub
					</a>
					<a
						className={buttonVariants({ size: "sm", variant: "outline" })}
						href="/clankers"
					>
						See what the feed looks like
						<ArrowRight data-icon="inline-end" />
					</a>
				</div>
			</div>
			<Footer />
		</main>
	);
}

function ManifestExchange({
	code,
	setupAction,
}: {
	code: string;
	setupAction: string | undefined;
}) {
	const [conversion, setConversion] = useState<GithubManifestConversion | null>(
		null
	);
	const [error, setError] = useState<string | null>(null);
	const [isConverting, setIsConverting] = useState(false);

	const exchangeCode = async () => {
		setIsConverting(true);
		setError(null);
		try {
			const response = await fetch("/api/github/manifest/convert", {
				body: JSON.stringify({ code }),
				headers: { "Content-Type": "application/json" },
				method: "POST",
			});
			const payload =
				(await response.json()) as Partial<GithubManifestConversion> & {
					error?: string;
				};
			if (!response.ok) {
				throw new Error(payload.error ?? "GitHub conversion failed.");
			}
			setConversion(payload as GithubManifestConversion);
		} catch (caught) {
			setError(
				caught instanceof Error ? caught.message : "GitHub conversion failed."
			);
		} finally {
			setIsConverting(false);
		}
	};

	return (
		<main className="min-h-screen bg-background">
			<SiteHeader />
			<div className="mx-auto grid w-full max-w-3xl gap-5 px-4 py-10 md:px-6 md:py-14">
				<header className="grid gap-2">
					<span className="font-medium text-muted-foreground text-xs uppercase tracking-[0.18em]">
						GitHub App setup
					</span>
					<h1 className="font-semibold text-2xl tracking-tight md:text-3xl">
						Exchange manifest code
					</h1>
				</header>

				<Card className="rounded-md border-muted/60">
					<CardHeader className="space-y-1 pb-3">
						<CardTitle className="flex items-center gap-2 font-medium text-base">
							<KeyRound className="size-4 text-muted-foreground" />
							Manifest exchange
						</CardTitle>
						<CardDescription className="text-xs leading-5">
							Exchange the one-hour GitHub manifest code, then save the returned
							values as Cloudflare secrets.
						</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-4">
						<div className="flex flex-wrap items-center gap-2">
							<Badge variant="secondary">Code detected</Badge>
							{setupAction ? (
								<Badge variant="outline">{setupAction}</Badge>
							) : null}
						</div>

						<Button
							disabled={isConverting}
							onClick={exchangeCode}
							type="button"
						>
							{isConverting ? (
								<Loader2 className="size-4 animate-spin" />
							) : (
								<Github className="size-4" />
							)}
							Exchange manifest code
						</Button>

						{error ? (
							<p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm">
								{error}
							</p>
						) : null}
					</CardContent>
				</Card>

				{conversion ? <ConvertedApp conversion={conversion} /> : null}
			</div>
			<Footer />
		</main>
	);
}

function ConvertedApp({
	conversion,
}: {
	conversion: GithubManifestConversion;
}) {
	const envSnippet = [
		`GITHUB_APP_ID=${conversion.id}`,
		`GITHUB_APP_SLUG=${conversion.slug}`,
		`GITHUB_WEBHOOK_SECRET=${conversion.webhook_secret}`,
		`GITHUB_APP_PRIVATE_KEY=${JSON.stringify(conversion.pem)}`,
	].join("\n");
	const installUrl = `https://github.com/apps/${conversion.slug}/installations/new`;

	return (
		<Card className="rounded-lg">
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<CheckCircle2 className="size-5 text-emerald-600" />
					{conversion.name ?? conversion.slug}
				</CardTitle>
				<CardDescription>
					Owned by{" "}
					{conversion.owner?.login ?? "the GitHub account that created it"}.
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-4">
				<div className="flex flex-wrap gap-2">
					<a
						className={buttonVariants()}
						href={installUrl}
						rel="noopener noreferrer"
						target="_blank"
					>
						<Github className="size-4" />
						Install on repositories
					</a>
					{conversion.html_url ? (
						<a
							className={buttonVariants({ variant: "outline" })}
							href={conversion.html_url}
							rel="noopener noreferrer"
							target="_blank"
						>
							App settings
						</a>
					) : null}
				</div>
				<Textarea
					className="min-h-44 font-mono text-xs"
					readOnly
					value={envSnippet}
				/>
				<p className="text-muted-foreground text-sm">
					Store these values in Cloudflare before using signed production
					webhooks. The private key is only returned once by GitHub.
				</p>
			</CardContent>
		</Card>
	);
}
