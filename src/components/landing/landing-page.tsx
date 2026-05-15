import type { DirectoryDashboard } from "@/data-access/directory";

import { buildAnalytics } from "./analytics";
import { Credits } from "./credits";
import { Hero } from "./hero";
import { HowItWorks } from "./how-it-works";
import { SiteHeader } from "./site-header";

export function LandingPage({ dashboard }: { dashboard: DirectoryDashboard }) {
	const riskyAccounts = dashboard.riskProfiles.filter(
		(profile) => profile.status !== "allow"
	);
	const analytics = buildAnalytics(riskyAccounts);

	return (
		<main className="min-h-screen bg-background text-foreground">
			<SiteHeader />
			<Hero analytics={analytics} dashboard={dashboard} />
			<HowItWorks />
			<Credits />
		</main>
	);
}
