import { eq } from "drizzle-orm";

import { createAuth, getAuthConfigStatus } from "@/auth";
import {
	allowlistUser,
	dismissReportsForUser,
	resetRiskProfile,
	validateLatestReportForUser,
} from "@/data-access/directory";
import { database, hasDatabaseBinding } from "@/db";
import { GithubUser } from "@/db/schema";
import type { RuntimeBindings } from "@/env";

export const MAINTAINER_DECISIONS = [
	"allow",
	"reset",
	"confirm",
	"dismiss",
] as const;
export type MaintainerDecision = (typeof MAINTAINER_DECISIONS)[number];

export type MaintainerDecisionResult =
	| {
			ok: true;
			decision: MaintainerDecision;
			login: string;
			status: string | null;
			score: number;
	  }
	| { ok: false; status: number; error: string };

const isDecision = (value: unknown): value is MaintainerDecision =>
	MAINTAINER_DECISIONS.includes(value as MaintainerDecision);

// Applies a maintainer correction (allow / reset / confirm / dismiss) to a real
// account from the web. Authoritative authorization happens here, server-side:
// the request must carry a valid better-auth session.
export async function applyMaintainerDecision({
	env,
	request,
	login,
	decision,
}: {
	env?: RuntimeBindings;
	request: Request;
	login: string;
	decision: string;
}): Promise<MaintainerDecisionResult> {
	if (!isDecision(decision)) {
		return { error: "Unknown decision.", ok: false, status: 400 };
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

	const trimmed = login.trim();
	const [user] = await database
		.select()
		.from(GithubUser)
		.where(eq(GithubUser.login, trimmed))
		.limit(1);
	if (!user) {
		return { error: "Account not found.", ok: false, status: 404 };
	}

	const correctedByLogin =
		session.user.name?.trim() || session.user.email || "web-maintainer";
	const input = {
		correctedByLogin,
		pullRequestId: null,
		repositoryId: null,
		// Stable per (actor, decision, target) so the audit signal is traceable.
		sourceUrl: `web:maintainer:${session.user.id}:${decision}:${trimmed}`,
		targetUserId: user.id,
	};

	let profile: { score?: number; status?: string | null } | null = null;
	switch (decision) {
		case "allow":
			profile = (await allowlistUser(input)).profile;
			break;
		case "reset":
			profile = (await resetRiskProfile(input)).profile;
			break;
		case "confirm":
			profile = (await validateLatestReportForUser(input)).profile;
			break;
		default:
			profile = (await dismissReportsForUser(input)).profile;
			break;
	}

	return {
		decision,
		login: trimmed,
		ok: true,
		score: profile?.score ?? 0,
		status: profile?.status ?? null,
	};
}
