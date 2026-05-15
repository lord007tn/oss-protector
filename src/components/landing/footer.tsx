import { Github } from "lucide-react";

import { Separator } from "@/components/ui/separator";

import { apiDocsPath, appName, githubAppInstallUrl } from "./constants";

const FOOTER_LINKS = [
	{ href: "/clankers", label: "Clankers" },
	{ href: "/protectors", label: "Signals" },
	{ href: apiDocsPath, label: "API" },
	{ href: "/api/risky-users.json", label: "Public feed" },
	{ href: githubAppInstallUrl, label: "Install" },
] as const;

export function Footer() {
	return (
		<footer className="border-t bg-background">
			<div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 md:px-6">
				<div className="flex flex-wrap items-center justify-between gap-4">
					<div className="flex min-w-0 items-center gap-2.5">
						<img
							alt={appName}
							className="size-6 rounded-md border bg-card object-cover"
							height={24}
							src="/oss-protector-mark.svg"
							width={24}
						/>
						<span className="font-medium text-sm tracking-tight">
							{appName}
						</span>
					</div>
					<nav
						aria-label="Footer"
						className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-sm"
					>
						{FOOTER_LINKS.map((link) => (
							<a
								className="hover:text-foreground"
								href={link.href}
								key={link.href}
							>
								{link.label}
							</a>
						))}
					</nav>
				</div>
				<Separator />
				<div className="flex flex-wrap items-center justify-between gap-3 text-muted-foreground text-xs">
					<p className="max-w-2xl leading-5">
						Shared review signal for open-source maintainers. Data is
						informational, not a verdict. Maintainers can correct any listing
						with{" "}
						<code className="font-mono text-[11px]">
							@oss-protector dismiss
						</code>{" "}
						or{" "}
						<code className="font-mono text-[11px]">@oss-protector allow</code>.
					</p>
					<a
						className="inline-flex items-center gap-1.5 hover:text-foreground"
						href="https://github.com/lord007tn/oss-protector"
						rel="noopener noreferrer"
						target="_blank"
					>
						<Github className="size-3.5" />
						lord007tn/oss-protector
					</a>
				</div>
			</div>
		</footer>
	);
}
