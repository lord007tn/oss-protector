import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

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

const NOTIFICATIONS_KEY = ["notifications"] as const;
const EMPTY: NotificationListResponse = { notifications: [], unread: 0 };

// Loads the signed-in user's notifications from the API and exposes optimistic
// mark-read / mark-all-read helpers. Pass `enabled` so the hook stays inert for
// signed-out viewers (the bell isn't rendered for them anyway).
export function useNotifications(enabled: boolean) {
	const queryClient = useQueryClient();
	const query = useQuery({
		enabled,
		queryFn: async (): Promise<NotificationListResponse> => {
			const response = await fetch("/api/notifications");
			if (!response.ok) {
				throw new Error("Failed to load notifications.");
			}
			return (await response.json()) as NotificationListResponse;
		},
		queryKey: NOTIFICATIONS_KEY,
		staleTime: 30_000,
	});

	const data = query.data ?? EMPTY;

	const markRead = useCallback(
		async (id: string) => {
			queryClient.setQueryData<NotificationListResponse>(
				NOTIFICATIONS_KEY,
				(prev) =>
					prev
						? {
								notifications: prev.notifications.map((item) =>
									item.id === id ? { ...item, read: true } : item
								),
								unread: Math.max(0, prev.unread - 1),
							}
						: prev
			);
			try {
				const response = await fetch("/api/notifications/read", {
					body: JSON.stringify({ id }),
					headers: { "Content-Type": "application/json" },
					method: "POST",
				});
				if (response.ok) {
					const result = (await response.json()) as { unread: number };
					queryClient.setQueryData<NotificationListResponse>(
						NOTIFICATIONS_KEY,
						(prev) => (prev ? { ...prev, unread: result.unread } : prev)
					);
				}
			} catch {
				// Optimistic update already applied; a later refresh reconciles.
			}
		},
		[queryClient]
	);

	const markAllRead = useCallback(async () => {
		queryClient.setQueryData<NotificationListResponse>(
			NOTIFICATIONS_KEY,
			(prev) =>
				prev
					? {
							notifications: prev.notifications.map((item) => ({
								...item,
								read: true,
							})),
							unread: 0,
						}
					: prev
		);
		try {
			await fetch("/api/notifications/read-all", { method: "POST" });
		} catch {
			// Optimistic update already applied; a later refresh reconciles.
		}
	}, [queryClient]);

	return {
		markAllRead,
		markRead,
		notifications: data.notifications,
		refresh: query.refetch,
		unread: data.unread,
	};
}
