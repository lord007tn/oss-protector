import { useRouteContext } from "@tanstack/react-router";

// Reads the session that the root route resolved server-side (see
// `getSessionFn` + the root `beforeLoad`). Because it comes from router context
// rather than a post-hydration fetch, the signed-in state is correct on the
// first paint — no flash of the public/sign-in UI on protected pages.
export function useSessionState() {
	const session = useRouteContext({
		from: "__root__",
		select: (context) => context.session,
	});
	return {
		isPending: false,
		session,
		signedIn: Boolean(session?.user),
	};
}
