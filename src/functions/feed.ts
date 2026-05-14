import { createServerFn } from "@tanstack/react-start";
import { listPublicFeed } from "@/data-access/guard";

export const getPublicFeedFn = createServerFn({ method: "GET" }).handler(
	async () => listPublicFeed(),
);
