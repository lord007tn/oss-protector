import { asc, eq } from "drizzle-orm";

import { database, hasDatabaseBinding } from "@/db";
import { BackfillJob } from "@/db/schema";
import { unixNow } from "@/lib/time";

// After this many failed attempts a job is parked as "failed" so a permanently
// broken login (deleted account, etc.) can't be retried forever.
const MAX_ATTEMPTS = 3;

export interface PendingBackfillJob {
	attempts: number;
	id: string;
	login: string;
}

// Enqueue an account for a one-time PR backfill. Idempotent: `login` is unique,
// so re-enqueueing an account that already has a job is a no-op. No-op (returns
// false) when the database isn't bound, so callers never have to care.
export const enqueueAccountBackfill = async (
	rawLogin: string
): Promise<boolean> => {
	const login = rawLogin.trim();
	if (!(login && hasDatabaseBinding)) {
		return false;
	}
	try {
		await database
			.insert(BackfillJob)
			.values({ login, status: "pending" })
			.onConflictDoNothing();
		return true;
	} catch (caught) {
		console.warn("Failed to enqueue account backfill", login, caught);
		return false;
	}
};

// Oldest-first batch of pending jobs for the cron drain to process.
export const claimPendingBackfillJobs = async (
	limit: number
): Promise<PendingBackfillJob[]> =>
	await database
		.select({
			attempts: BackfillJob.attempts,
			id: BackfillJob.id,
			login: BackfillJob.login,
		})
		.from(BackfillJob)
		.where(eq(BackfillJob.status, "pending"))
		.orderBy(asc(BackfillJob.createdAt))
		.limit(limit);

export const markBackfillJobDone = async (id: string): Promise<void> => {
	await database
		.update(BackfillJob)
		.set({ status: "done", updatedAt: unixNow() })
		.where(eq(BackfillJob.id, id));
};

// Leave the job pending (so the next tick retries it) until MAX_ATTEMPTS, then
// park it as failed.
export const markBackfillJobFailed = async (
	id: string,
	attempts: number,
	error: string
): Promise<void> => {
	const nextAttempts = attempts + 1;
	await database
		.update(BackfillJob)
		.set({
			attempts: nextAttempts,
			lastError: error.slice(0, 500),
			status: nextAttempts >= MAX_ATTEMPTS ? "failed" : "pending",
			updatedAt: unixNow(),
		})
		.where(eq(BackfillJob.id, id));
};
