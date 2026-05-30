import { desc, eq } from "drizzle-orm";

import { database } from "@/db";
import { Appeal, GithubUser, RiskProfile } from "@/db/schema";
import { unixNow } from "@/lib/time";

// One appeal as the maintainer console shows it: the appellant's statement plus
// the current trust-graph standing of the handle they're appealing for, so a
// reviewer can decide without leaving the page.
export interface AppealReviewItem {
	avatarUrl: null | string;
	createdAt: number;
	email: null | string;
	id: string;
	login: string;
	relationship: string;
	riskScore: null | number;
	riskStatus: null | string;
	status: string;
	story: string;
}

const APPEALS_LIMIT = 50;

export async function listAppealsForReview(
	status = "pending",
	limit = APPEALS_LIMIT
): Promise<AppealReviewItem[]> {
	const rows = await database
		.select({
			avatarUrl: GithubUser.avatarUrl,
			createdAt: Appeal.createdAt,
			email: Appeal.email,
			id: Appeal.id,
			login: Appeal.login,
			relationship: Appeal.relationship,
			riskScore: RiskProfile.score,
			riskStatus: RiskProfile.status,
			status: Appeal.status,
			story: Appeal.story,
		})
		.from(Appeal)
		// The appellant may not exist as a tracked account (wrong handle, never
		// flagged) — left joins keep the appeal visible either way.
		.leftJoin(GithubUser, eq(GithubUser.login, Appeal.login))
		.leftJoin(RiskProfile, eq(RiskProfile.targetUserId, GithubUser.id))
		.where(eq(Appeal.status, status))
		.orderBy(desc(Appeal.createdAt))
		.limit(limit);
	return rows.map((row) => ({
		avatarUrl: row.avatarUrl ?? null,
		createdAt: row.createdAt,
		email: row.email ?? null,
		id: row.id,
		login: row.login,
		relationship: row.relationship,
		riskScore: row.riskScore ?? null,
		riskStatus: row.riskStatus ?? null,
		status: row.status,
		story: row.story,
	}));
}

export async function getAppealById(id: string) {
	const [appeal] = await database
		.select()
		.from(Appeal)
		.where(eq(Appeal.id, id))
		.limit(1);
	return appeal ?? null;
}

export async function findGithubUserIdByLogin(
	login: string
): Promise<null | string> {
	const [user] = await database
		.select({ id: GithubUser.id })
		.from(GithubUser)
		.where(eq(GithubUser.login, login))
		.limit(1);
	return user?.id ?? null;
}

export async function setAppealStatus(id: string, status: string) {
	await database
		.update(Appeal)
		.set({ status, updatedAt: unixNow() })
		.where(eq(Appeal.id, id));
}
