import { createServerFn } from "@tanstack/react-start";
import { listPublicFeed } from "@/actions/directory";

export const getPublicFeedFn = createServerFn({ method: "GET" }).handler(
	async () => listPublicFeed()
);
