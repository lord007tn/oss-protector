import { useQuery } from "@tanstack/react-query";

import { githubRepoSlug } from "@/components/landing/constants";

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;
const TRAILING_ZERO = /\.0$/;

async function fetchStars(slug: string): Promise<number> {
	const res = await fetch(`https://api.github.com/repos/${slug}`, {
		headers: { Accept: "application/vnd.github+json" },
	});
	if (!res.ok) {
		throw new Error(`GitHub API ${res.status}`);
	}
	const json = (await res.json()) as { stargazers_count?: number };
	return json.stargazers_count ?? 0;
}

export function useGithubStars(slug: string = githubRepoSlug) {
	return useQuery({
		gcTime: ONE_DAY_MS,
		queryFn: () => fetchStars(slug),
		queryKey: ["github-stars", slug],
		refetchOnWindowFocus: false,
		retry: 1,
		staleTime: ONE_HOUR_MS,
	});
}

export function formatStarCount(value: number): string {
	if (value < 1000) {
		return value.toLocaleString();
	}
	if (value < 10_000) {
		return `${(value / 1000).toFixed(1).replace(TRAILING_ZERO, "")}k`;
	}
	if (value < 1_000_000) {
		return `${Math.round(value / 1000)}k`;
	}
	return `${(value / 1_000_000).toFixed(1).replace(TRAILING_ZERO, "")}M`;
}
