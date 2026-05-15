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
