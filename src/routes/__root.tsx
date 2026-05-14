import { TanStackDevtools } from "@tanstack/react-devtools";
import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RootProvider } from "@/integrations/tanstack-query/root-provider";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
	head: () => ({
		links: [
			{
				href: appCss,
				rel: "stylesheet",
			},
			{
				href: "/favicon.ico",
				rel: "icon",
			},
		],
		meta: [
			{ charSet: "utf-8" },
			{
				content: "width=device-width, initial-scale=1",
				name: "viewport",
			},
			{
				title: "Clankers List",
			},
			{
				content:
					"Shared OSS abuse intelligence for GitHub maintainers, suspicious PR reports, and public bot risk feeds.",
				name: "description",
			},
		],
	}),
	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: ReactNode }) {
	const showDevtools = import.meta.env.DEV;

	return (
		<html lang="en" suppressHydrationWarning>
			<head>
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
