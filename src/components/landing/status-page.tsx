import {
	AlertTriangle,
	ArrowRight,
	type LucideIcon,
	RefreshCw,
	ShieldQuestion,
} from "lucide-react";
import type { ReactNode } from "react";

import { Footer } from "@/components/landing/footer";
import { SiteHeader } from "@/components/landing/site-header";
import { buttonVariants } from "@/components/ui/button";

interface StatusAction {
	href: string;
	label: string;
	tone?: "ghost" | "outline" | "primary";
}

interface StatusPageProps {
	actions?: StatusAction[];
	children?: ReactNode;
	code?: string;
	description: string;
	footnote?: ReactNode;
	icon?: LucideIcon;
	iconTone?: "destructive" | "muted";
	title: string;
}

const toneVariant = (tone?: StatusAction["tone"]) => {
	if (tone === "ghost") {
		return "ghost" as const;
	}
	if (tone === "primary") {
		return "default" as const;
	}
	return "outline" as const;
};

export function StatusPage({
	actions = [],
	children,
	code,
	description,
	footnote,
	icon: Icon,
	iconTone = "muted",
	title,
}: StatusPageProps) {
	return (
		<main className="flex min-h-screen flex-col bg-background text-foreground">
			<SiteHeader />
			<div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-5 px-4 py-16 text-center md:px-6 md:py-24">
				{Icon ? (
					<span
						aria-hidden
						className={`grid size-12 place-items-center rounded-md border border-muted bg-muted/30 ${
							iconTone === "destructive"
								? "text-destructive"
								: "text-muted-foreground"
						}`}
					>
						<Icon className="size-5" />
					</span>
				) : null}
				{code ? (
					<span className="font-medium font-mono text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
						{code}
					</span>
				) : null}
				<h1 className="text-balance font-semibold text-2xl tracking-tight md:text-[2rem] md:leading-[1.1]">
					{title}
				</h1>
				<p className="max-w-xl text-pretty text-muted-foreground text-sm leading-6 md:text-[15px] md:leading-7">
					{description}
				</p>
				{children}
				{actions.length > 0 ? (
					<div className="mt-1 flex flex-wrap justify-center gap-2">
						{actions.map((action, idx) => (
							<a
								className={buttonVariants({
									size: "sm",
									variant: toneVariant(action.tone),
								})}
								href={action.href}
								key={action.href}
							>
								{action.label}
								{idx === 0 && action.tone !== "ghost" ? (
									<ArrowRight data-icon="inline-end" />
								) : null}
							</a>
						))}
					</div>
				) : null}
				{footnote ? (
					<div className="mt-3 max-w-md text-[12px] text-muted-foreground leading-5">
						{footnote}
					</div>
				) : null}
			</div>
			<Footer />
		</main>
	);
}

// Pre-built variants. Each is a thin wrapper so route files stay terse.

export function NotFoundPage({ pathname }: { pathname?: string }) {
	return (
		<StatusPage
			actions={[
				{ href: "/clankers", label: "Browse clankers", tone: "primary" },
				{ href: "/", label: "Back home", tone: "outline" },
				{ href: "/api-docs", label: "API docs", tone: "ghost" },
			]}
			code="404"
			description="We couldn't find that page. The directory and API endpoints are still right where you left them."
			footnote={
				pathname ? (
					<>
						Requested: <code className="font-mono text-[11px]">{pathname}</code>
					</>
				) : null
			}
			icon={ShieldQuestion}
			title="Page not found."
		/>
	);
}

export function ErrorPage({
	digest,
	onReset,
}: {
	digest?: string;
	onReset?: () => void;
}) {
	return (
		<StatusPage
			actions={[
				{
					href: typeof window === "undefined" ? "/" : window.location.pathname,
					label: "Reload the page",
					tone: "primary",
				},
				{ href: "/", label: "Back home", tone: "outline" },
				{
					href: "https://github.com/lord007tn/oss-protector/issues/new?title=Site%20error",
					label: "Open an issue",
					tone: "ghost",
				},
			]}
			code="500"
			description="OSS Protector hit an unexpected error rendering this page. Webhook ingestion and the public feed are unaffected — try reloading, or open an issue if it persists."
			footnote={
				<>
					{digest ? (
						<>
							Error ref: <code className="font-mono text-[11px]">{digest}</code>
						</>
					) : null}
					{onReset ? (
						<>
							{digest ? " · " : null}
							<button
								className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground"
								onClick={onReset}
								type="button"
							>
								<RefreshCw className="size-3" />
								Reset router state
							</button>
						</>
					) : null}
				</>
			}
			icon={AlertTriangle}
			iconTone="destructive"
			title="Something went wrong."
		/>
	);
}
