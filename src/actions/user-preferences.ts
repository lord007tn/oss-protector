import { createAuth, getAuthConfigStatus } from "@/auth";
import {
	getUserPreferencesView,
	NOTIFICATION_KINDS,
	type NotificationKind,
	type UserPreferencesView,
	updateUserPreferences,
} from "@/data-access/user-preferences";
import { hasDatabaseBinding } from "@/db";
import type { RuntimeBindings } from "@/env";
import { runtimeBindings } from "@/env";

export type UserPreferencesResult =
	| { ok: true; preferences: UserPreferencesView }
	| { ok: false; status: number; error: string };

const KNOWN_KINDS = new Set<string>(NOTIFICATION_KINDS);

const isNotificationKind = (value: string): value is NotificationKind =>
	KNOWN_KINDS.has(value);

const requireMasterSecret = (
	env: RuntimeBindings | undefined
): string | null => {
	const bindings = { ...runtimeBindings(), ...env };
	return bindings.BETTER_AUTH_SECRET?.trim() || null;
};

export async function getCurrentUserPreferences({
	env,
	request,
}: {
	env?: RuntimeBindings;
	request: Request;
}): Promise<UserPreferencesResult> {
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
	const masterSecret = requireMasterSecret(env);
	if (!masterSecret) {
		return {
			error: "Server encryption is not configured.",
			ok: false,
			status: 503,
		};
	}
	return {
		ok: true,
		preferences: await getUserPreferencesView(session.user.id, masterSecret),
	};
}

export interface UpdateUserPreferencesPayload {
	notificationKinds?: unknown;
	// `null` clears the key; `undefined` leaves it; `string` sets it.
	openrouterApiKey?: unknown;
}

const parseKinds = (value: unknown): NotificationKind[] | undefined => {
	// Treat undefined / null / non-array as "leave unchanged". A literal `null`
	// from a malformed client payload used to wipe every kind silently — that
	// was an accidental notification lockout, not a deliberate clear.
	if (value === undefined || value === null || !Array.isArray(value)) {
		return;
	}
	return value
		.filter((entry): entry is string => typeof entry === "string")
		.filter(isNotificationKind);
};

const parseApiKey = (value: unknown): string | null | undefined => {
	if (value === undefined) {
		return;
	}
	if (value === null) {
		return null;
	}
	if (typeof value !== "string") {
		return;
	}
	const trimmed = value.trim();
	return trimmed.length === 0 ? null : trimmed;
};

export async function applyUserPreferencesUpdate({
	env,
	request,
	payload,
}: {
	env?: RuntimeBindings;
	payload: UpdateUserPreferencesPayload;
	request: Request;
}): Promise<UserPreferencesResult> {
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
	const masterSecret = requireMasterSecret(env);
	if (!masterSecret) {
		return {
			error: "Server encryption is not configured.",
			ok: false,
			status: 503,
		};
	}

	const notificationKinds = parseKinds(payload.notificationKinds);
	const openrouterApiKey = parseApiKey(payload.openrouterApiKey);

	const preferences = await updateUserPreferences({
		masterSecret,
		notificationKinds,
		openrouterApiKey,
		userId: session.user.id,
	});
	return { ok: true, preferences };
}

export interface OpenRouterKeyTestResult {
	error?: string;
	models?: number;
	ok: boolean;
	status: number;
}

// Quick "is this key valid" probe. Hits OpenRouter's /key endpoint which is
// cheap and tells us the key works without burning model credit.
export async function testOpenRouterKey({
	apiKey,
}: {
	apiKey: string;
}): Promise<OpenRouterKeyTestResult> {
	const trimmed = apiKey.trim();
	if (!trimmed) {
		return { ok: false, status: 400, error: "Provide an API key." };
	}
	try {
		const response = await fetch("https://openrouter.ai/api/v1/key", {
			headers: {
				Authorization: `Bearer ${trimmed}`,
				"Content-Type": "application/json",
			},
		});
		if (!response.ok) {
			// Map the status to a friendly message instead of leaking OpenRouter's
			// raw JSON error body (e.g. {"error":{"message":"User not found."}})
			// into the maintainer's toast.
			let friendly = `OpenRouter couldn't validate the key (HTTP ${response.status}).`;
			if (response.status === 401 || response.status === 403) {
				friendly =
					"That key was rejected by OpenRouter — check it's valid and active.";
			} else if (response.status === 429) {
				friendly = "OpenRouter rate-limited the check. Try again shortly.";
			}
			return { error: friendly, ok: false, status: response.status };
		}
		// We don't parse the body — just confirm 200. OpenRouter's /key endpoint
		// returns { data: { label, usage, limit, is_free_tier, rate_limit } }.
		return { ok: true, status: 200 };
	} catch (caught) {
		return {
			error:
				caught instanceof Error
					? `Network error: ${caught.message}`
					: "Network error contacting OpenRouter.",
			ok: false,
			status: 502,
		};
	}
}
