import { createServerFn } from "@tanstack/react-start";
import { listGuardDashboard } from "@/data-access/guard";

export const getDashboardFn = createServerFn({ method: "GET" }).handler(
	async () => listGuardDashboard(),
);
