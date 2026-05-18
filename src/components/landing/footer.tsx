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
						<a
							className="inline-flex items-center"
							href="https://launchigniter.com/product/oss-protector?ref=badge-oss-protector"
							rel="noopener noreferrer"
							target="_blank"
						>
							<img
								alt="Featured on LaunchIgniter"
								height={55}
								loading="lazy"
								src="https://launchigniter.com/api/badge/oss-protector?theme=light"
								width={212}
							/>
						</a>
						<a
							href="https://www.tinystartups.com/startup/oss-protector"
							rel="noopener noreferrer"
							style={{
								alignItems: "center",
								background:
									"linear-gradient(#fff,#fff) padding-box,linear-gradient(90deg,#3525E6,#D81FE0,#22B8F0) border-box",
								border: "2px solid transparent",
								borderRadius: "14px",
								color: "#0E0B1F",
								display: "inline-flex",
								fontFamily: "'Inter',system-ui,sans-serif",
								gap: "14px",
								padding: "14px 22px 14px 18px",
								textDecoration: "none",
							}}
							target="_blank"
						>
							<svg
								aria-hidden="true"
								height="56"
								viewBox="0 0 100 100"
								width="56"
								xmlns="http://www.w3.org/2000/svg"
							>
								<title>Tiny Startups</title>
								<defs>
									<linearGradient id="tsg" x1=".1" x2=".9" y1="0" y2="1">
										<stop offset="0%" stopColor="#3525E6" />
										<stop offset="55%" stopColor="#D81FE0" />
										<stop offset="100%" stopColor="#22B8F0" />
									</linearGradient>
								</defs>
								<path
									d="M50 6C52 32 68 48 94 50C68 52 52 68 50 94C48 68 32 52 6 50C32 48 48 32 50 6Z"
									fill="url(#tsg)"
								/>
							</svg>
							<span
								style={{
									display: "flex",
									flexDirection: "column",
									lineHeight: 1.15,
								}}
							>
								<span
									style={{
										color: "#6A6585",
										fontFamily: "monospace",
										fontSize: "9px",
										fontWeight: 600,
										letterSpacing: "0.18em",
										textTransform: "uppercase",
									}}
								>
									Launched on
								</span>
								<span
									style={{
										fontSize: "22px",
										fontWeight: 800,
										letterSpacing: "-0.025em",
									}}
								>
									Tiny Startups
								</span>
								<span
									style={{
										color: "#6A6585",
										fontSize: "11px",
										marginTop: "4px",
									}}
								>
									tinystartups.com
								</span>
							</span>
						</a>
					</div>
				</div>
			</div>
		</footer>
	);
}
