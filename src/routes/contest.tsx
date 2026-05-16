import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight, ShieldCheck } from "lucide-react";

import { publicAppUrl } from "@/components/landing/constants";
import { Footer } from "@/components/landing/footer";
import { PolicyPage, PolicySection } from "@/components/landing/policy-page";
import { SiteHeader } from "@/components/landing/site-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";

const ISSUE_TEMPLATE = `Hi OSS Protector maintainers,

I'm requesting removal or correction for the following listing:

GitHub login: <your-login>
Listing URL: ${publicAppUrl}/clankers?q=<your-login>
Reason for the request:

- [ ] I was incorrectly listed (please remove)
- [ ] The reason code is wrong (please update)
- [ ] The score is wrong (please re-review)
- [ ] Other:

Context I want OSS Protector reviewers to consider:
`;

const ISSUE_URL = `https://github.com/lord007tn/oss-protector/issues/new?title=${encodeURIComponent("Delisting / correction request: <your-login>")}&body=${encodeURIComponent(ISSUE_TEMPLATE)}`;

export const Route = createFileRoute("/contest")({
	component: ContestRoute,
	head: () => ({
		links: [{ href: `${publicAppUrl}/contest`, rel: "canonical" }],
		meta: [
			{ title: "Contest a listing | OSS Protector" },
			{
				content:
					"Ask a maintainer to dismiss the report, allowlist your account, or open a removal request with the OSS Protector reviewers.",
				name: "description",
			},
		],
	}),
});

function ContestRoute() {
	return (
		<main className="min-h-screen bg-background text-foreground">
			<SiteHeader />
			<PolicyPage
				description="OSS Protector publishes a shared review feed. If you're listed and believe it's wrong, here's how to fix it — there are two paths."
				eyebrow="Contest a listing"
				title="How to remove or correct a listing."
			>
				<Alert>
					<ShieldCheck />
					<AlertTitle>
						OSS Protector is informational, not a verdict.
					</AlertTitle>
					<AlertDescription>
						The feed is shared context for maintainers. Being listed doesn't
						block you from contributing — it just means at least one signal was
						captured. Most listings are correctable by the repository's own
						maintainer.
					</AlertDescription>
				</Alert>

				<PolicySection title="1. Ask a repo maintainer to correct it (fastest)">
					<p>
						If the report came from a specific pull request, the easiest path is
						to ask a maintainer of that repo (anyone with{" "}
						<code className="font-mono text-[12px]">OWNER</code>,{" "}
						<code className="font-mono text-[12px]">MEMBER</code>, or{" "}
						<code className="font-mono text-[12px]">COLLABORATOR</code>{" "}
						association) to post a correction command in any PR comment:
					</p>
					<pre className="overflow-x-auto rounded-md border bg-foreground p-3 font-mono text-background text-xs leading-6">
						<code>
							@oss-protector dismiss # mark all open reports on this PR's author
							as dismissed{"\n"}
							@oss-protector allow # permanently allowlist the PR author
						</code>
					</pre>
					<p>
						The bot posts a confirmation comment, dismisses the open reports,
						and records a negative correction signal that lowers the published
						score within seconds. Non-maintainer comments using those verbs are
						ignored.
					</p>
				</PolicySection>

				<PolicySection title="2. Open a delisting request with us">
					<p>
						If no maintainer is reachable, or the issue is with the score or
						reason rather than the report itself, open a GitHub issue against
						this project. We respond within a few days and update or remove the
						listing if warranted.
					</p>
					<a
						className={buttonVariants({ size: "sm" })}
						href={ISSUE_URL}
						rel="noopener noreferrer"
						target="_blank"
					>
						Open delisting issue
						<ArrowUpRight data-icon="inline-end" />
					</a>
				</PolicySection>

				<PolicySection title="What we'll look at">
					<ul className="list-disc space-y-1 pl-4">
						<li>Whether the original report came from a maintainer.</li>
						<li>
							Whether the cited PR or comment actually contains the abuse
							pattern in the reason code.
						</li>
						<li>
							Whether the score has been reinforced by independent corroboration
							or is dominated by a single report.
						</li>
					</ul>
					<p>
						If we remove the listing, the public score drops to 0 and the entry
						no longer appears in the feed. We do not remove the underlying audit
						log of webhook events — that's how we keep the system honest against
						retro-edits.
					</p>
				</PolicySection>

				<PolicySection title="Privacy">
					<p>
						We only store GitHub-public account data (login, avatar URL, account
						type) plus the text of maintainer commands and webhook payloads. See{" "}
						<a href="/privacy">/privacy</a> for the full data scope and
						retention.
					</p>
				</PolicySection>
			</PolicyPage>
			<Footer />
		</main>
	);
}
