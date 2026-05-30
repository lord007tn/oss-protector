import { and, eq } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

import { database } from "@/db";
import { Installation, InstallationMaintainer } from "@/db/schema";

// better-auth owns the `account` table (one row per linked OAuth identity). It
// is not part of appSchema, so we describe only the columns we read here to map
// a GitHub identity back to a better-auth user.
const AuthAccount = sqliteTable("account", {
	accountId: text("accountId").notNull(),
	id: text("id").primaryKey(),
	providerId: text("providerId").notNull(),
	userId: text("userId").notNull(),
});

async function linkMaintainer({
	installationId,
	role,
	userId,
}: {
	installationId: string;
	role?: string;
	userId: string;
}) {
	await database
		.insert(InstallationMaintainer)
		.values({ installationId, role: role ?? "maintainer", userId })
		.onConflictDoNothing();
}

// On install, map the installer's GitHub identity to a better-auth user (only
// possible if they've signed in with GitHub in the app) and record the
// membership so their dashboard + notifications are scoped to this install.
// No-op when we can't resolve the installation or the user yet.
export async function linkInstallerByGithubId({
	githubUserId,
	installationGithubId,
}: {
	githubUserId?: null | number | string;
	installationGithubId?: null | number | string;
}): Promise<boolean> {
	if (!(githubUserId && installationGithubId)) {
		return false;
	}
	const [installation] = await database
		.select({ id: Installation.id })
		.from(Installation)
		.where(eq(Installation.githubInstallationId, String(installationGithubId)))
		.limit(1);
	if (!installation) {
		return false;
	}
	const [account] = await database
		.select({ userId: AuthAccount.userId })
		.from(AuthAccount)
		.where(
			and(
				eq(AuthAccount.providerId, "github"),
				eq(AuthAccount.accountId, String(githubUserId))
			)
		)
		.limit(1);
	if (!account) {
		return false;
	}
	await linkMaintainer({
		installationId: installation.id,
		userId: account.userId,
	});
	return true;
}

export async function listMaintainerInstallationIds(userId: string) {
	const rows = await database
		.select({ installationId: InstallationMaintainer.installationId })
		.from(InstallationMaintainer)
		.where(eq(InstallationMaintainer.userId, userId));
	return rows.map((row) => row.installationId);
}

// Links a signed-in user to any installation they installed *before* signing in.
// The install webhook can only link installers who already had a GitHub-linked
// account; this covers the install-first / sign-in-later path by matching the
// user's GitHub identity against the installerGithubId we now persist on each
// installation. Idempotent. Returns how many installations matched.
export async function backfillMaintainerLinks(userId: string): Promise<number> {
	const [account] = await database
		.select({ accountId: AuthAccount.accountId })
		.from(AuthAccount)
		.where(
			and(eq(AuthAccount.userId, userId), eq(AuthAccount.providerId, "github"))
		)
		.limit(1);
	if (!account) {
		return 0;
	}
	const installations = await database
		.select({ id: Installation.id })
		.from(Installation)
		.where(eq(Installation.installerGithubId, account.accountId));
	for (const installation of installations) {
		await linkMaintainer({ installationId: installation.id, userId });
	}
	return installations.length;
}
