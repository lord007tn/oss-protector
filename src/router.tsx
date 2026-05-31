import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import type { RouterContext } from "@/actions/session";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
	const router = createTanStackRouter({
		routeTree,
		// Auth state is resolved server-side in the root route's beforeLoad; this
		// is just the typed default until that runs.
		context: { session: null } satisfies RouterContext,
		scrollRestoration: true,
		defaultPreload: "intent",
		defaultPreloadStaleTime: 0,
	});

	return router;
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
