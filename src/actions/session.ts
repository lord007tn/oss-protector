import { createAuth, getAuthConfigStatus } from "@/auth";
import { hasDatabaseBinding } from "@/db";
import type { RuntimeBindings } from "@/env";

export type SessionResolution =
	| { ok: false; status: number; error: string }
	| { ok: true; userId: string };

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
