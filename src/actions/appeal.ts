import { createId } from "@paralleldrive/cuid2";

import { createAuth, getAuthConfigStatus } from "@/auth";
import {
	findGithubUserIdByLogin,
	getAppealById,
	setAppealStatus,
} from "@/data-access/appeals";
import { allowlistUser } from "@/data-access/directory";
import { database, hasDatabaseBinding } from "@/db";
import { Appeal } from "@/db/schema";
import type { RuntimeBindings } from "@/env";
import { appealOutcome, isAppealResolution } from "@/lib/appeals";

const LEADING_AT = /^@/;
const MIN_STORY_LENGTH = 60;
// Mirror of the client-side check in routes/appeal.tsx so a malformed email
// can't slip through a direct POST to /api/appeal.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SubmitAppealInput {
	email?: string | null;
	evidence?: string[];
	login: string;
	relationship?: string;
	story: string;
}

export type SubmitAppealResult =
	| { ok: true; status: number; id: string; trackingId: string }
	| { ok: false; status: number; error: string };

// Persists a flagged account's appeal. Open to anyone (the appellant may not
// have an account); when a session is present we attach the user id for audit.
export async function submitAppeal({
	env,
	request,
	input,
}: {
	env?: RuntimeBindings;
	request: Request;
	input: SubmitAppealInput;
}): Promise<SubmitAppealResult> {
	if (!hasDatabaseBinding) {
		return { error: "Database is not configured.", ok: false, status: 503 };
	}
	const login = (input.login ?? "").trim().replace(LEADING_AT, "");
	const story = (input.story ?? "").trim();
	if (login.length < 2) {
		return {
			error: "Provide the flagged account handle.",
			ok: false,
			status: 400,
		};
	}
	if (story.length < MIN_STORY_LENGTH) {
		return {
			error: `Tell us more — at least ${MIN_STORY_LENGTH} characters.`,
			ok: false,
			status: 400,
		};
	}
	const email = (input.email ?? "").trim();
	if (email && !EMAIL_PATTERN.test(email)) {
		return {
			error: "Enter a valid email so we can send the verdict.",
			ok: false,
			status: 400,
		};
	}

	let submittedByUserId: string | null = null;
	if (getAuthConfigStatus(env).isConfigured) {
		const session = await createAuth({ env, request }).api.getSession({
			headers: request.headers,
		});
		submittedByUserId = session?.user?.id ?? null;
	}

	const id = createId();
	await database.insert(Appeal).values({
		email: email || null,
		evidenceJson: JSON.stringify(input.evidence ?? []),
		id,
		login,
		relationship: input.relationship === "rep" ? "rep" : "self",
		status: "pending",
		story,
		submittedByUserId,
	});

	return {
		id,
		ok: true,
		status: 200,
		trackingId: `APP-${id.slice(0, 8).toUpperCase()}`,
	};
}

export type ResolveAppealResult =
	| { ok: true; id: string; status: string }
	| { ok: false; status: number; error: string };

// Closes the loop on a pending appeal. Authorization is server-side off a real
// session, matching applyMaintainerDecision. The uphold/reject semantics live in
// appealOutcome so the action and its tests share one source of truth.
export async function resolveAppeal({
	env,
	request,
	id,
	resolution,
}: {
	env?: RuntimeBindings;
	request: Request;
	id: string;
	resolution: string;
}): Promise<ResolveAppealResult> {
	if (!isAppealResolution(resolution)) {
		return { error: "Unknown resolution.", ok: false, status: 400 };
	}
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

	const appeal = await getAppealById(id);
	if (!appeal) {
		return { error: "Appeal not found.", ok: false, status: 404 };
	}

	const outcome = appealOutcome(resolution);

	if (outcome.allowlist) {
		const targetUserId = await findGithubUserIdByLogin(appeal.login);
		// No tracked account for this handle → nothing to clear, just record the
		// decision so the appeal leaves the queue.
		if (targetUserId) {
			await allowlistUser({
				correctedByLogin:
					session.user.name?.trim() || session.user.email || "appeal-review",
				pullRequestId: null,
				repositoryId: null,
				sourceUrl: `web:appeal:${session.user.id}:${appeal.id}`,
				targetUserId,
			});
		}
	}

	await setAppealStatus(id, outcome.status);
	return { id, ok: true, status: outcome.status };
}
