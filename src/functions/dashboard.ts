import { createServerFn } from "@tanstack/react-start";
import { listDirectoryDashboard } from "@/data-access/directory";

export const getDashboardFn = createServerFn({ method: "GET" }).handler(
	async () => listDirectoryDashboard()
);
