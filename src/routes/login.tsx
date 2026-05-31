import { createFileRoute, redirect } from "@tanstack/react-router";

import { LoginForm } from "@/components/site/login-form";
import { PageShell } from "@/components/site/page-shell";
import { buildSharedHead } from "@/lib/head";

export const Route = createFileRoute("/login")({
	// Explicit param + return types: when a route has both validateSearch and
	// beforeLoad, leaving the search schema to inference can collapse it to `{}`
	// (and break Route.useSearch). Pinning the return type keeps it stable.
	validateSearch: (
		search: Record<string, unknown>
	): { redirect: string | undefined } => ({
		redirect:
			typeof search.redirect === "string" && search.redirect.startsWith("/")
				? search.redirect
				: undefined,
	}),
	// An already-authenticated maintainer has no reason to see the sign-in form;
	// the session is resolved in the root beforeLoad, so we can bounce them to
	// their destination server-side without rendering the form at all. The
	// redirect target is read from the raw query string (not the typed search)
	// to keep this guard independent of the route's search inference.
	beforeLoad: ({ context, location }) => {
		if (context.session) {
			const target = new URLSearchParams(location.searchStr).get("redirect");
			throw redirect({
				href: target?.startsWith("/") ? target : "/dashboard",
			});
		}
	},
	head: () => {
		const shared = buildSharedHead({
			description:
				"Sign in to OSS Protector with GitHub to access your maintainer console — review queue, repo policy editor, and audit log.",
			path: "/login",
			title: "Sign in | OSS Protector",
		});
		return {
			...shared,
			meta: [...shared.meta, { content: "noindex", name: "robots" }],
		};
	},
	component: LoginRoute,
});

function LoginRoute() {
	const { redirect: redirectTo } = Route.useSearch();
	return (
		<PageShell footer={false}>
			<div className="flex min-h-[70vh] items-center justify-center px-6 py-16">
				<LoginForm callbackURL={redirectTo ?? "/dashboard"} />
			</div>
		</PageShell>
	);
}
