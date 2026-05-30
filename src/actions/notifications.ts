import { resolveSessionUserId } from "@/actions/session";
import {
	listNotifications,
	markAllNotificationsRead,
	markNotificationRead,
	unreadNotificationCount,
} from "@/data-access/notifications";
import type { RuntimeBindings } from "@/env";

export interface NotificationView {
	body: null | string;
	createdAt: number;
	id: string;
	kind: string;
	link: null | string;
	read: boolean;
	title: string;
}

export type NotificationListResult =
	| { ok: false; status: number; error: string }
	| { ok: true; notifications: NotificationView[]; unread: number };

export type NotificationMutationResult =
	| { ok: false; status: number; error: string }
	| { ok: true; unread: number };

export async function listNotificationsForRequest({
	env,
	request,
}: {
	env?: RuntimeBindings;
	request: Request;
}): Promise<NotificationListResult> {
	const resolved = await resolveSessionUserId({ env, request });
	if (!resolved.ok) {
		return resolved;
	}
	const rows = await listNotifications(resolved.userId);
	const unread = rows.reduce((count, row) => count + (row.read ? 0 : 1), 0);
	return {
		notifications: rows.map((row) => ({
			body: row.body,
			createdAt: row.createdAt,
			id: row.id,
			kind: row.kind,
			link: row.link,
			read: row.read,
			title: row.title,
		})),
		ok: true,
		unread,
	};
}

export async function markNotificationReadForRequest({
	env,
	id,
	request,
}: {
	env?: RuntimeBindings;
	id: string;
	request: Request;
}): Promise<NotificationMutationResult> {
	const resolved = await resolveSessionUserId({ env, request });
	if (!resolved.ok) {
		return resolved;
	}
	await markNotificationRead(resolved.userId, id);
	return { ok: true, unread: await unreadNotificationCount(resolved.userId) };
}

export async function markAllNotificationsReadForRequest({
	env,
	request,
}: {
	env?: RuntimeBindings;
	request: Request;
}): Promise<NotificationMutationResult> {
	const resolved = await resolveSessionUserId({ env, request });
	if (!resolved.ok) {
		return resolved;
	}
	await markAllNotificationsRead(resolved.userId);
	return { ok: true, unread: 0 };
}
