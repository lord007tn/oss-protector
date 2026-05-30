import { useCallback, useEffect, useState } from "react";
import type { MaintainerDashboard } from "@/data-access/maintainer-dashboard";

interface DashboardResponse {
	dashboard?: MaintainerDashboard;
	error?: string;
}

// Loads the signed-in maintainer's console data from the API. Exposes a refresh
// the queue actions call after a Confirm/Dismiss/Allow so the view reflects the
// new server state.
export function useMaintainerDashboard(enabled: boolean) {
	const [dashboard, setDashboard] = useState<MaintainerDashboard | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<null | string>(null);

	const refresh = useCallback(async () => {
		if (!enabled) {
			return;
		}
		try {
			const response = await fetch("/api/dashboard");
			const data = (await response.json()) as DashboardResponse;
			if (!response.ok) {
				setError(data.error ?? "Failed to load dashboard.");
				return;
			}
			setDashboard(data.dashboard ?? null);
			setError(null);
		} catch {
			setError("Network error — try again.");
		} finally {
			setLoading(false);
		}
	}, [enabled]);

	useEffect(() => {
		if (enabled) {
			refresh();
		}
	}, [enabled, refresh]);

	return { dashboard, error, loading, refresh };
}
