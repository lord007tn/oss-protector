import { createFileRoute } from "@tanstack/react-router";
import {
	BookOpen,
	FileJson,
	Gauge,
	KeyRound,
	LockKeyhole,
	MessageSquareWarning,
	Network,
	Settings,
	ShieldCheck,
	UsersRound,
} from "lucide-react";
import type { ReactNode } from "react";

import { PageShell } from "@/components/site/page-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { REASON_CODES } from "@/constants/reason-codes";
import { RISK_STATUSES } from "@/constants/risk-statuses";
import { buildSharedHead } from "@/lib/head";

export const Route = createFileRoute("/docs")({
	component: DocsRoute,
	head: () =>
		buildSharedHead({
			description:
				"OSS Protector developer documentation — public API, maintainer API, rate limits, pagination, repository policy, and authentication.",
			ogType: "article",
			path: "/docs",
			title: "Docs | OSS Protector",
		}),
});

interface NavSection {
	icon: ReactNode;
	id: string;
	items: { id: string; label: string }[];
	label: string;
}

const NAV: NavSection[] = [
	{
		icon: <BookOpen className="size-3.5" />,
		id: "overview",
		label: "Overview",
		items: [
			{ id: "overview", label: "What this is" },
			{ id: "base-url", label: "Base URL" },
			{ id: "schema-version", label: "Schema version" },
		],
	},
	{
		icon: <UsersRound className="size-3.5" />,
		id: "public-api",
		label: "Public API",
		items: [
			{ id: "endpoint-accounts", label: "GET /api/accounts" },
			{ id: "endpoint-protectors", label: "GET /api/protectors" },
			{ id: "endpoint-free-models", label: "GET /api/openrouter/free-models" },
		],
	},
	{
		icon: <Network className="size-3.5" />,
		id: "pagination",
		label: "Pagination",
		items: [
			{ id: "pagination-params", label: "limit + offset" },
			{ id: "pagination-response", label: "page_info" },
		],
	},
	{
		icon: <ShieldCheck className="size-3.5" />,
		id: "maintainer-api",
		label: "Maintainer API",
		items: [
			{ id: "ep-prefs", label: "User preferences" },
			{ id: "ep-byok", label: "BYOK OpenRouter" },
			{ id: "ep-repo-decision", label: "Repo decisions" },
			{ id: "ep-repo-policy", label: "Repo policy" },
		],
	},
	{
		icon: <Gauge className="size-3.5" />,
		id: "rate-limits",
		label: "Rate limits & errors",
		items: [
			{ id: "rate-limits", label: "60 req/min/IP" },
			{ id: "filter-errors", label: "400 on invalid filter" },
		],
	},
	{
		icon: <MessageSquareWarning className="size-3.5" />,
		id: "commands",
		label: "Bot commands",
		items: [
			{ id: "report-commands", label: "Report commands" },
			{ id: "maintainer-corrections", label: "Maintainer corrections" },
		],
	},
	{
		icon: <Settings className="size-3.5" />,
		id: "configuration",
		label: "Configuration",
		items: [
			{ id: "repo-policy", label: "Repository policy" },
			{ id: "dashboard-editor", label: "Dashboard editor" },
		],
	},
	{
		icon: <LockKeyhole className="size-3.5" />,
		id: "authentication",
		label: "Authentication",
		items: [
			{ id: "auth-github", label: "GitHub OAuth" },
			{ id: "auth-otp", label: "Email OTP" },
		],
	},
];

const accountParams = [
	{ desc: "Search login or evidence summary.", name: "q", values: "string" },
	{
		desc: "Filter by published review status. 400 on unknown values.",
		name: "status",
		values: `all, ${RISK_STATUSES.filter((s) => s !== "allow").join(", ")}`,
	},
	{
		desc: "Filter by stored abuse reason. 400 on unknown values.",
		name: "reason",
		values: `all, ${REASON_CODES.join(", ")}`,
	},
	{
		desc: "Only return accounts at or above this score (0–100).",
		name: "min_score",
		values: "integer 0–100",
	},
	{
		desc: "Page size. Default 50. Larger values rejected with 400.",
		name: "limit",
		values: "integer 1–500",
	},
	{
		desc: "Offset for pagination. Use with limit. Larger values rejected with 400.",
		name: "offset",
		values: "integer 0–50000",
	},
];

