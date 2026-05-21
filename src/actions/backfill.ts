import { isNull } from "drizzle-orm";

import {
	recalculateRiskProfile,
	recordDuplicateCampaignSignal,
	upsertGithubUser,
	upsertPullRequest,
	upsertRepository,
} from "@/data-access/directory";
import { database, hasDatabaseBinding } from "@/db";
import { isMissingBindingError } from "@/db/errors";
import { Installation } from "@/db/schema";
import { createInstallationClient } from "@/integrations/github/client";

// Backfill is bounded so a single queue message can't blow past Worker CPU /
// subrequest limits or GitHub's search rate limit.
const MAX_BACKFILL_PRS = 25;
const MAX_BACKFILL_REPOS = 20;

type InstallationClient = NonNullable<
	Awaited<ReturnType<typeof createInstallationClient>>
>;

const firstActiveInstallationId = async (): Promise<null | number> => {
	const [installation] = await database
		.select({ githubInstallationId: Installation.githubInstallationId })
		.from(Installation)
		.where(isNull(Installation.suspendedAt))
		.limit(1);
	if (!installation) {
		return null;
	}
	const id = Number(installation.githubInstallationId);
	return Number.isFinite(id) ? id : null;
};

const REPO_URL_PATTERN = /repos\/([^/]+)\/([^/]+)$/;

const parseRepoUrl = (
	repositoryUrl: string
): null | { name: string; owner: string } => {
	const match = repositoryUrl.match(REPO_URL_PATTERN);
	if (!match) {
		return null;
	}
	return { name: match[2], owner: match[1] };
};

// Resolve the repo to its real GitHub id so the row stays consistent with any
// later webhook upsert (same id → clean conflict). Skips private repos.
const resolveBackfillRepo = async (
	octokit: InstallationClient,
	owner: string,
	name: string
) => {
	try {
		const { data: repo } = await octokit.rest.repos.get({ owner, repo: name });
		if (repo.private) {
			return null;
		}
		return await upsertRepository({
			defaultBranch: repo.default_branch,
			fullName: repo.full_name,
			githubRepositoryId: repo.id,
			htmlUrl: repo.html_url,
			installationGithubId: null,
			isPrivate: repo.private,
			name: repo.name,
			ownerLogin: repo.owner?.login ?? owner,
		});
	} catch (caught) {
		console.warn("Backfill repo resolve failed", `${owner}/${name}`, caught);
		return null;
	}
};

type BackfillRepo = Awaited<ReturnType<typeof resolveBackfillRepo>>;

interface BackfillSearchItem {
	body?: null | string;
	closed_at?: null | string;
	html_url: string;
	id: number;
	number: number;
	repository_url?: string;
	state: string;
	title: string;
}

// Record one searched PR: resolve its repo (cached), upsert the PR, and run
// cross-repo campaign detection. Returns 1 if recorded, 0 if skipped. Extracted
// from the loop to keep runAccountBackfill within the complexity budget.
const backfillSearchItem = async ({
	author,
	item,
	octokit,
	repoCache,
}: {
	author: Awaited<ReturnType<typeof upsertGithubUser>>;
	item: BackfillSearchItem;
	octokit: InstallationClient;
	repoCache: Map<string, BackfillRepo>;
}): Promise<number> => {
	if (!item.repository_url) {
		return 0;
	}
	const parsed = parseRepoUrl(item.repository_url);
	if (!parsed) {
		return 0;
	}
	const fullName = `${parsed.owner}/${parsed.name}`;
	if (!repoCache.has(fullName)) {
		if (repoCache.size >= MAX_BACKFILL_REPOS) {
			return 0;
		}
		repoCache.set(
			fullName,
			await resolveBackfillRepo(octokit, parsed.owner, parsed.name)
		);
	}
	const repository = repoCache.get(fullName);
	if (!repository) {
		return 0;
	}
	const pullRequest = await upsertPullRequest({
		author,
		pullRequest: {
			body: item.body ?? null,
			closedAt: item.closed_at ?? null,
			githubPullRequestId: item.id,
			htmlUrl: item.html_url,
			number: item.number,
			state: item.state,
			title: item.title,
		},
		repository,
	});
	await recordDuplicateCampaignSignal({
		author,
		currentPullRequest: pullRequest,
		repository,
	});
	return 1;
};

// Pull an account's accessible prior PRs (public, via the search API) and record
// them so cross-repo campaign detection and activity reflect their full history.
export const runAccountBackfill = async (
	rawLogin: string
): Promise<{ backfilledPrs: number; login: string }> => {
	const login = rawLogin.trim();
	if (!(login && hasDatabaseBinding)) {
		return { backfilledPrs: 0, login };
	}
	try {
		const installationId = await firstActiveInstallationId();
		const octokit = await createInstallationClient({ installationId });
		if (!octokit) {
			return { backfilledPrs: 0, login };
		}

		const { data: profile } = await octokit.rest.users.getByUsername({
			username: login,
		});
		const author = await upsertGithubUser({
			avatarUrl: profile.avatar_url,
			bio: profile.bio,
			followers: profile.followers,
			following: profile.following,
			githubCreatedAt: profile.created_at
				? Math.floor(Date.parse(profile.created_at) / 1000)
				: null,
			githubUserId: profile.id,
			htmlUrl: profile.html_url,
			lastEnrichedAt: Math.floor(Date.now() / 1000),
			login: profile.login,
			publicRepos: profile.public_repos,
			type: profile.type,
		});

		const search = await octokit.rest.search.issuesAndPullRequests({
			order: "desc",
			per_page: MAX_BACKFILL_PRS,
			q: `type:pr author:${login}`,
			sort: "created",
		});

		const repoCache = new Map<string, BackfillRepo>();
		let backfilledPrs = 0;
		for (const item of search.data.items) {
			if (backfilledPrs >= MAX_BACKFILL_PRS) {
				break;
			}
			backfilledPrs += await backfillSearchItem({
				author,
				item,
				octokit,
				repoCache,
			});
		}

		await recalculateRiskProfile(author.id);
		return { backfilledPrs, login };
	} catch (caught) {
		if (isMissingBindingError(caught)) {
			return { backfilledPrs: 0, login };
		}
		console.warn("Account backfill failed", login, caught);
		return { backfilledPrs: 0, login };
	}
};
