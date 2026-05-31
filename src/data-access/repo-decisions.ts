import { and, desc, eq, inArray } from "drizzle-orm";

import { database } from "@/db";
import {
	BotReport,
	BotSignal,
	GithubUser,
	InstallationMaintainer,
	PullRequest,
	RepoAccountDecision,
	Repository,
} from "@/db/schema";

export const REPO_DECISION_KINDS = ["allow", "block"] as const;
export type RepoDecisionKind = (typeof REPO_DECISION_KINDS)[number];

const LEADING_AT = /^@/;

export const isRepoDecisionKind = (value: unknown): value is RepoDecisionKind =>
	typeof value === "string" &&
	(REPO_DECISION_KINDS as readonly string[]).includes(value);

export interface RepoDecisionRow {
	avatarUrl: null | string;
	correctedByLogin: string;
	createdAt: number;
	decision: RepoDecisionKind;
	id: string;
	login: string;
	note: null | string;
	repoFullName: string;
	repositoryId: string;
	targetUserId: string;
	updatedAt: number;
}

// Returns the maintainer's repos so the UI can offer the right "apply override"
// scope. Authorization gate for every repo-decision mutation lives here too.
export async function listMaintainerRepoIds(userId: string): Promise<string[]> {
	const rows = await database
		.select({ id: Repository.id })
		.from(Repository)
		.innerJoin(
			InstallationMaintainer,
			eq(InstallationMaintainer.installationId, Repository.installationId)
		)
		.where(
			and(
				eq(InstallationMaintainer.userId, userId),
				eq(Repository.isActive, true)
			)
		);
	return rows.map((row) => row.id);
}

export async function maintainerOwnsRepo({
	repositoryId,
	userId,
}: {
	repositoryId: string;
	userId: string;
}): Promise<boolean> {
	const repos = await listMaintainerRepoIds(userId);
	return repos.includes(repositoryId);
}

// Repo-scoped moderation gate: true when the target account has any activity (a
// report, PR, or signal) in a repository the user maintains. This is the
// authorization boundary for the site-wide maintainer decisions and appeal
// resolutions, mirroring the per-repo maintainerOwnsRepo check.
export async function maintainerSharesRepoWithAccount({
	targetUserId,
	userId,
}: {
	targetUserId: string;
	userId: string;
}): Promise<boolean> {
	const repoIds = await listMaintainerRepoIds(userId);
	if (repoIds.length === 0) {
		return false;
	}
	const [report] = await database
		.select({ id: BotReport.id })
		.from(BotReport)
		.where(
			and(
				eq(BotReport.targetUserId, targetUserId),
				inArray(BotReport.repositoryId, repoIds)
			)
		)
		.limit(1);
	if (report) {
		return true;
	}
	const [pr] = await database
		.select({ id: PullRequest.id })
		.from(PullRequest)
		.where(
			and(
				eq(PullRequest.authorUserId, targetUserId),
				inArray(PullRequest.repositoryId, repoIds)
			)
		)
		.limit(1);
	if (pr) {
		return true;
	}
	const [signal] = await database
		.select({ id: BotSignal.id })
		.from(BotSignal)
		.where(
			and(
				eq(BotSignal.targetUserId, targetUserId),
				inArray(BotSignal.repositoryId, repoIds)
			)
		)
		.limit(1);
	return Boolean(signal);
}

export interface UpsertRepoDecisionInput {
	correctedByLogin: string;
	correctedByUserId: string;
	decision: RepoDecisionKind;
	note?: null | string;
	repositoryId: string;
	targetLogin: string;
}

export type UpsertRepoDecisionResult =
	| { ok: true; decision: RepoDecisionRow }
	| { error: string; ok: false; status: number };

