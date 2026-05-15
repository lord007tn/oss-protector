import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Github, KeyRound, Loader2 } from "lucide-react";
import { useState } from "react";
import type { GithubManifestConversion } from "@/actions/github-manifest";
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
		setup_action:
			typeof search.setup_action === "string" ? search.setup_action : undefined,
	}),
});

function InstallRoute() {
	const { code, setup_action: setupAction } = Route.useSearch();
	const [conversion, setConversion] = useState<GithubManifestConversion | null>(
		null
	);
	const [error, setError] = useState<string | null>(null);
	const [isConverting, setIsConverting] = useState(false);

	const exchangeCode = async () => {
		if (!code) {
			setError("No GitHub manifest code was provided.");
			return;
		}
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
			<div className="mx-auto grid w-full max-w-4xl gap-5 px-4 py-6 md:px-6">
				<header className="grid gap-2">
					<div className="flex items-center gap-2 text-muted-foreground text-sm">
						<Github className="size-4 text-primary" />
						GitHub App setup
					</div>
					<h1 className="font-semibold text-2xl md:text-3xl">
						Finish OSS Protector installation
					</h1>
				</header>

				<Card className="rounded-lg">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<KeyRound className="size-5 text-primary" />
							Manifest exchange
						</CardTitle>
						<CardDescription>
							Exchange the one-hour GitHub manifest code, then save the returned
							values as Cloudflare secrets.
						</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-4">
						<div className="flex flex-wrap items-center gap-2">
							<Badge variant={code ? "secondary" : "destructive"}>
								{code ? "Code detected" : "Missing code"}
							</Badge>
							{setupAction ? (
								<Badge variant="outline">{setupAction}</Badge>
							) : null}
						</div>

						<Button
							disabled={!code || isConverting}
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
							<p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm">
								{error}
							</p>
						) : null}
					</CardContent>
				</Card>

				{conversion ? <ConvertedApp conversion={conversion} /> : null}
			</div>
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
