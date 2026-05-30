import { createAuth, getAuthConfigStatus } from "@/auth";
import { maintainerOwnsRepo } from "@/data-access/repo-decisions";
import {
	clearRepoPolicy,
	getRepoPolicy,
	type RepoPolicyView,
	upsertRepoPolicy,
} from "@/data-access/repo-policy";
import { hasDatabaseBinding } from "@/db";
import type { RuntimeBindings } from "@/env";
import { sanitizeRepositoryPolicyPartial } from "@/helpers/repository-policy";

export type RepoPolicyReadResult =
	| { error: string; ok: false; status: number }
	| { ok: true; policy: RepoPolicyView };

export type RepoPolicyWriteResult =
	| { error: string; ok: false; status: number }
	| { ok: true; policy: RepoPolicyView };

const requireAuthedMaintainer = async ({
	env,
	repositoryId,
	request,
}: {
	env?: RuntimeBindings;
	repositoryId: string;
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
	const owns = await maintainerOwnsRepo({
		repositoryId,
		userId: session.user.id,
	});
	if (!owns) {
		return {
			error: "You don't maintain this repository.",
			ok: false as const,
			status: 403,
		};
	}
	return { ok: true as const, session };
};

export async function getRepoPolicyForMaintainer({
	env,
	repositoryId,
	request,
}: {
	env?: RuntimeBindings;
	repositoryId: string;
	request: Request;
}): Promise<RepoPolicyReadResult> {
	const gate = await requireAuthedMaintainer({ env, repositoryId, request });
	if (!gate.ok) {
		return gate;
	}
	return { ok: true, policy: await getRepoPolicy(repositoryId) };
}

export async function applyRepoPolicy({
	env,
	payload,
	request,
}: {
	env?: RuntimeBindings;
	payload: { policy?: unknown; repositoryId?: unknown };
	request: Request;
}): Promise<RepoPolicyWriteResult> {
	if (typeof payload.repositoryId !== "string") {
		return { error: "Missing repositoryId.", ok: false, status: 400 };
	}
	const gate = await requireAuthedMaintainer({
		env,
		repositoryId: payload.repositoryId,
		request,
	});
	if (!gate.ok) {
		return gate;
	}
	if (!payload.policy || typeof payload.policy !== "object") {
		return { error: "Missing policy.", ok: false, status: 400 };
	}
	const sanitized = sanitizeRepositoryPolicyPartial(
		payload.policy as Record<string, unknown>
	);
	await upsertRepoPolicy({
		policy: sanitized,
		repositoryId: payload.repositoryId,
		updatedByLogin:
			gate.session.user.name?.trim() ||
			gate.session.user.email ||
			"web-maintainer",
		updatedByUserId: gate.session.user.id,
	});
	return { ok: true, policy: await getRepoPolicy(payload.repositoryId) };
}

export async function clearRepoPolicyForMaintainer({
	env,
	payload,
	request,
}: {
	env?: RuntimeBindings;
	payload: { repositoryId?: unknown };
	request: Request;
}): Promise<RepoPolicyWriteResult> {
	if (typeof payload.repositoryId !== "string") {
		return { error: "Missing repositoryId.", ok: false, status: 400 };
	}
	const gate = await requireAuthedMaintainer({
		env,
		repositoryId: payload.repositoryId,
		request,
	});
	if (!gate.ok) {
		return gate;
	}
	await clearRepoPolicy(payload.repositoryId);
	return { ok: true, policy: await getRepoPolicy(payload.repositoryId) };
}