export async function upsertRepoAccountDecision(
	input: UpsertRepoDecisionInput
): Promise<UpsertRepoDecisionResult> {
	const trimmedLogin = input.targetLogin.trim().replace(LEADING_AT, "");
	if (!trimmedLogin) {
		return {
			error: "Provide a target account handle.",
			ok: false,
			status: 400,
		};
	}
	const [user] = await database
		.select({
			avatarUrl: GithubUser.avatarUrl,
			id: GithubUser.id,
			login: GithubUser.login,
		})
		.from(GithubUser)
		.where(eq(GithubUser.login, trimmedLogin))
		.limit(1);
	if (!user) {
		return {
			error: "Account isn't tracked yet — no PR activity from this user.",
			ok: false,
			status: 404,
		};
	}
	const [repository] = await database
		.select({ fullName: Repository.fullName, id: Repository.id })
		.from(Repository)
		.where(eq(Repository.id, input.repositoryId))
		.limit(1);
	if (!repository) {
		return { error: "Repository not found.", ok: false, status: 404 };
	}

	const now = Math.floor(Date.now() / 1000);
	const values = {
		correctedByLogin: input.correctedByLogin,
		correctedByUserId: input.correctedByUserId,
		decision: input.decision,
		note: input.note ?? null,
		repositoryId: repository.id,
		targetUserId: user.id,
		updatedAt: now,
	};

	const [existing] = await database
		.select({
			id: RepoAccountDecision.id,
			createdAt: RepoAccountDecision.createdAt,
		})
		.from(RepoAccountDecision)
		.where(
			and(
				eq(RepoAccountDecision.repositoryId, repository.id),
				eq(RepoAccountDecision.targetUserId, user.id)
			)
		)
		.limit(1);

	let id: string;
	let createdAt: number;
	if (existing) {
		await database
			.update(RepoAccountDecision)
			.set(values)
			.where(eq(RepoAccountDecision.id, existing.id));
		id = existing.id;
		createdAt = existing.createdAt;
	} else {
		const [inserted] = await database
			.insert(RepoAccountDecision)
			.values(values)
			.returning({
				id: RepoAccountDecision.id,
				createdAt: RepoAccountDecision.createdAt,
			});
		id = inserted.id;
		createdAt = inserted.createdAt;
	}

	return {
		decision: {
			avatarUrl: user.avatarUrl,
			correctedByLogin: input.correctedByLogin,
			createdAt,
			decision: input.decision,
			id,
			login: user.login,
			note: input.note ?? null,
			repoFullName: repository.fullName,
			repositoryId: repository.id,
			targetUserId: user.id,
			updatedAt: now,
		},
		ok: true,
	};
}

export async function clearRepoAccountDecision({
	repositoryId,
	targetLogin,
}: {
	repositoryId: string;
	targetLogin: string;
}): Promise<{ cleared: boolean }> {
	const login = targetLogin.trim().replace(LEADING_AT, "");
	const [user] = await database
		.select({ id: GithubUser.id })
		.from(GithubUser)
		.where(eq(GithubUser.login, login))
		.limit(1);
	if (!user) {
		return { cleared: false };
	}
	const deleted = await database
		.delete(RepoAccountDecision)
		.where(
			and(
				eq(RepoAccountDecision.repositoryId, repositoryId),
				eq(RepoAccountDecision.targetUserId, user.id)
			)
		)
		.returning({ id: RepoAccountDecision.id });
	return { cleared: deleted.length > 0 };
}

export async function listRepoDecisionsForMaintainer(
	userId: string
): Promise<RepoDecisionRow[]> {
	const repoIds = await listMaintainerRepoIds(userId);
	if (repoIds.length === 0) {
		return [];
	}
	const rows = await database
		.select({
			avatarUrl: GithubUser.avatarUrl,
			correctedByLogin: RepoAccountDecision.correctedByLogin,
			createdAt: RepoAccountDecision.createdAt,
			decision: RepoAccountDecision.decision,
			id: RepoAccountDecision.id,
			login: GithubUser.login,
			note: RepoAccountDecision.note,
			repoFullName: Repository.fullName,
			repositoryId: Repository.id,
			targetUserId: RepoAccountDecision.targetUserId,
			updatedAt: RepoAccountDecision.updatedAt,
		})
		.from(RepoAccountDecision)
		.innerJoin(Repository, eq(Repository.id, RepoAccountDecision.repositoryId))
		.innerJoin(GithubUser, eq(GithubUser.id, RepoAccountDecision.targetUserId))
		.where(inArray(RepoAccountDecision.repositoryId, repoIds))
		.orderBy(desc(RepoAccountDecision.updatedAt));
	return rows.map((row) => ({
		avatarUrl: row.avatarUrl,
		correctedByLogin: row.correctedByLogin,
		createdAt: row.createdAt,
		decision: row.decision as RepoDecisionKind,
		id: row.id,
		login: row.login,
		note: row.note,
		repoFullName: row.repoFullName,
		repositoryId: row.repositoryId,
		targetUserId: row.targetUserId,
		updatedAt: row.updatedAt,
	}));
}

// Used by the PR analyzer to check if any local override applies for a given
// (repo, target) pair. Returns null when no override is set.
export async function getRepoAccountDecision({
	repositoryId,
	targetUserId,
}: {
	repositoryId: string;
	targetUserId: string;
}): Promise<RepoDecisionKind | null> {
	const [row] = await database
		.select({ decision: RepoAccountDecision.decision })
		.from(RepoAccountDecision)
		.where(
			and(
				eq(RepoAccountDecision.repositoryId, repositoryId),
				eq(RepoAccountDecision.targetUserId, targetUserId)
			)
		)
		.limit(1);
	if (!row) {
		return null;
	}
	return isRepoDecisionKind(row.decision) ? row.decision : null;
}

// For the audit-log timeline: pull the maintainer's repos' decisions ordered
// by updatedAt, cap at limit. Already structured to merge with the existing
// activity stream in maintainer-dashboard.ts.
export async function listRepoDecisionAuditRows(
	userId: string,
	limit = 30
): Promise<RepoDecisionRow[]> {
	const rows = await listRepoDecisionsForMaintainer(userId);
	return rows.slice(0, limit);
}
