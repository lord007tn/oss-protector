import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getSessionUser } from "@/actions/session";

// Resolves the signed-in user from the request cookies, server-side. Called in
// the root route's `beforeLoad`, so the session is known before the page renders
// on both SSR and client navigations — protected routes redirect instead of
// flashing a sign-in form.
export const getSessionFn = createServerFn({ method: "GET" }).handler(() =>
	getSessionUser({ request: getRequest() })
);
