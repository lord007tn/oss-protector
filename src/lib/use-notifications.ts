import { useCallback, useEffect, useState } from "react";

export interface ClientNotification {
	body: null | string;
	createdAt: number;
	id: string;
	kind: string;
	link: null | string;
	read: boolean;
	title: string;
}

interface NotificationListResponse {
	notifications: ClientNotification[];
	unread: number;
}

// Loads the signed-in user's notifications from the API and exposes optimistic
// mark-read / mark-all-read helpers. Pass `enabled` so the hook stays inert for
// signed-out viewers (the bell isn't rendered for them anyway).
export function useNotifications(enabled: boolean) {
	const [notifications, setNotifications] = useState<ClientNotification[]>([]);
	const [unread, setUnread] = useState(0);

	const refresh = useCallback(async () => {
		if (!enabled) {
			return;
		}
		try {
			const response = await fetch("/api/notifications");
			if (!response.ok) {
				return;
			}
			const data = (await response.json()) as NotificationListResponse;
			setNotifications(data.notifications);
			setUnread(data.unread);
		} catch {
			// Network error — keep the last known state; the next refresh recovers.
		}
	}, [enabled]);

	useEffect(() => {
		if (enabled) {
			refresh();
			return;
		}
		setNotifications([]);
		setUnread(0);
	}, [enabled, refresh]);

	const markRead = useCallback(async (id: string) => {
		setNotifications((prev) =>
			prev.map((item) => (item.id === id ? { ...item, read: true } : item))
		);
		setUnread((prev) => Math.max(0, prev - 1));
		try {
			const response = await fetch("/api/notifications/read", {
				body: JSON.stringify({ id }),
				headers: { "Content-Type": "application/json" },
				method: "POST",
			});
			if (response.ok) {
				const data = (await response.json()) as { unread: number };
				setUnread(data.unread);
			}
		} catch {
			// Optimistic update already applied; a later refresh reconciles.
		}
	}, []);

	const markAllRead = useCallback(async () => {
		setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
		setUnread(0);
		try {
			await fetch("/api/notifications/read-all", { method: "POST" });
		} catch {
			// Optimistic update already applied; a later refresh reconciles.
		}
	}, []);

	return { markAllRead, markRead, notifications, refresh, unread };
}
