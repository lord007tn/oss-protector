import { Github, Scale } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

import {
	apiDocsPath,
	appName,
	githubAppInstallUrl,
	githubRepoLicenseUrl,
	githubRepoSlug,
	githubRepoUrl,
} from "./constants";

const FOOTER_LINKS = [
	{ href: "/clankers", label: "Review feed" },
	{ href: "/protectors", label: "Signals" },
	{ href: apiDocsPath, label: "API" },
	{ href: githubAppInstallUrl, label: "Install" },
	{ href: "/contest", label: "Contest" },
	{ href: "/privacy", label: "Privacy" },
	{ href: "/terms", label: "Terms" },
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
						<Badge
							className="ml-1 gap-1 rounded-full font-medium text-[10px] uppercase tracking-[0.14em]"
							variant="outline"
						>
							<Github className="size-3" />
							Open source
						</Badge>
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
					<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
						<a
							className="inline-flex items-center gap-1.5 hover:text-foreground"
							href={githubRepoUrl}
							rel="noopener noreferrer"
							target="_blank"
						>
							<Github className="size-3.5" />
							{githubRepoSlug}
						</a>
						<span aria-hidden className="text-muted-foreground/60">
							·
						</span>
						<a
							className="inline-flex items-center gap-1.5 hover:text-foreground"
							href={githubRepoLicenseUrl}
							rel="noopener noreferrer"
							target="_blank"
						>
							<Scale className="size-3.5" />
							MIT licensed
						</a>
						<a
							className="inline-flex items-center"
							href="https://startupfa.me/s/oss-protector?utm_source=oss-protector.raedbahri90.workers.dev"
							rel="noopener noreferrer"
							target="_blank"
						>
							<img
								alt="OSS Protector - Featured on Startup Fame"
								height={36}
								loading="lazy"
								src="https://startupfa.me/badges/featured-badge-small.webp"
								width={224}
							/>
						</a>
					</div>
				</div>
			</div>
		</footer>
	);
}
