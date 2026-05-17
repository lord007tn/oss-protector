import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const defaultRepoSlug = "lord007tn/oss-protector";
const generatedPath = resolve("src/generated/github-stars.ts");
const numberPattern = /githubStars = (?<value>\d+)/;
const updatedAtPattern = /githubStarsUpdatedAt = "(?<value>[^"]+)"/;
const sourcePattern = /githubStarsSource = "(?<value>[^"]+)"/;
const execFileAsync = promisify(execFile);

interface ExistingGithubStars {
	count: number | null;
	source: null | string;
	updatedAt: null | string;
}

const readExisting = async (): Promise<ExistingGithubStars> => {
	try {
		const source = await readFile(generatedPath, "utf8");
		const countMatch = source.match(numberPattern);
		const updatedAtMatch = source.match(updatedAtPattern);
		const sourceMatch = source.match(sourcePattern);

		return {
			count: countMatch?.groups?.value
				? Number.parseInt(countMatch.groups.value, 10)
				: null,
			source: sourceMatch?.groups?.value ?? null,
			updatedAt: updatedAtMatch?.groups?.value ?? null,
		};
	} catch {
		return {
			count: null,
			source: null,
			updatedAt: null,
		};
	}
};

const parseExplicitStars = (): null | number => {
	const explicitStars = process.env.VITE_GITHUB_STARS?.trim();
	if (!explicitStars) {
		return null;
	}

	const count = Number.parseInt(explicitStars, 10);
	if (!Number.isSafeInteger(count) || count < 0) {
		throw new Error("VITE_GITHUB_STARS must be a non-negative integer.");
	}

	return count;
};

const fetchStars = async (repoSlug: string): Promise<number> => {
	const headers: Record<string, string> = {
		Accept: "application/vnd.github+json",
		"User-Agent": "oss-protector-build",
	};
	const token = process.env.GITHUB_TOKEN?.trim();
	if (token) {
		headers.Authorization = `Bearer ${token}`;
	}

	const response = await fetch(`https://api.github.com/repos/${repoSlug}`, {
		headers,
	});

	if (!response.ok) {
		throw new Error(`GitHub API ${response.status}`);
	}

	const json = (await response.json()) as { stargazers_count?: unknown };
	if (typeof json.stargazers_count !== "number") {
		throw new Error("GitHub API response did not include stargazers_count.");
	}

	return json.stargazers_count;
};

const fetchStarsFromGhCli = async (repoSlug: string): Promise<number> => {
	const { stdout } = await execFileAsync("gh", [
		"repo",
		"view",
		repoSlug,
		"--json",
		"stargazerCount",
		"--jq",
		".stargazerCount",
	]);
	const count = Number.parseInt(stdout.trim(), 10);
	if (!Number.isSafeInteger(count) || count < 0) {
		throw new Error("GitHub CLI did not return a valid stargazerCount.");
	}
	return count;
};

const renderModule = (
	count: number,
	source: string,
	updatedAt: string
): string => `export const githubStars = ${count};
export const githubStarsSource = "${source}";
export const githubStarsUpdatedAt = "${updatedAt}";
`;

const main = async () => {
	const repoSlug = process.env.VITE_GITHUB_REPO_SLUG?.trim() || defaultRepoSlug;
	const source = `https://github.com/${repoSlug}`;
	const existing = await readExisting();
	let count = parseExplicitStars();

	if (count === null) {
		try {
			count = await fetchStars(repoSlug);
		} catch (caught) {
			try {
				count = await fetchStarsFromGhCli(repoSlug);
			} catch {
				if (existing.count === null) {
					throw caught;
				}
				count = existing.count;
				console.warn(
					`Using cached GitHub star count after fetch failed: ${(caught as Error).message}`
				);
			}
		}
	}

	const shouldKeepExistingFile =
		existing.count === count &&
		existing.source === source &&
		existing.updatedAt !== null;
	if (shouldKeepExistingFile) {
		return;
	}

	await mkdir(dirname(generatedPath), { recursive: true });
	await writeFile(
		generatedPath,
		renderModule(count, source, new Date().toISOString()),
		"utf8"
	);
};

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
