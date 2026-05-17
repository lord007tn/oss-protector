import { createFileRoute } from "@tanstack/react-router";

import { publicAppUrl } from "@/components/landing/constants";
import { LandingPage } from "@/components/landing/landing-page";
import { getDashboardFn } from "@/functions/dashboard";
import { useDashboard } from "@/hooks/api/dashboard/use-dashboard";

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
					"OSS Protector helps open-source maintainers review risky GitHub pull request activity with a shared GitHub App and a public review directory.",
				name: "description",
			},
			{
				content: "OSS Protector | Shared OSS Abuse Intelligence",
				property: "og:title",
			},
			{
				content:
					"Install a shared GitHub App and browse the public review directory for suspicious OSS contribution patterns.",
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
});

function LandingRoute() {
	const initialData = Route.useLoaderData();
	const dashboardQuery = useDashboard({ initialData });
	const dashboard = dashboardQuery.data ?? initialData;

	return <LandingPage dashboard={dashboard} />;
}
