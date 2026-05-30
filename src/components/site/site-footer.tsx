import { Github } from "lucide-react";
import { apiDocsPath, githubRepoUrl } from "@/components/landing/constants";
import { Logo } from "@/components/oss/logo";

const COLUMNS = [
	{
		title: "Product",
		links: [
			{ href: "/feed", label: "Public feed" },
			{ href: "/accounts", label: "Account directory" },
			{ href: apiDocsPath, label: "API" },
			{ href: "/install", label: "Install" },
		],
	},
	{
		title: "Community",
		links: [
			{ href: "/methodology", label: "Methodology" },
			{ href: "/sponsors", label: "Sponsors" },
			{ href: "/appeal", label: "Appeal a flag" },
		],
	},
	{
		title: "Project",
		links: [
			{ href: githubRepoUrl, label: "GitHub" },
			{ href: "/privacy", label: "Privacy" },
			{ href: "/terms", label: "Terms" },
		],
	},
];

export function SiteFooter() {
	return (
		<footer className="mt-16 border-t">
			<div className="mx-auto grid w-full max-w-[1240px] gap-10 px-4 py-12 md:grid-cols-[2fr_1fr_1fr_1fr] md:px-8">
				<div>
					<Logo />
					<p className="mt-3.5 max-w-80 text-muted-foreground text-sm leading-relaxed">
						A community shield for open-source maintainers. Shared abuse
						intelligence for suspicious GitHub pull-request activity — one app,
						one public directory, one open scoring engine.
					</p>
					<a
						className="mt-4 inline-flex items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
						href={githubRepoUrl}
						rel="noopener noreferrer"
						target="_blank"
					>
						<Github className="size-3.5" />
						Star on GitHub
					</a>
				</div>
				{COLUMNS.map((column) => (
					<div key={column.title}>
						<h4 className="mb-3.5 font-medium font-mono text-muted-foreground text-xs uppercase tracking-wider">
							{column.title}
						</h4>
						<ul className="flex flex-col gap-2.5">
							{column.links.map((link) => (
								<li key={link.label}>
									<a
										className="text-muted-foreground text-sm hover:text-foreground"
										href={link.href}
									>
										{link.label}
									</a>
								</li>
							))}
						</ul>
					</div>
				))}
			</div>
			<div className="mx-auto flex w-full max-w-[1240px] items-center justify-between border-t px-4 py-7 font-mono text-muted-foreground text-xs md:px-8">
				<span>© 2026 OSS Protector · MIT licensed</span>
				<span>Open methodology · Community governed</span>
			</div>
		</footer>
	);
}
