import { createFileRoute } from "@tanstack/react-router";
import { ShieldQuestion } from "lucide-react";

import { publicAppUrl } from "@/components/landing/constants";
import { RiskProfilesCard } from "@/components/landing/directory-lists";
import { ClankerFilters } from "@/components/landing/filter-controls";
import { Footer } from "@/components/landing/footer";
import {
	DirectoryPagination,
	paginateItems,
} from "@/components/landing/pagination";
import { SectionHeading } from "@/components/landing/shared";
import { SiteHeader } from "@/components/landing/site-header";
import { JsonLd } from "@/components/seo/json-ld";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { REASON_CODES } from "@/constants/reason-codes";
import { MAX_RISK_SCORE, RISK_STATUSES } from "@/constants/risk-statuses";
import { getDashboardFn } from "@/functions/dashboard";
import type {
	ClankerFilters as ClankerFilterValues,
	ClankerStatusFilter,
} from "@/helpers/directory-filters";
import { filterClankers } from "@/helpers/directory-filters";
import { useDashboard } from "@/hooks/api/dashboard/use-dashboard";

const reasonCodes = new Set<string>(["all", ...REASON_CODES]);
const riskStatuses = new Set<string>([
	"all",
	...RISK_STATUSES.filter((status) => status !== "allow"),
]);
const PAGE_SIZE = 25;

export const Route = createFileRoute("/clankers")({
	component: ClankersRoute,
	head: () => ({
		links: [
			{
				href: `${publicAppUrl}/clankers`,
				rel: "canonical",
			},
		],
		meta: [
			{ title: "Risk Review Feed | OSS Protector" },
			{
				content:
					"Search the OSS Protector public directory for risky GitHub accounts, statuses, scores, and evidence reasons.",
				name: "description",
			},
			{ content: "Risk Review Feed | OSS Protector", property: "og:title" },
			{
				content:
					"Filter risky GitHub accounts by review status, score, and OSS abuse reason.",
				property: "og:description",
			},
			{
				content: `${publicAppUrl}/oss-protector-mark.svg`,
				property: "og:image",
			},
			{ content: "summary_large_image", name: "twitter:card" },
		],
	}),
	loader: async () => getDashboardFn(),
	validateSearch: (search) => ({
		min_score: numberSearch(search.min_score),
		page: pageSearch(search.page),
		q: stringSearch(search.q),
		reason: reasonSearch(search.reason),
		status: statusSearch(search.status),
	}),
});

function ClankersRoute() {
	const initialData = Route.useLoaderData();
	const search = Route.useSearch();
	const filters = {
		min_score: search.min_score ?? 0,
		page: search.page ?? 1,
		q: search.q ?? "",
		reason: search.reason ?? "all",
		status: search.status ?? "all",
	};
	const dashboardQuery = useDashboard({ initialData });
	const dashboard = dashboardQuery.data ?? initialData;
	const matchingProfiles = filterClankers(dashboard.riskProfiles, {
		limit: Number.MAX_SAFE_INTEGER,
		minScore: filters.min_score,
		q: filters.q,
		reason: filters.reason,
		status: filters.status,
	});
	const paginatedProfiles = paginateItems({
		items: matchingProfiles,
		page: filters.page,
		pageSize: PAGE_SIZE,
	});

	return (
		<main className="min-h-screen bg-background text-foreground">
			<JsonLd
				data={{
					"@context": "https://schema.org",
					"@type": "Dataset",
					description:
						"Filterable OSS Protector review feed of risky GitHub accounts, review statuses, scores, and evidence reasons.",
					distribution: {
						"@type": "DataDownload",
						contentUrl: `${publicAppUrl}/api/clankers`,
						encodingFormat: "application/json",
					},
					isAccessibleForFree: true,
					keywords: [
						"open source security",
						"github abuse review",
						"maintainer reports",
					],
					name: "OSS Protector Clanker Review Feed",
					provider: {
						"@id": `${publicAppUrl}/#organization`,
					},
					url: `${publicAppUrl}/clankers`,
				}}
			/>
			<JsonLd
				data={{
					"@context": "https://schema.org",
					"@type": "ItemList",
					itemListElement: paginatedProfiles.items.map((profile, index) => ({
						"@type": "ListItem",
						item: {
							"@type": "Person",
							identifier: profile.githubUserId,
							name: profile.login,
							url: profile.htmlUrl ?? `${publicAppUrl}/clankers`,
						},
						name: `${profile.login} - ${profile.status}`,
						position: paginatedProfiles.start + index,
					})),
					name: "OSS Protector clanker page results",
					numberOfItems: paginatedProfiles.items.length,
					url: `${publicAppUrl}/clankers`,
				}}
			/>
			<SiteHeader />
			<div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-10 md:px-6">
				<SectionHeading
					description="Every account currently published for maintainer review. Use the filters here or call the same filters through the API."
					eyebrow="Review feed"
					headingLevel={1}
					title="Risk review feed."
				/>
				<Alert>
					<ShieldQuestion />
					<AlertTitle>Listed and believe it's wrong?</AlertTitle>
					<AlertDescription>
						OSS Protector is a review aid, not a verdict. If you're on this page
						and the listing is incorrect,{" "}
						<a className="underline underline-offset-2" href="/contest">
							see how to contest a listing
						</a>
						— most cases are resolved by a single maintainer comment.
					</AlertDescription>
				</Alert>
				<ClankerFilters search={filters} />
				<RiskProfilesCard
					description={`Showing ${paginatedProfiles.start.toLocaleString()}-${paginatedProfiles.end.toLocaleString()} of ${paginatedProfiles.total.toLocaleString()} accounts matching the current filters.`}
					profiles={paginatedProfiles.items}
					title="Accounts for review"
				/>
				<DirectoryPagination
					basePath="/clankers"
					currentPage={paginatedProfiles.currentPage}
					pageCount={paginatedProfiles.pageCount}
					params={filters}
				/>
			</div>
			<Footer />
		</main>
	);
}

function numberSearch(value: unknown) {
	if (typeof value === "string" && value.trim() === "") {
		return;
	}
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		return;
	}
	const normalized = Math.min(MAX_RISK_SCORE, Math.max(0, Math.round(parsed)));
	return normalized > 0 ? normalized : undefined;
}

function pageSearch(value: unknown) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		return;
	}
	const page = Math.max(1, Math.round(parsed));
	return page > 1 ? page : undefined;
}

function stringSearch(value: unknown) {
	if (typeof value !== "string") {
		return;
	}
	const normalized = value.trim();
	return normalized ? normalized : undefined;
}

function reasonSearch(
	value: unknown
): ClankerFilterValues["reason"] | undefined {
	return typeof value === "string" && value !== "all" && reasonCodes.has(value)
		? (value as ClankerFilterValues["reason"])
		: undefined;
}

function statusSearch(value: unknown): ClankerStatusFilter | undefined {
	return typeof value === "string" && value !== "all" && riskStatuses.has(value)
		? (value as ClankerStatusFilter)
		: undefined;
}
