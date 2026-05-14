import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { getPublicFeedFn } from "@/functions/feed";

const fetchPublicFeedSchema = z.object({});

export function fetchPublicFeed() {
	fetchPublicFeedSchema.parse({});
	return getPublicFeedFn();
}

export function usePublicFeed({
	initialData,
}: {
	initialData?: Awaited<ReturnType<typeof getPublicFeedFn>>;
} = {}) {
	return useQuery({
		initialData,
		queryFn: fetchPublicFeed,
		queryKey: ["public-feed"],
		staleTime: 30_000,
	});
}
