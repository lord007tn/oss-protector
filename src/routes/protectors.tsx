import { createFileRoute } from "@tanstack/react-router";

import { publicAppUrl } from "@/components/landing/constants";
import { ProtectorsCard } from "@/components/landing/directory-lists";
import { ProtectorFilters } from "@/components/landing/filter-controls";
import {
	DirectoryPagination,
	paginateItems,
} from "@/components/landing/pagination";
import { SectionHeading } from "@/components/landing/shared";
import { SiteHeader } from "@/components/landing/site-header";
import { JsonLd } from "@/components/seo/json-ld";
import { getDashboardFn } from "@/functions/dashboard";
import { filterProtectors } from "@/helpers/directory-filters";
import { useDashboard } from "@/hooks/api/dashboard/use-dashboard";

const PAGE_SIZE = 25;

export const Route = createFileRoute("/protectors")({
	component: ProtectorsRoute,
	head: () => ({
		links: [
			{
				href: `${publicAppUrl}/protectors`,
				rel: "canonical",
			},
		],
		meta: [
			{ title: "Maintainer Review Signals | OSS Protector" },
			{
				content:
					"Browse maintainer report activity, submitted review signals, and validated report counts for OSS Protector.",
				name: "description",
			},
			{
				content: "Maintainer Review Signals | OSS Protector",
				property: "og:title",
			},
			{
				content:
					"See submitted, needs-review, validated, and dismissed maintainer report counts for OSS Protector.",
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
		min_reports: numberSearch(search.min_reports),
		min_score: numberSearch(search.min_score),
		page: pageSearch(search.page),
		q: stringSearch(search.q),
	}),
});

function ProtectorsRoute() {
	const initialData = Route.useLoaderData();
	const search = Route.useSearch();
	const filters = {
		min_reports: search.min_reports ?? 0,
		min_score: search.min_score ?? 0,
		page: search.page ?? 1,
		q: search.q ?? "",
	};
	const dashboardQuery = useDashboard({ initialData });
	const dashboard = dashboardQuery.data ?? initialData;
	const matchingProtectors = filterProtectors(dashboard.protectors, {
		limit: 500,
		minReports: filters.min_reports,
		minScore: filters.min_score,
		q: filters.q,
	});
	const paginatedProtectors = paginateItems({
		items: matchingProtectors,
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
						"OSS Protector maintainer review signal dataset showing submitted, needs-review, validated, and dismissed report counts.",
					distribution: {
						"@type": "DataDownload",
						contentUrl: `${publicAppUrl}/api/protectors`,
						encodingFormat: "application/json",
					},
					isAccessibleForFree: true,
					keywords: [
						"open source maintainers",
						"github app reviews",
						"maintainer review signals",
					],
					name: "OSS Protector Maintainer Review Signals",
					provider: {
						"@id": `${publicAppUrl}/#organization`,
					},
					url: `${publicAppUrl}/protectors`,
				}}
			/>
			<JsonLd
				data={{
					"@context": "https://schema.org",
					"@type": "ItemList",
					itemListElement: paginatedProtectors.items.map(
						(protector, index) => ({
							"@type": "ListItem",
							item: {
								"@type": "Person",
								name: protector.login,
							},
							name: `${protector.login} - ${protector.validatedReports} validated reports`,
							position: paginatedProtectors.start + index,
						})
					),
					name: "OSS Protector maintainer review signal page results",
					numberOfItems: paginatedProtectors.items.length,
					url: `${publicAppUrl}/protectors`,
				}}
			/>
			<SiteHeader />
			<div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-10 md:px-6">
				<SectionHeading
					description="Maintainer reports are captured as review signals. Submitted and needs-review reports stay visible, but only validated or independently corroborated evidence affects public score."
					eyebrow="Review signals"
					headingLevel={1}
					title="Maintainer review signals."
				/>
				<ProtectorFilters search={filters} />
				<ProtectorsCard
					description={`Showing ${paginatedProtectors.start.toLocaleString()}-${paginatedProtectors.end.toLocaleString()} of ${paginatedProtectors.total.toLocaleString()} maintainers matching the current filters.`}
					protectors={paginatedProtectors.items}
					startIndex={paginatedProtectors.start - 1}
					title="Review signals"
				/>
				<DirectoryPagination
					basePath="/protectors"
					currentPage={paginatedProtectors.currentPage}
					pageCount={paginatedProtectors.pageCount}
					params={filters}
				/>
			</div>
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
	const normalized = Math.max(0, Math.round(parsed));
	return normalized > 0 ? normalized : undefined;
}

function pageSearch(value: unknown) {
	const parsed = numberSearch(value);
	return parsed && parsed > 1 ? parsed : undefined;
}

function stringSearch(value: unknown) {
	if (typeof value !== "string") {
		return;
	}
	const normalized = value.trim();
	return normalized ? normalized : undefined;
}
