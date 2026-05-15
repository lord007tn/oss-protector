import { createServerFn } from "@tanstack/react-start";
import { listPublicFeed } from "@/data-access/directory";

export const getPublicFeedFn = createServerFn({ method: "GET" }).handler(
	async () => listPublicFeed()
);
