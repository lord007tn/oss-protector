import { TanStackDevtools } from "@tanstack/react-devtools";
import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import type { ReactNode } from "react";
import { JsonLd, siteJsonLd } from "@/components/seo/json-ld";
import { ErrorView, NotFoundView } from "@/components/site/error-states";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RootProvider } from "@/integrations/tanstack-query/root-provider";

import appCss from "../styles.css?url";

export const Route = createRootRoute({
	errorComponent: ({ error }) => (
		<ErrorView
			digest={
				error && typeof error === "object" && "digest" in error
					? String((error as { digest: unknown }).digest ?? "")
					: undefined
			}
		/>
	),
	head: () => ({
		links: [
			{
				href: "https://fonts.googleapis.com",
				rel: "preconnect",
			},
			{
				crossOrigin: "anonymous",
				href: "https://fonts.gstatic.com",
				rel: "preconnect",
			},
			{
				href: "https://fonts.googleapis.com/css2?family=Geist:wght@400;450;500;600;700&family=Geist+Mono:wght@400;450;500&display=swap",
				rel: "stylesheet",
			},
			{
				href: appCss,
				rel: "stylesheet",
			},
			{
				href: "/oss-protector-mark.svg",
				rel: "icon",
				type: "image/svg+xml",
			},
		],
		meta: [
			{ charSet: "utf-8" },
			{
				content: "width=device-width, initial-scale=1",
				name: "viewport",
			},
			{
				title: "OSS Protector",
			},
			{
				content:
					"OSS Protector connects to GitHub, captures maintainer reports, and publishes a filterable accounts API for open-source projects.",
				name: "description",
			},
		],
	}),
	notFoundComponent: () => <NotFoundView />,
	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: ReactNode }) {
	const showDevtools =
		import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEVTOOLS === "true";

	return (
		<html className="dark" lang="en" suppressHydrationWarning>
			<head>
				{showDevtools ? (
					<script src="/node_modules/react-scan/dist/auto.global.js" />
				) : null}
				<JsonLd data={siteJsonLd()} />
				<HeadContent />
			</head>
			<body>
				<RootProvider>
					<TooltipProvider>{children}</TooltipProvider>
					<Toaster />
				</RootProvider>
				{showDevtools ? (
					<TanStackDevtools
						config={{
							hideUntilHover: true,
							position: "bottom-right",
							requireUrlFlag: true,
						}}
						plugins={[
							{
								name: "TanStack Router",
								render: <TanStackRouterDevtoolsPanel />,
							},
						]}
					/>
				) : null}
				<Scripts />
			</body>
		</html>
	);
}
