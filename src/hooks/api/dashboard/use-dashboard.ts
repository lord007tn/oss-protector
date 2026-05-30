import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { getDashboardFn } from "@/functions/dashboard";

const getDashboardSchema = z.object({});

export function getDashboard() {
	getDashboardSchema.parse({});
	return getDashboardFn();
}

export function useDashboard({
	initialData,
}: {
	initialData?: Awaited<ReturnType<typeof getDashboardFn>>;
} = {}) {
	return useQuery({
		initialData,
		queryFn: getDashboard,
		queryKey: ["dashboard"],
		staleTime: 30_000,
	});
}
