import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { getDashboardFn } from "@/functions/dashboard";

const fetchDashboardSchema = z.object({});

export function fetchDashboard() {
	fetchDashboardSchema.parse({});
	return getDashboardFn();
}

export function useDashboard({
	initialData,
}: {
	initialData?: Awaited<ReturnType<typeof getDashboardFn>>;
} = {}) {
	return useQuery({
		initialData,
		queryFn: fetchDashboard,
		queryKey: ["dashboard"],
		staleTime: 30_000,
	});
}
