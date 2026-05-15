import { createServerFn } from "@tanstack/react-start";
import { listDirectoryDashboard } from "@/actions/directory";

export const getDashboardFn = createServerFn({ method: "GET" }).handler(
	async () => listDirectoryDashboard()
);
