import { FileJson, Github } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

import {
	apiDocsPath,
	appName,
	githubAppInstallUrl,
	githubAuthEnabled,
} from "./constants";

export function SiteHeader() {
	const signInWithGithub = async () => {
		await authClient.signIn.social({
			callbackURL: "/",
			provider: "github",
		});
	};

	return (
		<header className="sticky top-0 z-30 border-b bg-background/92 backdrop-blur-xl">
			<div className="mx-auto flex min-h-16 w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
				<a className="flex min-w-0 items-center gap-3" href="/">
					<img
						alt="OSS Protector"
						className="size-10 rounded-lg border bg-card object-cover"
						height={40}
						src="/oss-protector-mark.svg"
						width={40}
					/>
					<span className="truncate font-semibold text-lg">{appName}</span>
				</a>
				<nav className="flex items-center gap-2">
					<a className={buttonVariants({ variant: "ghost" })} href="/clankers">
						Clankers
					</a>
					<a
						className={buttonVariants({ variant: "ghost" })}
						href="/protectors"
					>
						Signals
					</a>
					<a
						className={buttonVariants({ variant: "ghost" })}
						href={apiDocsPath}
					>
						<FileJson data-icon="inline-start" />
						API
					</a>
					<a className={buttonVariants()} href={githubAppInstallUrl}>
						<Github data-icon="inline-start" />
						Install
					</a>
					{githubAuthEnabled ? (
						<Button onClick={signInWithGithub} type="button" variant="outline">
							<Github data-icon="inline-start" />
							Sign in
						</Button>
					) : null}
				</nav>
			</div>
		</header>
	);
}
