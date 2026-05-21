import { createFileRoute } from "@tanstack/react-router";
import {
	FileJson,
	Gauge,
	MessageSquareWarning,
	ShieldCheck,
	UsersRound,
} from "lucide-react";
import type { ReactNode } from "react";

import { publicAppUrl } from "@/components/landing/constants";
import { PageShell } from "@/components/site/page-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
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

export const Route = createFileRoute("/api-docs")({
	component: ApiDocsRoute,
	head: () => ({
		links: [
			{
				href: `${publicAppUrl}/api-docs`,
				rel: "canonical",
			},
		],
		meta: [
			{ title: "API Documentation | OSS Protector" },
			{
				content:
					"Use OSS Protector JSON endpoints to query risky GitHub accounts, review statuses, reason details, and maintainer reports.",
				name: "description",
			},
			{ content: "API Documentation | OSS Protector", property: "og:title" },
			{
				content:
					"Integrate the OSS Protector clanker directory into repository automation and dashboards.",
				property: "og:description",
			},
			{
				content: `${publicAppUrl}/oss-protector-mark.svg`,
				property: "og:image",
			},
			{ content: "summary_large_image", name: "twitter:card" },
		],
	}),
});

const clankerParams = [
	{
		name: "q",
		values: "string",
		description: "Search login or evidence summary.",
	},
	{
		name: "status",
		values: `all, ${RISK_STATUSES.filter((status) => status !== "allow").join(", ")}`,
		description: "Filter by published review status.",
	},
	{
		name: "reason",
		values: `all, ${REASON_CODES.join(", ")}`,
		description: "Filter by stored abuse reason.",
	},
	{
		name: "min_score",
		values: "number",
		description: "Only return clankers at or above this score.",
	},
	{
		name: "limit",
		values: "1-500",
		description: "Maximum rows returned. Defaults to 250.",
	},
];

const protectorParams = [
	{
		name: "q",
		values: "string",
		description: "Search maintainer login.",
	},
	{
		name: "min_score",
		values: "number",
		description: "Only return maintainers at or above this validated score.",
	},
	{
		name: "min_reports",
		values: "number",
		description:
			"Only return maintainers with at least this many review signals.",
	},
	{
		name: "limit",
		values: "1-500",
		description: "Maximum rows returned. Defaults to 250.",
	},
];

