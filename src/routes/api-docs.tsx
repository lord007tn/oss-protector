import { createFileRoute } from "@tanstack/react-router";
import {
	FileJson,
	MessageSquareWarning,
	ShieldCheck,
	UsersRound,
} from "lucide-react";
import type { ReactNode } from "react";

import { publicAppUrl } from "@/components/landing/constants";
import { SiteHeader } from "@/components/landing/site-header";
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
					"Integrate the OSS Protector clanker feed into repository automation and dashboards.",
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
		description: "Search protector login.",
	},
	{
		name: "min_score",
		values: "number",
		description: "Only return protectors at or above this score.",
	},
	{
		name: "min_reports",
		values: "number",
		description: "Only return protectors with at least this many reports.",
	},
	{
		name: "limit",
		values: "1-500",
		description: "Maximum rows returned. Defaults to 250.",
	},
];

function ApiDocsRoute() {
	return (
		<main className="min-h-screen bg-background text-foreground">
			<SiteHeader />
			<div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-10 md:px-6">
				<div className="max-w-3xl">
					<Badge className="rounded-md" variant="outline">
						API
					</Badge>
					<h1 className="mt-3 text-balance font-semibold text-3xl md:text-4xl">
						Use the clanker feed in your own tooling.
					</h1>
					<p className="mt-3 text-muted-foreground leading-7">
						The API returns JSON and accepts filters through query params. Use
						it for pre-merge checks, dashboards, or repository automation.
					</p>
				</div>

				<Card className="rounded-lg">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<MessageSquareWarning className="size-5 text-primary" />
							GitHub review commands
						</CardTitle>
						<CardDescription>
							Maintainers can mention the shared app in a pull request to create
							a review signal. Validated maintainer reviews count toward the
							Protectors leaderboard.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<pre className="overflow-x-auto rounded-lg border bg-foreground p-4 text-background text-sm">
							<code>
								{[
									"@oss-protector review this user",
									"@oss-protector flag this user reason: fake bounty",
									"@oss-protector ban this user reason: malicious code",
								].join("\n")}
							</code>
						</pre>
					</CardContent>
				</Card>

				<div className="grid gap-6 lg:grid-cols-2">
					<EndpointCard
						description="Filterable list of accounts currently published for review."
						example="/api/clankers?status=review&reason=external_blocklist&min_score=70&limit=10"
						href="/api/clankers"
						icon={<UsersRound className="size-5 text-primary" />}
						method="GET"
						params={clankerParams}
						title="/api/clankers"
					/>
					<EndpointCard
						description="Filterable list of maintainers who submitted reports."
						example="/api/protectors?min_reports=1&min_score=10&limit=10"
						href="/api/protectors"
						icon={<ShieldCheck className="size-5 text-primary" />}
						method="GET"
						params={protectorParams}
						title="/api/protectors"
					/>
				</div>
			</div>
		</main>
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
		<Card className="rounded-lg">
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					{icon}
					{title}
				</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-4">
				<div className="grid gap-2">
					<Badge variant="secondary">{method}</Badge>
					<pre className="overflow-x-auto rounded-lg border bg-foreground p-4 text-background text-sm">
						<code>{example}</code>
					</pre>
				</div>
				<ParameterTable params={params} title={title} />
				<a className={buttonVariants({ variant: "outline" })} href={href}>
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
