import { createAuth, getAuthConfigStatus } from "@/auth";
import {
	clearRepoAccountDecision,
	isRepoDecisionKind,
	listRepoDecisionsForMaintainer,
	maintainerOwnsRepo,
	type RepoDecisionRow,
	upsertRepoAccountDecision,
} from "@/data-access/repo-decisions";
import { hasDatabaseBinding } from "@/db";
import type { RuntimeBindings } from "@/env";

export type RepoDecisionMutationResult =
	| { ok: true; decision: RepoDecisionRow }
	| { error: string; ok: false; status: number };

export type RepoDecisionClearResult =
	| { cleared: boolean; ok: true }
	| { error: string; ok: false; status: number };

export type RepoDecisionListResult =
	| { decisions: RepoDecisionRow[]; ok: true }
	| { error: string; ok: false; status: number };

const requireAuthedMaintainer = async ({
	env,
	request,
}: {
	env?: RuntimeBindings;
	request: Request;
}) => {
	if (!(hasDatabaseBinding && getAuthConfigStatus(env).isConfigured)) {
		return {
			error: "Server is not configured for this action.",
			ok: false as const,
			status: 503,
		};
	}
	const session = await createAuth({ env, request }).api.getSession({
		headers: request.headers,
	});
	if (!session?.user) {
		return { error: "Sign in required.", ok: false as const, status: 401 };
	}
	return { ok: true as const, session };
};

export async function applyRepoDecision({
	env,
	request,
	payload,
}: {
	env?: RuntimeBindings;
	payload: {
		decision?: unknown;
		note?: unknown;
		repositoryId?: unknown;
		targetLogin?: unknown;
	};
	request: Request;
}): Promise<RepoDecisionMutationResult> {
	const gate = await requireAuthedMaintainer({ env, request });
	if (!gate.ok) {
		return gate;
	}
	const { session } = gate;

	if (
		typeof payload.repositoryId !== "string" ||
		!isRepoDecisionKind(payload.decision) ||
		typeof payload.targetLogin !== "string"
	) {
		return { error: "Missing or invalid fields.", ok: false, status: 400 };
	}

	const ownsRepo = await maintainerOwnsRepo({
		repositoryId: payload.repositoryId,
		userId: session.user.id,
	});
	if (!ownsRepo) {
		return {
			error: "You don't maintain this repository.",
			ok: false,
			status: 403,
		};
	}

	const note =
		typeof payload.note === "string" && payload.note.trim()
			? payload.note.trim().slice(0, 280)
			: null;

	return upsertRepoAccountDecision({
		correctedByLogin:
			session.user.name?.trim() || session.user.email || "web-maintainer",
		correctedByUserId: session.user.id,
		decision: payload.decision,
		note,
		repositoryId: payload.repositoryId,
		targetLogin: payload.targetLogin,
	});
}

export async function clearRepoDecision({
	env,
	request,
	payload,
}: {
	env?: RuntimeBindings;
	payload: { repositoryId?: unknown; targetLogin?: unknown };
	request: Request;
}): Promise<RepoDecisionClearResult> {
	const gate = await requireAuthedMaintainer({ env, request });
	if (!gate.ok) {
		return gate;
	}
	const { session } = gate;
	if (
		typeof payload.repositoryId !== "string" ||
		typeof payload.targetLogin !== "string"
	) {
		return { error: "Missing fields.", ok: false, status: 400 };
	}
	const ownsRepo = await maintainerOwnsRepo({
		repositoryId: payload.repositoryId,
		userId: session.user.id,
	});
	if (!ownsRepo) {
		return {
			error: "You don't maintain this repository.",
			ok: false,
			status: 403,
		};
	}
	const result = await clearRepoAccountDecision({
		repositoryId: payload.repositoryId,
		targetLogin: payload.targetLogin,
	});
	return { cleared: result.cleared, ok: true };
}

export async function listMyRepoDecisions({
	env,
	request,
}: {
	env?: RuntimeBindings;
	request: Request;
}): Promise<RepoDecisionListResult> {
	const gate = await requireAuthedMaintainer({ env, request });
	if (!gate.ok) {
		return gate;
	}
	return {
		decisions: await listRepoDecisionsForMaintainer(gate.session.user.id),
		ok: true,
	};
}