function ApiDocsRoute() {
	return (
		<PageShell>
			<div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-10 md:px-6">
				<div className="max-w-2xl">
					<span className="font-medium text-muted-foreground text-xs uppercase tracking-[0.18em]">
						API
					</span>
					<h1 className="mt-2 text-balance font-semibold text-2xl tracking-tight md:text-3xl">
						Use the clanker directory in your own tooling.
					</h1>
					<p className="mt-2 text-muted-foreground text-sm leading-6 md:text-[15px]">
						JSON endpoints with query-param filters. Use them for pre-merge
						checks, dashboards, or repository automation.
					</p>
				</div>

				<Alert>
					<Gauge />
					<AlertTitle>Rate limits</AlertTitle>
					<AlertDescription>
						Public read endpoints (
						<code className="font-mono text-[11px]">/api/clankers</code>,{" "}
						<code className="font-mono text-[11px]">/api/protectors</code>) are
						throttled at <strong>60 requests per minute per client IP</strong>{" "}
						(IPv6 clients bucketed by{" "}
						<code className="font-mono text-[11px]">/64</code> prefix). Webhooks
						are not throttled. Over-limit responses return{" "}
						<code className="font-mono text-[11px]">HTTP 429</code> with{" "}
						<code className="font-mono text-[11px]">Retry-After: 60</code>.
					</AlertDescription>
				</Alert>

				<div className="grid gap-4 lg:grid-cols-2">
					<Card className="rounded-md border-muted/60">
						<CardHeader className="space-y-1 pb-3">
							<CardTitle className="flex items-center gap-2 font-medium text-base">
								<MessageSquareWarning className="size-4 text-muted-foreground" />
								Report commands
							</CardTitle>
							<CardDescription className="text-xs leading-5">
								Mention the app in a PR or issue comment to capture a review
								signal. Submitted and needs-review reports are tracked, but only
								validated or corroborated reports affect shared scores.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<pre className="overflow-x-auto rounded-md border bg-foreground p-3 font-mono text-background text-xs leading-6">
								<code>
									{[
										"@oss-protector review this user",
										"@oss-protector flag this user reason: fake bounty",
										"@oss-protector recommend block reason: malicious code",
									].join("\n")}
								</code>
							</pre>
						</CardContent>
					</Card>
					<Card className="rounded-md border-muted/60">
						<CardHeader className="space-y-1 pb-3">
							<CardTitle className="flex items-center gap-2 font-medium text-base">
								<ShieldCheck className="size-4 text-muted-foreground" />
								Maintainer corrections
							</CardTitle>
							<CardDescription className="text-xs leading-5">
								Repo owners and members (author_association OWNER, MEMBER, or
								COLLABORATOR) can correct the system from a PR comment. Each
								correction is applied silently and recorded as an in-app
								notification — no reply is posted to the PR.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<pre className="overflow-x-auto rounded-md border bg-foreground p-3 font-mono text-background text-xs leading-6">
								<code>
									{[
										"@oss-protector dismiss     # false positive: dismiss all open reports",
										"@oss-protector confirm     # validate the latest open report",
										"@oss-protector allow       # allowlist the PR author (sticky)",
										"@oss-protector reset       # clear a prior allowlist; recompute from current signals",
									].join("\n")}
								</code>
							</pre>
						</CardContent>
					</Card>
				</div>

				<div className="grid gap-4 lg:grid-cols-2">
					<EndpointCard
						description="Filterable list of accounts currently published for review."
						example="/api/clankers?status=review&reason=external_blocklist&min_score=70&limit=10"
						href="/api/clankers"
						icon={<UsersRound className="size-4 text-muted-foreground" />}
						method="GET"
						params={clankerParams}
						title="/api/clankers"
					/>
					<EndpointCard
						description="Filterable list of maintainers who submitted review signals."
						example="/api/protectors?min_reports=1&min_score=10&limit=10"
						href="/api/protectors"
						icon={<ShieldCheck className="size-4 text-muted-foreground" />}
						method="GET"
						params={protectorParams}
						title="/api/protectors"
					/>
				</div>
			</div>
		</PageShell>
	);
}

function EndpointCard({
	description,
	example,
	href,
	icon,
	method,
	params,
	title,
}: {
	description: string;
	example: string;
	href: string;
	icon: ReactNode;
	method: string;
	params: Array<{
		description: string;
		name: string;
		values: string;
	}>;
	title: string;
}) {
	return (
		<Card className="rounded-md border-muted/60">
			<CardHeader className="space-y-1 pb-3">
				<CardTitle className="flex items-center gap-2 font-medium text-base">
					{icon}
					<span className="font-mono text-[15px]">{title}</span>
				</CardTitle>
				<CardDescription className="text-xs leading-5">
					{description}
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-3">
				<div className="grid gap-2">
					<Badge
						className="w-fit rounded-sm font-mono text-[10px] uppercase tracking-wide"
						variant="secondary"
					>
						{method}
					</Badge>
					<pre className="overflow-x-auto rounded-md border bg-foreground p-3 font-mono text-background text-xs leading-6">
						<code>{example}</code>
					</pre>
				</div>
				<ParameterTable params={params} title={title} />
				<a
					className={buttonVariants({ size: "sm", variant: "outline" })}
					href={href}
				>
					<FileJson data-icon="inline-start" />
					Open endpoint
				</a>
			</CardContent>
		</Card>
	);
}

function ParameterTable({
	params,
	title,
}: {
	params: Array<{
		description: string;
		name: string;
		values: string;
	}>;
	title: string;
}) {
	return (
		<Table aria-label={`${title} query parameters`}>
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
						<TableCell className="font-mono text-sm">{param.name}</TableCell>
						<TableCell className="text-muted-foreground text-sm">
							{param.values}
						</TableCell>
						<TableCell className="text-sm">{param.description}</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
