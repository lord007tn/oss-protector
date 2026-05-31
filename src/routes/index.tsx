import { createFileRoute } from "@tanstack/react-router";
import type { DirectoryDashboard } from "@/actions/directory";
import { HomePage } from "@/components/home/home-page";
import { publicAppUrl } from "@/components/landing/constants";
import { PageShell } from "@/components/site/page-shell";
import { getDashboardFn } from "@/functions/dashboard";

export const Route = createFileRoute("/")({
	component: LandingRoute,
	head: () => {
		const title = "OSS Protector | Shared OSS Abuse Intelligence";
		const description =
			"OSS Protector is a community-run GitHub App that flags AI-generated spam pull requests before they hit your review queue. Free, transparent, built by maintainers.";
		const image = `${publicAppUrl}/oss-protector-logo.png`;
		const url = `${publicAppUrl}/`;
		return {
			links: [{ href: url, rel: "canonical" }],
			meta: [
				{ title },
				{ content: description, name: "description" },
				{ content: title, property: "og:title" },
				{ content: description, property: "og:description" },
				{ content: url, property: "og:url" },
				{ content: "website", property: "og:type" },
				{ content: image, property: "og:image" },
				{ content: "summary_large_image", name: "twitter:card" },
				{ content: title, name: "twitter:title" },
				{ content: description, name: "twitter:description" },
				{ content: image, name: "twitter:image" },
			],
		};
	},
	loader: () => getDashboardFn(),
});

function LandingRoute() {
	const dashboard = Route.useLoaderData() as DirectoryDashboard;
	return (
		<PageShell>
			<HomePage dashboard={dashboard} />
		</PageShell>
	);
}
