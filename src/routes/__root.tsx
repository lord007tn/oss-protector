import { TanStackDevtools } from "@tanstack/react-devtools";
import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import type { ReactNode } from "react";
import { ErrorPage, NotFoundPage } from "@/components/landing/status-page";
import { JsonLd, siteJsonLd } from "@/components/seo/json-ld";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RootProvider } from "@/integrations/tanstack-query/root-provider";

import appCss from "../styles.css?url";

export const Route = createRootRoute({
	errorComponent: ({ error, reset }) => (
		<ErrorPage
			digest={
				error && typeof error === "object" && "digest" in error
					? String((error as { digest: unknown }).digest ?? "")
					: undefined
			}
			onReset={reset}
		/>
	),
	head: () => ({
		links: [
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
					"OSS Protector connects to GitHub, captures maintainer reports, and publishes a filterable clanker API for open-source projects.",
				name: "description",
			},
		],
	}),
	notFoundComponent: () => (
		<NotFoundPage
			pathname={
				typeof window === "undefined" ? undefined : window.location.pathname
			}
		/>
	),
	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: ReactNode }) {
	const showDevtools = import.meta.env.DEV;

	return (
		<html lang="en" suppressHydrationWarning>
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
				</RootProvider>
				{showDevtools ? (
					<TanStackDevtools
						config={{
							position: "bottom-right",
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
