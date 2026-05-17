import { FileJson, Github, Star } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatStarCount, useGithubStars } from "@/hooks/use-github-stars";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

import {
	apiDocsPath,
	appName,
	githubAppInstallUrl,
	githubAuthEnabled,
	githubRepoUrl,
} from "./constants";

export function SiteHeader() {
	const signInWithGithub = async () => {
		await authClient.signIn.social({
			callbackURL: "/",
			provider: "github",
		});
	};

	return (
		<header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur-xl">
			<div className="mx-auto flex min-h-14 w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 md:px-6">
				<a className="flex min-w-0 items-center gap-2.5" href="/">
					<img
						alt="OSS Protector"
						className="size-7 rounded-md border bg-card object-cover"
						height={28}
						src="/oss-protector-mark.svg"
						width={28}
					/>
					<span className="truncate font-medium text-[15px] tracking-tight">
						{appName}
					</span>
				</a>
				<nav className="flex items-center gap-1">
					<a
						className={buttonVariants({ size: "sm", variant: "ghost" })}
						href="/clankers"
					>
						Clankers
					</a>
					<a
						className={buttonVariants({ size: "sm", variant: "ghost" })}
						href="/protectors"
					>
						Signals
					</a>
					<a
						className={buttonVariants({ size: "sm", variant: "ghost" })}
						href={apiDocsPath}
					>
						<FileJson data-icon="inline-start" />
						API
					</a>
					<GithubStarButton />
					<a
						className={buttonVariants({ size: "sm" })}
						href={githubAppInstallUrl}
					>
						<Github data-icon="inline-start" />
						Install
					</a>
					{githubAuthEnabled ? (
						<Button
							onClick={signInWithGithub}
							size="sm"
							type="button"
							variant="outline"
						>
							<Github data-icon="inline-start" />
							Sign in
						</Button>
					) : null}
				</nav>
			</div>
		</header>
	);
}

function GithubStarButton() {
	const { data: stars, isLoading } = useGithubStars();

	return (
		<a
			aria-label="Star OSS Protector on GitHub"
			className={cn(
				buttonVariants({ size: "sm", variant: "outline" }),
				"gap-0 overflow-hidden p-0"
			)}
			href={githubRepoUrl}
			rel="noopener noreferrer"
			target="_blank"
		>
			<span className="flex items-center gap-1.5 px-2.5">
				<Github className="size-3.5" />
				<span className="hidden sm:inline">Star</span>
			</span>
			<span className="flex h-full items-center gap-1 border-l bg-muted/40 px-2.5 font-mono text-muted-foreground text-xs tabular-nums">
				<Star aria-hidden className="size-3 text-amber-500" />
				{isLoading ? (
					<Skeleton className="h-3 w-6" />
				) : (
					<span>{formatStarCount(stars ?? 0)}</span>
				)}
			</span>
		</a>
	);
}
