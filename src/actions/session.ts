import { createAuth, getAuthConfigStatus } from "@/auth";
import { hasDatabaseBinding } from "@/db";
import type { RuntimeBindings } from "@/env";
import { isPlatformAdmin } from "@/lib/moderation-authz";

export type SessionResolution =
	| { ok: false; status: number; error: string }
	| { ok: true; userId: string };

// The minimal, serializable shape of a signed-in user. Carried in the router
// context (resolved server-side in the root `beforeLoad`) so every route and
// the header render the correct auth state on first paint — no client-side
// "flash of signed-out" before better-auth reports back.
export interface SessionUser {
	email: string;
	id: string;
	image: string | null;
	name: string | null;
	role: string | null;
}

// `isAdmin` is resolved server-side with the same `isPlatformAdmin` logic the
// backend authz uses (admin role OR an ADMIN_EMAILS match), so the header and
// route guards agree with the server and don't depend on the `role` column
// alone propagating through the session.
export type RouterSession = { user: SessionUser; isAdmin: boolean } | null;

// Auth state injected into the TanStack Router context by the root route.
export interface RouterContext {
	session: RouterSession;
}

// Resolve the full signed-in user for the router context. Returns null (rather
// than a typed error) when unauthenticated or unconfigured — beforeLoad turns a
// null session into a redirect where a route requires auth.
export async function getSessionUser({
	env,
	request,
}: {
	env?: RuntimeBindings;
	request: Request;
}): Promise<RouterSession> {
	if (!(hasDatabaseBinding && getAuthConfigStatus(env).isConfigured)) {
		return null;
	}
	const session = await createAuth({ env, request }).api.getSession({
		headers: request.headers,
	});
	if (!session?.user) {
		return null;
	}
	const user = session.user as {
		id: string;
		email: string;
		image?: null | string;
		name?: null | string;
		role?: null | string;
	};
	return {
		isAdmin: isPlatformAdmin(env, user),
		user: {
			email: user.email,
			id: user.id,
			image: user.image ?? null,
			name: user.name ?? null,
			role: user.role ?? null,
		},
	};
}

// Resolve the signed-in user id from the request, or a typed error the route
// handler turns into the right HTTP status. Authorization for session-guarded
// API actions always happens server-side off a real better-auth session.
export async function resolveSessionUserId({
	env,
	request,
}: {
	env?: RuntimeBindings;
	request: Request;
}): Promise<SessionResolution> {
	if (!(hasDatabaseBinding && getAuthConfigStatus(env).isConfigured)) {
		return {
			error: "Server is not configured for this action.",
			ok: false,
			status: 503,
		};
	}
	const session = await createAuth({ env, request }).api.getSession({
		headers: request.headers,
	});
	if (!session?.user) {
		return { error: "Sign in required.", ok: false, status: 401 };
	}
	return { ok: true, userId: session.user.id };
}