const protectorParams = [
	{ desc: "Search maintainer login.", name: "q", values: "string" },
	{
		desc: "Only return maintainers at or above this validated score.",
		name: "min_score",
		values: "integer 0–100",
	},
	{
		desc: "Only return maintainers with at least this many review signals.",
		name: "min_reports",
		values: "integer 0–500",
	},
	{
		desc: "Page size. Default 50.",
		name: "limit",
		values: "integer 1–500",
	},
	{
		desc: "Offset for pagination.",
		name: "offset",
		values: "integer 0–50000",
	},
];

function DocsRoute() {
	return (
		<PageShell>
			<div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[220px_1fr] lg:gap-12 lg:py-10">
				<Sidebar />
				<main className="min-w-0">
					<Header />
					<Section id="overview" title="What this is">
						<p>
							OSS Protector exposes a small public REST API (used by other tools
							and automations to read the public account directory) and a set of
							authenticated maintainer endpoints (used by the dashboard at{" "}
							<code className="text-foreground">/dashboard</code>). All
							responses are JSON.
						</p>
						<p>
							The shape stabilises through{" "}
							<code className="text-foreground">schema_version</code>; breaking
							changes bump the date.
						</p>
					</Section>

					<Section id="base-url" title="Base URL">
						<pre className="max-w-full overflow-x-auto rounded-md border bg-foreground p-3 font-mono text-background text-xs">
							<code>https://oss-protector.raedbahri90.workers.dev</code>
						</pre>
					</Section>

					<Section id="schema-version" title="Schema version">
						<p>
							Every public response includes{" "}
							<code className="text-foreground">"schema_version"</code> (an ISO
							date). When we bump this, the response shape changed. Pin
							consumers to a date and re-test before upgrading.
						</p>
						<p>
							Current: <Badge variant="secondary">2026-05-30</Badge>
						</p>
					</Section>

					<Section id="public-api" title="Public API">
						<p>
							Three public read endpoints. All are throttled per client IP. See{" "}
							<a className="text-primary hover:underline" href="#rate-limits">
								Rate limits
							</a>
							.
						</p>
					</Section>

					<EndpointBlock
						description="Filterable list of accounts currently published for review."
						example="/api/accounts?status=review&reason=external_blocklist&min_score=70&limit=10&offset=0"
						id="endpoint-accounts"
						method="GET"
						params={accountParams}
						path="/api/accounts"
					/>

					<EndpointBlock
						description="Filterable list of maintainers who submitted review signals."
						example="/api/protectors?min_reports=1&min_score=10&limit=10"
						id="endpoint-protectors"
						method="GET"
						params={protectorParams}
						path="/api/protectors"
					/>

					<EndpointBlock
						description="OpenRouter model IDs the platform key cycles through. For transparency — maintainers can see exactly which models are used for analysis when they don't bring their own key."
						example="/api/openrouter/free-models"
						id="endpoint-free-models"
						method="GET"
						params={[]}
						path="/api/openrouter/free-models"
					/>

					<Section id="pagination" title="Pagination">
						<p>
							All filterable endpoints (<code>/api/accounts</code>,{" "}
							<code>/api/protectors</code>) accept the same pagination params
							and return a <code className="text-foreground">page_info</code>{" "}
							block.
						</p>
					</Section>

					<Section id="pagination-params" title="limit + offset">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Param</TableHead>
									<TableHead>Default</TableHead>
									<TableHead>Bounds</TableHead>
									<TableHead>Behavior</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								<TableRow>
									<TableCell className="font-mono">limit</TableCell>
									<TableCell>50</TableCell>
									<TableCell>1–500</TableCell>
									<TableCell>Out-of-bounds → 400.</TableCell>
								</TableRow>
								<TableRow>
									<TableCell className="font-mono">offset</TableCell>
									<TableCell>0</TableCell>
									<TableCell>0–50000</TableCell>
									<TableCell>Out-of-bounds → 400.</TableCell>
								</TableRow>
							</TableBody>
						</Table>
					</Section>

					<Section id="pagination-response" title="page_info">
						<pre className="max-w-full overflow-x-auto rounded-md border bg-foreground p-3 font-mono text-background text-xs leading-6">
							<code>{`{
  "accounts": [...],
  "count": 50,
  "page_info": {
    "limit": 50,
    "offset": 0,
    "total": 149,
    "hasMore": true
  },
  "filters": { ... },
  "schema_version": "2026-05-30"
}`}</code>
						</pre>
						<p>
							<code className="text-foreground">count</code> is this page's row
							count; <code className="text-foreground">total</code> is the full
							matched set. To iterate, increment{" "}
							<code className="text-foreground">offset</code> by{" "}
							<code className="text-foreground">limit</code> until{" "}
							<code className="text-foreground">hasMore</code> is{" "}
							<code>false</code>.
						</p>
					</Section>

					<Section id="maintainer-api" title="Maintainer API">
						<p>
							Authenticated endpoints used by the dashboard. They require an
							active Better Auth session cookie. Sign in at{" "}
							<a className="text-primary hover:underline" href="/login">
								/login
							</a>
							. Not rate-limited by the public 60 req/min bucket. All return{" "}
							<code className="text-foreground">401</code> when called without a
							session.
						</p>
					</Section>

					<EndpointBlock
						description="Read or update your notification kinds + BYOK OpenRouter key. POST accepts { notificationKinds?: string[]; openrouterApiKey?: string | null }. Pass `null` to clear the key."
						id="ep-prefs"
						method="GET / POST"
						path="/api/user/preferences"
					/>

					<EndpointBlock
						description="Validate a BYOK OpenRouter key against /api/v1/key. Body: { apiKey: string }. No model credit consumed."
						id="ep-byok"
						method="POST"
						path="/api/openrouter/test"
					/>

					<EndpointBlock
						description={
							<>
								Block or allow a specific account on a repo you maintain. Body:{" "}
								<code className="text-foreground">{`{ repositoryId, targetLogin, decision: 'block' | 'allow', note? }`}</code>
								. DELETE clears the override.
							</>
						}
						id="ep-repo-decision"
						method="POST / DELETE"
						path="/api/maintainer/repo-decision"
					/>

					<EndpointBlock
						description="List every repo-local override across the repos you maintain."
						id="ep-repo-decision-list"
						method="GET"
						path="/api/maintainer/repo-decisions"
					/>

					<EndpointBlock
						description={
							<>
								Dashboard-saved repository policy (<code>enabled</code>,{" "}
								<code>analyzePrivateRepositories</code>,{" "}
								<code>minimumLikelyAbuseConfidence</code>,{" "}
								<code>trustedAuthors</code>, <code>ignoredPaths</code>). The
								committed <code>.github/oss-protector.json</code> takes
								precedence per-field.
							</>
						}
						id="ep-repo-policy"
						method="GET / POST / DELETE"
						path="/api/maintainer/repo-policy?repositoryId=…"
					/>

					<Section id="rate-limits" title="Rate limits & errors">
						<Alert variant="info">
							<Gauge />
							<AlertTitle>60 req/min per client IP</AlertTitle>
							<AlertDescription>
								Public endpoints (
								<code className="font-mono text-[11px]">/api/accounts</code>,{" "}
								<code className="font-mono text-[11px]">/api/protectors</code>)
								are throttled per IP via Cloudflare Rate Limiting. IPv6 clients
								are bucketed by{" "}
								<code className="font-mono text-[11px]">/64</code> prefix.
								Webhooks and maintainer endpoints are not throttled. Over-limit
								responses return{" "}
								<code className="font-mono text-[11px]">HTTP 429</code> with{" "}
								<code className="font-mono text-[11px]">Retry-After: 60</code>.
							</AlertDescription>
						</Alert>
					</Section>

					<Section id="filter-errors" title="400 on invalid filter">
						<p>
							Invalid filter values (unknown <code>status</code>/{" "}
							<code>reason</code>, out-of-range <code>limit</code>/
							<code>offset</code>/<code>min_score</code>) return{" "}
							<code className="text-foreground">HTTP 400</code> with a
							structured body so you can correct the request without scraping
							the message:
						</p>
						<pre className="max-w-full overflow-x-auto rounded-md border bg-foreground p-3 font-mono text-background text-xs leading-6">
							<code>{`{
  "error": "Invalid limit \\"1000\\". Allowed: 1–500.",
  "field": "limit",
  "value": "1000",
  "allowed": ["1–500"]
}`}</code>
						</pre>
					</Section>

					<Section id="commands" title="Bot commands">
						<p>
							Bot-driven endpoints, invoked by mentioning{" "}
							<code className="text-foreground">@oss-protector</code> in a PR or
							issue comment.
						</p>
					</Section>

					<Section id="report-commands" title="Report commands">
						<p>
							Anyone can file a report by mentioning the bot. Submitted /
							needs-review reports are tracked but only validated or
							corroborated reports affect shared scores.
						</p>
						<pre className="max-w-full overflow-x-auto rounded-md border bg-foreground p-3 font-mono text-background text-xs leading-6">
							<code>
								{[
									"@oss-protector review this user",
									"@oss-protector flag this user reason: fake bounty",
									"@oss-protector recommend block reason: malicious code",
								].join("\n")}
							</code>
						</pre>
					</Section>

					<Section id="maintainer-corrections" title="Maintainer corrections">
						<p>
							Repo owners and members (
							<code className="text-foreground">author_association</code> of{" "}
							<code>OWNER</code>, <code>MEMBER</code>, or{" "}
							<code>COLLABORATOR</code>) can correct the system from any PR
							comment. Each correction is applied silently and recorded as an
							in-app notification. No reply is posted to the PR.
						</p>
						<pre className="max-w-full overflow-x-auto rounded-md border bg-foreground p-3 font-mono text-background text-xs leading-6">
							<code>
								{[
									"@oss-protector dismiss     # false positive: dismiss all open reports",
									"@oss-protector confirm     # validate the latest open report",
									"@oss-protector allow       # allowlist the PR author (sticky)",
									"@oss-protector reset       # clear a prior allowlist; recompute from current signals",
								].join("\n")}
							</code>
						</pre>
					</Section>

					<Section id="configuration" title="Configuration" />

					<Section id="repo-policy" title="Repository policy">
						<p>
							Each repo can tune the analyzer with{" "}
							<code className="text-foreground">
								.github/oss-protector.json
							</code>
							:
						</p>
						<pre className="max-w-full overflow-x-auto rounded-md border bg-foreground p-3 font-mono text-background text-xs leading-6">
							<code>{`{
  "enabled": true,
  "analyzePrivateRepositories": false,
  "minimumLikelyAbuseConfidence": 80,
  "trustedAuthors": ["dependabot[bot]", "renovate[bot]"],
  "ignoredPaths": ["docs/", "examples/"]
}`}</code>
						</pre>
					</Section>

					<Section id="dashboard-editor" title="Dashboard editor">
						<p>
							The same fields can be edited from the{" "}
							<strong>Repo policy</strong> tab in the dashboard. When both
							exist, the committed file wins per-field; the dashboard value
							fills in any field the file doesn't set.
						</p>
					</Section>

					<Section id="authentication" title="Authentication">
						<p>
							OSS Protector uses Better Auth for end-user sign-in and an
							installation-token model (
							<code className="text-foreground">@octokit/auth-app</code>) for
							webhook actions.
						</p>
					</Section>

					<Section id="auth-github" title="GitHub OAuth">
						<p>
							The default sign-in path. Better Auth handles the OAuth round
							trip. Clicking <strong>Continue with GitHub</strong> on{" "}
							<code>/login</code> POSTs to{" "}
							<code className="text-foreground">/api/auth/sign-in/social</code>,
							which returns a github.com authorize URL the browser follows.
							Callback URL:{" "}
							<code className="text-foreground">/api/auth/callback/github</code>
							.
						</p>
					</Section>

					<Section id="auth-otp" title="Email OTP">
						<p>
							Optional email-only sign-in. Requires{" "}
							<code className="text-foreground">RESEND_API_KEY</code> to be set
							on the Worker. Without it, the send is rejected with a clear error
							in non-localhost environments (codes log to the server console in
							local dev).
						</p>
					</Section>

					<Alert className="mt-12" variant="info">
						<KeyRound />
						<AlertTitle>Found something missing?</AlertTitle>
						<AlertDescription>
							File an issue on{" "}
							<a
								href="https://github.com/lord007tn/oss-protector/issues"
								rel="noopener noreferrer"
								target="_blank"
							>
								GitHub
							</a>{" "}
							or open a PR against{" "}
							<code className="font-mono text-foreground">
								src/routes/docs.tsx
							</code>
							.
						</AlertDescription>
					</Alert>
				</main>
			</div>
		</PageShell>
	);
}

