import { and, desc, eq } from "drizzle-orm";

import { userAllowsNotificationKind } from "@/data-access/user-preferences";
import { database } from "@/db";
import {
	Installation,
	InstallationMaintainer,
	Notification,
} from "@/db/schema";

export interface CreateNotificationInput {
	body?: string | null;
	kind?: string;
	link?: string | null;
	title: string;
	userId: string;
}

async function createNotification(input: CreateNotificationInput) {
	const [row] = await database
		.insert(Notification)
		.values({
			body: input.body ?? null,
			kind: input.kind ?? "info",
			link: input.link ?? null,
			title: input.title,
			userId: input.userId,
		})
		.returning();
	return row;
}

// Fan out a notification to every maintainer linked to a GitHub installation.
// Returns how many users were notified (0 when nobody is linked yet).
export async function notifyInstallationMaintainers({
	installationGithubId,
	body,
	kind,
	link,
	title,
}: {
	installationGithubId?: string | number | null;
} & Omit<CreateNotificationInput, "userId">): Promise<number> {
	if (!installationGithubId) {
		return 0;
	}
	const members = await database
		.select({ userId: InstallationMaintainer.userId })
		.from(InstallationMaintainer)
		.innerJoin(
			Installation,
			eq(Installation.id, InstallationMaintainer.installationId)
		)
		.where(eq(Installation.githubInstallationId, String(installationGithubId)));

	const effectiveKind = kind ?? "info";
	let delivered = 0;
	for (const member of members) {
		const allowed = await userAllowsNotificationKind(
			member.userId,
			effectiveKind
		);
		if (!allowed) {
			continue;
		}
		await createNotification({
			body,
			kind,
			link,
			title,
			userId: member.userId,
		});
		delivered += 1;
	}
	return delivered;
}

export async function listNotifications(userId: string, limit = 30) {
	return await database
		.select()
		.from(Notification)
		.where(eq(Notification.userId, userId))
		.orderBy(desc(Notification.createdAt))
		.limit(limit);
}

export async function unreadNotificationCount(userId: string) {
	const rows = await database
		.select({ id: Notification.id })
		.from(Notification)
		.where(and(eq(Notification.userId, userId), eq(Notification.read, false)));
	return rows.length;
}

export async function markNotificationRead(userId: string, id: string) {
	await database
		.update(Notification)
		.set({ read: true })
		.where(and(eq(Notification.userId, userId), eq(Notification.id, id)));
}

export async function markAllNotificationsRead(userId: string) {
	await database
		.update(Notification)
		.set({ read: true })
		.where(eq(Notification.userId, userId));
}
