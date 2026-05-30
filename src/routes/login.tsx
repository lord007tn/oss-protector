import { createFileRoute } from "@tanstack/react-router";

import { LoginForm } from "@/components/site/login-form";
import { PageShell } from "@/components/site/page-shell";
import { buildSharedHead } from "@/lib/head";

export const Route = createFileRoute("/login")({
	component: LoginRoute,
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
	validateSearch: (search) => ({
		redirect:
			typeof search.redirect === "string" && search.redirect.startsWith("/")
				? search.redirect
				: undefined,
	}),
});

function LoginRoute() {
	const { redirect } = Route.useSearch();
	return (
		<PageShell footer={false}>
			<div className="flex min-h-[70vh] items-center justify-center px-6 py-16">
				<LoginForm callbackURL={redirect ?? "/dashboard"} />
			</div>
		</PageShell>
	);
}