function Header() {
	return (
		<header className="mb-10">
			<div className="font-medium text-muted-foreground text-xs uppercase tracking-[0.18em]">
				Docs
			</div>
			<h1 className="mt-2 font-semibold text-3xl tracking-tight md:text-4xl">
				OSS Protector developer docs
			</h1>
			<p className="mt-3 max-w-2xl text-[15px] text-muted-foreground leading-relaxed">
				Public REST API, maintainer-authenticated endpoints, rate limits,
				pagination, repository configuration, and authentication.
			</p>
		</header>
	);
}

function Sidebar() {
	return (
		<aside className="hidden lg:block">
			<nav className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pr-4">
				{NAV.map((section) => (
					<div className="mb-5" key={section.id}>
						<a
							className="mb-1 flex items-center gap-2 font-medium font-mono text-[11px] text-muted-foreground uppercase tracking-[0.06em]"
							href={`#${section.id}`}
						>
							{section.icon}
							{section.label}
						</a>
						<ul className="flex flex-col gap-0.5">
							{section.items.map((item) => (
								<li key={item.id}>
									<a
										className="block rounded px-2 py-1 text-[12.5px] text-muted-foreground hover:bg-muted hover:text-foreground"
										href={`#${item.id}`}
									>
										{item.label}
									</a>
								</li>
							))}
						</ul>
					</div>
				))}
			</nav>
		</aside>
	);
}

