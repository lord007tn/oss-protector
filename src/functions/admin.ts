import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { count, eq } from "drizzle-orm";
import { getSessionUser } from "@/actions/session";
import { d1, database, hasDatabaseBinding } from "@/db";
import {
	Appeal,
	BackfillJob,
	BotReport,
	GithubUser,
	Installation,
	PullRequest,
	Repository,
	RiskProfile,
} from "@/db/schema";

export interface AdminOverview {
	admins: number;
	installations: number;
	pendingAppeals: number;
	pendingBackfills: number;
	pullRequests: number;
	reports: number;
	repositories: number;
	riskProfiles: number;
	trackedAccounts: number;
	users: number;
}

// Throws if the request isn't from a signed-in platform admin. The server
// function layer turns the throw into a 401/403 for the client.
async function requireAdmin(request: Request): Promise<void> {
	const session = await getSessionUser({ request });
	if (session?.user.role !== "admin") {
		throw new Error("Admin access required.");
	}
}

export const getAdminOverviewFn = createServerFn({ method: "GET" }).handler(
	async (): Promise<AdminOverview | null> => {
		const request = getRequest();
		await requireAdmin(request);
		if (!hasDatabaseBinding) {
			return null;
		}

		// Better Auth `user` table lives outside the Drizzle schema — count it on
		// the raw D1 handle, in one round trip.
		const userRow = await d1
			.prepare(
				"SELECT (SELECT COUNT(*) FROM user) AS total, (SELECT COUNT(*) FROM user WHERE role = 'admin') AS admins"
			)
			.first<{ total: number; admins: number }>();

		const counts = await Promise.all([
			database.select({ value: count() }).from(GithubUser),
			database.select({ value: count() }).from(RiskProfile),
			database.select({ value: count() }).from(BotReport),
			database.select({ value: count() }).from(Installation),
			database.select({ value: count() }).from(Repository),
			database.select({ value: count() }).from(PullRequest),
			database
				.select({ value: count() })
				.from(Appeal)
				.where(eq(Appeal.status, "pending")),
			database
				.select({ value: count() })
				.from(BackfillJob)
				.where(eq(BackfillJob.status, "pending")),
		]);
		const at = (index: number): number => counts[index]?.[0]?.value ?? 0;

		return {
			admins: userRow?.admins ?? 0,
			installations: at(3),
			pendingAppeals: at(6),
			pendingBackfills: at(7),
			pullRequests: at(5),
			reports: at(2),
			repositories: at(4),
			riskProfiles: at(1),
			trackedAccounts: at(0),
			users: userRow?.total ?? 0,
		};
	}
);
