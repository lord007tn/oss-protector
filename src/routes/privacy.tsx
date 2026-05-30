import { createFileRoute } from "@tanstack/react-router";

import { PolicyPage, PolicySection } from "@/components/landing/policy-page";
import { PageShell } from "@/components/site/page-shell";
import { buildSharedHead } from "@/lib/head";

export const Route = createFileRoute("/privacy")({
	component: PrivacyRoute,
	head: () =>
		buildSharedHead({
			description:
				"What OSS Protector collects, how it's used, and how to request changes or deletion.",
			ogType: "article",
			path: "/privacy",
			title: "Privacy | OSS Protector",
		}),
});

function PrivacyRoute() {
	return (
		<PageShell>
			<PolicyPage
				description="What OSS Protector collects, how it's used, and how to ask us to change or delete it."
				eyebrow="Privacy"
				title="Data we collect and how to remove it."
			>
				<PolicySection title="What we store">
					<ul className="list-disc space-y-1 pl-4">
						<li>
							<strong>GitHub-public account data</strong> for accounts that show
							up in webhook payloads or imported sources: login, GitHub user ID,
							avatar URL, account type. We do not store private email addresses.
						</li>
						<li>
							<strong>Maintainer report text</strong> — the body of any
							<code className="font-mono text-[12px]"> @oss-protector</code>{" "}
							command captured from PR or issue comments, plus its{" "}
							<code className="font-mono text-[12px]">author_association</code>{" "}
							value from GitHub.
						</li>
						<li>
							<strong>Pull request metadata</strong>: title, body, base ref,
							changed-file counts, and head SHA. Public repositories may also
							store short patch excerpts used by the analysis model.
						</li>
						<li>
							<strong>Webhook event log</strong>: one minimized row per GitHub
							delivery, retained for debugging and abuse audit.
						</li>
						<li>
							<strong>Imported external sources</strong>: name, URL, and
							per-account row count from public blocklists like UnsafeLabs /
							Bounty-Hunters.
						</li>
					</ul>
				</PolicySection>

				<PolicySection title="What we don't store">
					<ul className="list-disc space-y-1 pl-4">
						<li>Cookies or tracking pixels on the public site.</li>
						<li>
							Visitor IP addresses beyond Cloudflare's transient edge logs.
						</li>
						<li>
							Third-party analytics. The site ships no analytics scripts to the
							browser.
						</li>
						<li>
							API access tokens beyond the short-lived GitHub App installation
							tokens we mint per webhook to post our own comments.
						</li>
					</ul>
				</PolicySection>

				<PolicySection title="Who can see what">
					<p>
						The public account directory (
						<a href="/api/accounts">/api/accounts</a> and the{" "}
						<a href="/accounts">/accounts</a> page) expose only:
					</p>
					<ul className="list-disc space-y-1 pl-4">
						<li>Login, avatar URL, GitHub profile URL.</li>
						<li>Status (allow / watch / review / high_risk / block).</li>
						<li>Score (0-100), confidence, last-seen timestamp.</li>
						<li>Reason codes and aggregate counts.</li>
					</ul>
					<p>
						Maintainer report bodies, private repository names, private PR
						links, and webhook payloads are not exposed via the public API.
					</p>
				</PolicySection>

				<PolicySection title="Retention">
					<p>
						Webhook event logs are retained indefinitely while the project is
						operating, since they're our audit trail against retroactive edits.
						Risk profile rows are retained as long as the listing is published.
						If your listing is removed via the <a href="/appeal">appeal path</a>
						, the profile score drops to 0 and the entry disappears from the
						public directory, but the audit log of the underlying events stays.
					</p>
				</PolicySection>

				<PolicySection title="Removing your data">
					<p>
						Use the <a href="/appeal">appeal a listing</a> page. The fastest
						path is asking a maintainer of the repo where the report came from
						to run{" "}
						<code className="font-mono text-[12px]">
							@oss-protector dismiss
						</code>{" "}
						or{" "}
						<code className="font-mono text-[12px]">@oss-protector allow</code>.
					</p>
				</PolicySection>

				<PolicySection title="Infrastructure">
					<p>
						OSS Protector runs on Cloudflare Workers and Cloudflare D1. AI
						classification uses OpenRouter. Public repository PR titles, bodies,
						file names, and short patch excerpts may be sent to OpenRouter for
						scoring. Private repositories are not sent to OpenRouter unless
						their repo-local policy explicitly opts in. No persistent training
						is performed by OSS Protector and OpenRouter's own data policy
						governs upstream model use.
					</p>
				</PolicySection>

				<PolicySection title="Contact">
					<p>
						Open an issue against{" "}
						<a
							href="https://github.com/lord007tn/oss-protector/issues"
							rel="noopener noreferrer"
							target="_blank"
						>
							lord007tn/oss-protector
						</a>
						.
					</p>
				</PolicySection>
			</PolicyPage>
		</PageShell>
	);
}
