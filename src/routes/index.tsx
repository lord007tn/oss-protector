import { createFileRoute } from "@tanstack/react-router";
import type { DirectoryDashboard } from "@/actions/directory";
import { HomePage } from "@/components/home/home-page";
import { publicAppUrl } from "@/components/landing/constants";
import { PageShell } from "@/components/site/page-shell";
import { getDashboardFn } from "@/functions/dashboard";

export const Route = createFileRoute("/")({
	component: LandingRoute,
	head: () => ({
		links: [
			{
				href: `${publicAppUrl}/`,
				rel: "canonical",
			},
		],
		meta: [
			{ title: "OSS Protector | Shared OSS Abuse Intelligence" },
			{
				content:
					"OSS Protector is a community-run GitHub App that flags AI-generated spam pull requests before they hit your review queue. Free, transparent, built by maintainers.",
				name: "description",
			},
			{
				content: "OSS Protector | Shared OSS Abuse Intelligence",
				property: "og:title",
			},
			{
				content:
					"A community-run GitHub App and public directory for suspicious OSS contribution patterns.",
				property: "og:description",
			},
			{
				content: `${publicAppUrl}/oss-protector-mark.svg`,
				property: "og:image",
			},
			{ content: "summary_large_image", name: "twitter:card" },
		],
	}),
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
