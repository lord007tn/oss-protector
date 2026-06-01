import { useQuery } from "@tanstack/react-query";
import type { MaintainerDashboard } from "@/data-access/maintainer-dashboard";

interface DashboardResponse {
	dashboard?: MaintainerDashboard;
	error?: string;
}

// Loads the signed-in maintainer's console data from the API. Exposes a refresh
// the queue actions call after a Confirm/Dismiss/Allow so the view reflects the
// new server state.
export function useMaintainerDashboard(enabled: boolean) {
	const query = useQuery({
		enabled,
		queryFn: async (): Promise<MaintainerDashboard | null> => {
			const response = await fetch("/api/dashboard");
			const data = (await response.json()) as DashboardResponse;
			if (!response.ok) {
				throw new Error(data.error ?? "Failed to load dashboard.");
			}
			return data.dashboard ?? null;
		},
		queryKey: ["maintainer-dashboard"],
		staleTime: 30_000,
	});

	return {
		dashboard: query.data ?? null,
		error: query.error ? query.error.message : null,
		loading: query.isPending,
		refresh: query.refetch,
	};
}
