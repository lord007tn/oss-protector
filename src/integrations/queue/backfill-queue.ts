import {
	type AccountBackfillMessage,
	type RuntimeBindings,
	runtimeBindings,
} from "@/env";

// Enqueue an account for PR backfill. No-op (returns false) when no queue is
// bound — e.g. local dev or the free Workers tier without Cloudflare Queues —
// so the caller never has to care whether the queue exists.
export const enqueueAccountBackfill = async (
	rawLogin: string
): Promise<boolean> => {
	const login = rawLogin.trim();
	if (!login) {
		return false;
	}
	const queue = (runtimeBindings() as RuntimeBindings).PR_BACKFILL_QUEUE;
	if (!queue) {
		return false;
	}
	try {
		await queue.send({ login } satisfies AccountBackfillMessage);
		return true;
	} catch (caught) {
		console.warn("Failed to enqueue account backfill", login, caught);
		return false;
	}
};