function Section({
	children,
	id,
	title,
}: {
	children?: ReactNode;
	id: string;
	title: string;
}) {
	return (
		<section
			className="mb-10 scroll-mt-20 border-border border-t pt-8 first:border-t-0 first:pt-0"
			id={id}
		>
			<h2 className="mb-3 font-semibold text-2xl tracking-tight">
				<a className="hover:text-primary" href={`#${id}`}>
					{title}
				</a>
			</h2>
			<div className="prose prose-sm max-w-none space-y-3 text-[14px] text-muted-foreground leading-relaxed [&_code]:break-words [&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12.5px]">
				{children}
			</div>
		</section>
	);
}

function EndpointBlock({
	description,
	example,
	id,
	method,
	params,
	path,
}: {
	description: ReactNode;
	example?: string;
	id: string;
	method: string;
	params?: { desc: string; name: string; values: string }[];
	path: string;
}) {
	return (
		<section className="mb-8 scroll-mt-20" id={id}>
			<div className="mb-3 flex flex-wrap items-center gap-2">
				<Badge size="method" variant="secondary">
					{method}
				</Badge>
				<code className="font-mono text-[14px]">{path}</code>
			</div>
			<div className="mb-3 text-[14px] text-muted-foreground leading-relaxed">
				{description}
			</div>
			{example ? (
				<pre className="mb-3 max-w-full overflow-x-auto rounded-md border bg-foreground p-3 font-mono text-background text-xs leading-6">
					<code>{example}</code>
				</pre>
			) : null}
			{params && params.length > 0 ? (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Query</TableHead>
							<TableHead>Values</TableHead>
							<TableHead>Meaning</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{params.map((param) => (
							<TableRow key={param.name}>
								<TableCell className="font-mono text-sm">
									{param.name}
								</TableCell>
								<TableCell className="text-muted-foreground text-sm">
									{param.values}
								</TableCell>
								<TableCell className="text-sm">{param.desc}</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			) : null}
			<div className="mt-2">
				<a
					className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground"
					href={path}
				>
					<FileJson className="size-3" />
					Open endpoint
				</a>
			</div>
		</section>
	);
}
