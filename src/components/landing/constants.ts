import type { ChartConfig } from "@/components/ui/chart";

export const appName = "OSS Protector";
export const apiDocsPath = "/api-docs";
export const feedPath = "/api/clankers";
export const publicAppUrl = "https://oss-protector.raedbahri90.workers.dev";
export const githubAppSlug =
	import.meta.env.VITE_GITHUB_APP_SLUG ?? "oss-protector";
export const githubAppInstallUrl = `https://github.com/apps/${githubAppSlug}/installations/new`;
export const githubAuthEnabled =
	import.meta.env.VITE_ENABLE_GITHUB_AUTH === "true";

export const statusChartConfig = {
	block: {
		color: "var(--color-destructive)",
		label: "Block",
	},
	high_risk: {
		color: "var(--color-chart-4)",
		label: "High risk",
	},
	review: {
		color: "var(--color-chart-5)",
		label: "Review",
	},
	watch: {
		color: "var(--color-primary)",
		label: "Watch",
	},
} satisfies ChartConfig;
