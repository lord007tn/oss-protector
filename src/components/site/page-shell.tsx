import type { ReactNode } from "react";

import { ConsoleRail } from "@/components/site/console-rail";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { cn } from "@/lib/utils";

export function PageShell({
	children,
	authed = false,
	consoleLabel,
	footer = true,
}: {
	children: ReactNode;
	authed?: boolean;
	consoleLabel?: string;
	footer?: boolean;
}) {
	return (
		<div className="flex min-h-screen flex-col bg-background text-foreground">
			<SiteHeader />
			{authed ? <ConsoleRail label={consoleLabel} /> : null}
			<main className="flex-1">{children}</main>
			{footer ? <SiteFooter /> : null}
		</div>
	);
}

export function PageContainer({
	children,
	className,
	width = "default",
}: {
	children: ReactNode;
	className?: string;
	width?: "default" | "narrow";
}) {
	return (
		<div
			className={cn(
				"mx-auto w-full px-4 md:px-8",
				width === "narrow" ? "max-w-[980px]" : "max-w-[1240px]",
				className
			)}
		>
			{children}
		</div>
	);
}

export function PageHeader({
	title,
	description,
	actions,
}: {
	title: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
}) {
	return (
		<div className="flex flex-wrap items-end justify-between gap-4 border-b pb-6">
			<div className="min-w-0">
				<h1 className="font-medium text-3xl tracking-tight">{title}</h1>
				{description ? (
					<p className="mt-1.5 max-w-xl text-muted-foreground text-sm">
						{description}
					</p>
				) : null}
			</div>
			{actions ? (
				<div className="flex items-center gap-2">{actions}</div>
			) : null}
		</div>
	);
}
