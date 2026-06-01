import { REASON_LABELS, type ReasonCode } from "@/constants/reason-codes";
import { enqueueAccountBackfill } from "@/data-access/backfill-jobs";
import {
	allowlistUser,
	correctionAlreadyApplied,
	createRiskReport,
	dismissReportsForUser,
	getPullRequestByRepositoryNumber,
	markRepositoryInactive,
	recalculateRiskProfile,
	recordAppEvent,
	recordDuplicateCampaignSignal,
	replacePullRequestAiSignal,
	replacePullRequestHeuristicSignal,
	resetRiskProfile,
	upsertGithubUser,
	upsertInstallation,
	upsertPullRequest,
	upsertRepository,
	validateLatestReportForUser,
} from "@/data-access/directory";
import { linkInstallerByGithubId } from "@/data-access/maintainers";
import { notifyInstallationMaintainers } from "@/data-access/notifications";
import { getRepoAccountDecision } from "@/data-access/repo-decisions";
import { getRepoPolicy } from "@/data-access/repo-policy";
import {
	type CorrectionCommand,
	type GithubRepositoryPayload,
	type GithubUserPayload,
	type GithubWebhookPayload,
	type GithubWebhookRequest,
	inferReasonCode,
	isMaintainerAssociation,
	isOwnBotUser,
	type PullRequestFileSummary,
	parseCommand,
	parseCorrectionCommand,
	parseRepositoryFullName,
	verifyGithubSignature,
} from "@/helpers/github-webhook";
import {
	applyRepositoryPolicy,
	parseRepositoryPolicyPartial,
	resolveRepositoryPolicy,
	shouldSkipPullRequestAnalysis,
} from "@/helpers/repository-policy";
import { createInstallationClient } from "@/integrations/github/client";
import {
	type PullRequestAccountInput,
	validatePullRequestWithOpenRouter,
	validateReportWithOpenRouter,
} from "@/integrations/openrouter/validation";
import {
	commitVoiceScore,
	diffSignatureScore,
	prHeuristicSignalWeight,
} from "@/lib/pr-signals";
import { aiPrSignalWeight } from "@/lib/scoring";

const acknowledgeReport = async ({
	confidence,
	installationId,
	reasonCode,
	status,
	targetLogin,
}: {
	confidence: number;
	installationId?: null | number;
	reasonCode: ReasonCode;
	status: "dismissed" | "needs_review" | "pending" | "validated";
	targetLogin: string;
}) => {
	try {
		await notifyInstallationMaintainers({
			body: `${REASON_LABELS[reasonCode]} · ${status} · ${confidence}% confidence`,
			installationGithubId: installationId,
			kind: "report",
			link: `/accounts/${targetLogin}`,
			title: `New report on @${targetLogin}`,
		});
	} catch (caught) {
		console.warn("Failed to notify maintainers of report", caught);
	}
};

const decodeBase64Text = (value: string): string => {
	const compact = value.replace(/\s+/g, "");
	if (typeof atob === "function") {
		return atob(compact);
	}
	return Buffer.from(compact, "base64").toString("utf8");
};

// One authenticated installation client is built per analyzed PR and threaded
// into every fetch below, so we exchange an installation token once instead of
// once per call.
type InstallationClient = Awaited<ReturnType<typeof createInstallationClient>>;

const getCommittedPolicy = async ({
	octokit,
	repositoryFullName,
}: {
	octokit: InstallationClient;
	repositoryFullName: string;
}) => {
	const repository = parseRepositoryFullName(repositoryFullName);
	if (!(repository && octokit)) {
		return {};
	}
	try {
		const response = await octokit.rest.repos.getContent({
			owner: repository.owner,
			path: ".github/oss-protector.json",
			repo: repository.repo,
		});
		const data = response.data;
		if (!("content" in data) || data.type !== "file") {
			return {};
		}
		return parseRepositoryPolicyPartial(decodeBase64Text(data.content));
	} catch (caught) {
		const status =
			typeof caught === "object" && caught !== null && "status" in caught
				? (caught as { status?: unknown }).status
				: null;
		if (status !== 404) {
			// Loud error log instead of warn so a 403/429/5xx from GitHub is
			// visible in `wrangler tail`/observability dashboards. The analyzer
			// continues with DB/default policy (so transient GitHub failures
			// don't block PR review), but the operator can see when a maintainer's
			// committed file is silently being ignored.
			const reason =
				caught instanceof Error ? caught.message.slice(0, 200) : "unknown";
			console.error(
				`repo-policy-fetch failed status=${status ?? "unknown"} repo=${repositoryFullName} reason=${reason}; analyzer falling back to DB/default policy`
			);
		}
		return {};
	}
};

const getEffectiveRepositoryPolicy = async ({
	octokit,
	repositoryFullName,
	repositoryId,
}: {
	octokit: InstallationClient;
	repositoryFullName: string;
	repositoryId?: null | string;
}) => {
	const [filePolicy, dbView] = await Promise.all([
		getCommittedPolicy({ octokit, repositoryFullName }),
		repositoryId
			? getRepoPolicy(repositoryId).catch(() => ({ dbPolicy: {} }))
			: Promise.resolve({ dbPolicy: {} }),
	]);
	const { policy } = resolveRepositoryPolicy({
		dbPolicy: dbView.dbPolicy,
		filePolicy,
	});
	return policy;
};

const MAX_FILES = 40;
const MAX_COMMENTS = 30;
const MAX_COMMITS = 30;
const MAX_COMMENT_LENGTH = 1000;
const MAX_COMMIT_MESSAGE_LENGTH = 500;
const COMMENTS_PER_PAGE = 50;

const listPullRequestFiles = async ({
	octokit,
	pullNumber,
	repositoryFullName,
}: {
	octokit: InstallationClient;
	pullNumber: number;
	repositoryFullName: string;
}): Promise<PullRequestFileSummary[]> => {
	const repository = parseRepositoryFullName(repositoryFullName);
	if (!(repository && octokit)) {
		return [];
	}

	const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
		owner: repository.owner,
		per_page: 100,
		pull_number: pullNumber,
		repo: repository.repo,
	});

	return files.slice(0, MAX_FILES).map((file) => ({
		additions: file.additions,
		changes: file.changes,
		deletions: file.deletions,
		filename: file.filename,
		patch: file.patch?.slice(0, 1800),
		status: file.status,
	}));
};

export interface PullRequestCommentSummary {
	author: string;
	authorAssociation: string;
	body: string;
	isPrAuthor: boolean;
	kind: "issue_comment" | "review_comment";
}

// Pull the PR conversation (issue comments) and inline review-thread comments so
// the analysis can weigh what humans said about the change — e.g. a maintainer
// calling it generated, or the author's own admissions. Our own bot comments are
// filtered out so we never grade our own commentary.
const normalizePullRequestComments = (
	items: Array<{
		author_association?: null | string;
		body?: null | string;
		user?: { id?: number; login?: string } | null;
	}>,
	kind: PullRequestCommentSummary["kind"],
	prAuthorLogin: string
): PullRequestCommentSummary[] =>
	items.flatMap((item) => {
		if (
			!item.body ||
			isOwnBotUser({ id: item.user?.id ?? 0, login: item.user?.login ?? "" })
		) {
			return [];
		}
		const author = item.user?.login ?? "unknown";
		return [
			{
				author,
				authorAssociation: item.author_association ?? "NONE",
				body: item.body.slice(0, MAX_COMMENT_LENGTH),
				isPrAuthor: author.toLowerCase() === prAuthorLogin.toLowerCase(),
				kind,
			},
		];
	});

const listPullRequestComments = async ({
	octokit,
	prAuthorLogin,
	pullNumber,
	repositoryFullName,
}: {
	octokit: InstallationClient;
	prAuthorLogin: string;
	pullNumber: number;
	repositoryFullName: string;
}): Promise<PullRequestCommentSummary[]> => {
	const repository = parseRepositoryFullName(repositoryFullName);
	if (!(repository && octokit)) {
		return [];
	}
	try {
		const [issueComments, reviewComments] = await Promise.all([
			octokit.rest.issues.listComments({
				issue_number: pullNumber,
				owner: repository.owner,
				per_page: COMMENTS_PER_PAGE,
				repo: repository.repo,
			}),
			octokit.rest.pulls.listReviewComments({
				owner: repository.owner,
				per_page: COMMENTS_PER_PAGE,
				pull_number: pullNumber,
				repo: repository.repo,
			}),
		]);
		return [
			...normalizePullRequestComments(
				issueComments.data,
				"issue_comment",
				prAuthorLogin
			),
			...normalizePullRequestComments(
				reviewComments.data,
				"review_comment",
				prAuthorLogin
			),
		].slice(0, MAX_COMMENTS);
	} catch (caught) {
		console.warn("Failed to fetch PR comments", caught);
		return [];
	}
};

const listPullRequestCommits = async ({
	octokit,
	pullNumber,
	repositoryFullName,
}: {
	octokit: InstallationClient;
	pullNumber: number;
	repositoryFullName: string;
}): Promise<string[]> => {
	const repository = parseRepositoryFullName(repositoryFullName);
	if (!(repository && octokit)) {
		return [];
	}
	try {
		const commits = await octokit.rest.pulls.listCommits({
			owner: repository.owner,
			per_page: 100,
			pull_number: pullNumber,
			repo: repository.repo,
		});
		return commits.data.slice(0, MAX_COMMITS).flatMap((entry) => {
			const message = (entry.commit.message ?? "").slice(
				0,
				MAX_COMMIT_MESSAGE_LENGTH
			);
			return message ? [message] : [];
		});
	} catch (caught) {
		console.warn("Failed to fetch PR commits", caught);
		return [];
	}
};

export interface AccountContext {
	bio: null | string;
	followers: number;
	following: number;
	githubCreatedAt: null | number;
	publicRepos: number;
	totalContributions: number;
	totalStars: number;
}

const MAX_REPOS_FOR_STARS = 100;
const ACCOUNT_ENRICHMENT_TTL_SECONDS = 7 * 86_400;

// Sum stargazers across the account's owned (non-fork) repos — a reputation
// signal. Bounded to one page so it stays cheap; most stars sit on top repos.
const getAccountStars = async (
	octokit: NonNullable<InstallationClient>,
	username: string
): Promise<number> => {
	try {
		const repos = await octokit.rest.repos.listForUser({
			per_page: MAX_REPOS_FOR_STARS,
			sort: "pushed",
			type: "owner",
			username,
		});
		return repos.data
			.filter((repo) => !repo.fork)
			.reduce((sum, repo) => sum + (repo.stargazers_count ?? 0), 0);
	} catch (caught) {
		console.warn("Failed to fetch account stars", caught);
		return 0;
	}
};

// Total public PRs the account has authored, via the search API total_count.
const getTotalContributions = async (
	octokit: NonNullable<InstallationClient>,
	login: string
): Promise<number> => {
	try {
		const result = await octokit.rest.search.issuesAndPullRequests({
			per_page: 1,
			q: `type:pr author:${login}`,
		});
		return result.data.total_count ?? 0;
	} catch (caught) {
		console.warn("Failed to fetch contribution count", caught);
		return 0;
	}
};

// Enrich the PR author with account-level signals (age, followers, following,
// stars, contributions, bio). The embedded webhook user object doesn't carry
// these, so we read the user/repos/search APIs. Heavier than a single call, so
// callers gate this behind a staleness check (see ACCOUNT_ENRICHMENT_TTL).
const getAccountContext = async ({
	login,
	octokit,
}: {
	login: string;
	octokit: InstallationClient;
}): Promise<AccountContext | null> => {
	if (!octokit) {
		return null;
	}
	try {
		const { data } = await octokit.rest.users.getByUsername({
			username: login,
		});
		const createdSeconds = data.created_at
			? Math.floor(Date.parse(data.created_at) / 1000)
			: Number.NaN;
		const [totalStars, totalContributions] = await Promise.all([
			getAccountStars(octokit, login),
			getTotalContributions(octokit, login),
		]);
		return {
			bio: data.bio ?? null,
			followers: data.followers ?? 0,
			following: data.following ?? 0,
			githubCreatedAt: Number.isFinite(createdSeconds) ? createdSeconds : null,
			publicRepos: data.public_repos ?? 0,
			totalContributions,
			totalStars,
		};
	} catch (caught) {
		console.warn("Failed to fetch account context", caught);
		return null;
	}
};

// We no longer write anything back to the PR (no comment, no check run).
// When the analysis flags a PR, notify the repo's linked maintainers in-app so
// they can review it from the dashboard instead of seeing a bot comment.
const notifyPullRequestFlag = async ({
	analysis,
	authorLogin,
	installationId,
	issueNumber,
	repositoryFullName,
}: {
	analysis: Awaited<ReturnType<typeof validatePullRequestWithOpenRouter>>;
	authorLogin?: null | string;
	installationId?: null | number;
	issueNumber: number;
	repositoryFullName: string;
}) => {
	if (analysis.verdict !== "likely_abuse" && analysis.verdict !== "unclear") {
		return;
	}
	const handle = authorLogin ?? "unknown";
	try {
		await notifyInstallationMaintainers({
			body: `@${handle} — ${REASON_LABELS[analysis.reasonCode]} · score ${analysis.confidence}/100`,
			installationGithubId: installationId,
			kind: "flag",
			link: `/accounts/${handle}`,
			title: `PR #${issueNumber} flagged in ${repositoryFullName}`,
		});
	} catch (caught) {
		console.warn("Failed to notify maintainers of PR flag", caught);
	}
};

const upsertRepoFromPayload = async (
	repository: GithubRepositoryPayload,
	installationId?: null | number
) =>
	upsertRepository({
		defaultBranch: repository.default_branch,
		fullName: repository.full_name,
		githubRepositoryId: repository.id,
		htmlUrl: repository.html_url,
		installationGithubId: installationId,
		isPrivate: repository.private,
		name: repository.name,
		ownerLogin: repository.owner?.login ?? repository.full_name.split("/")[0],
	});

const upsertInstallationFromPayload = (
	installation: GithubWebhookPayload["installation"],
	installerGithubId?: null | number | string
) => {
	if (!installation?.account) {
		return null;
	}
	return upsertInstallation({
		accountGithubId: installation.account.id,
		accountLogin: installation.account.login,
		accountType: installation.target_type ?? installation.account.type,
		githubInstallationId: installation.id,
		installerGithubId,
		repositorySelection: installation.repository_selection,
		suspendedAt: installation.suspended_at,
	});
};

const handleInstallationRepositories = async (
	payload: GithubWebhookPayload
) => {
	// Persist the installer's GitHub id so a sign-in-later maintainer can still
	// be linked (see backfillMaintainerLinks); only install events carry the
	// real installer as sender.
	await upsertInstallationFromPayload(payload.installation, payload.sender?.id);
	// Best-effort: if the installer has already linked their GitHub account in
	// the app, record them as a maintainer of this installation so the dashboard
	// and notifications are scoped to them. Idempotent on re-delivery.
	await linkInstallerByGithubId({
		githubUserId: payload.sender?.id,
		installationGithubId: payload.installation?.id,
	});
	for (const repository of payload.repositories_added ??
		payload.repositories ??
		[]) {
		await upsertRepoFromPayload(repository, payload.installation?.id);
	}
	for (const repository of payload.repositories_removed ?? []) {
		await markRepositoryInactive(repository.id);
	}
};

const PR_ANALYSIS_ACTIONS = new Set([
	"opened",
	"reopened",
	"ready_for_review",
	"synchronize",
]);

const PR_TRACKING_ACTIONS = new Set([
	...PR_ANALYSIS_ACTIONS,
	"edited",
	"labeled",
	"unlabeled",
	"assigned",
	"unassigned",
]);

// Refresh + persist the author's account signals when stale, and return the
// account context the analysis should use (fresh when we just fetched it,
// otherwise the values already stored on the author row). Kept separate from
// handlePullRequest so the staleness/persist branching stays contained.
const enrichAuthorAccount = async ({
	author,
	octokit,
	user,
}: {
	author: Awaited<ReturnType<typeof upsertGithubUser>>;
	octokit: InstallationClient;
	user: GithubUserPayload;
}): Promise<PullRequestAccountInput> => {
	const stored: PullRequestAccountInput = {
		followers: author.followers,
		githubCreatedAt: author.githubCreatedAt,
		publicRepos: author.publicRepos,
	};
	const nowSeconds = Math.floor(Date.now() / 1000);
	const isStale =
		!author.lastEnrichedAt ||
		nowSeconds - author.lastEnrichedAt > ACCOUNT_ENRICHMENT_TTL_SECONDS;
	const fresh = isStale
		? await getAccountContext({ login: author.login, octokit })
		: null;
	// First time we've ever enriched this account → queue a one-time backfill of
	// their accessible prior PRs (no-op when no queue is bound).
	if (!author.lastEnrichedAt) {
		await enqueueAccountBackfill(author.login);
	}
	if (!fresh) {
		return stored;
	}
	await upsertGithubUser({
		avatarUrl: user.avatar_url,
		bio: fresh.bio,
		followers: fresh.followers,
		following: fresh.following,
		githubCreatedAt: fresh.githubCreatedAt,
		githubUserId: user.id,
		htmlUrl: user.html_url,
		lastEnrichedAt: nowSeconds,
		login: user.login,
		publicRepos: fresh.publicRepos,
		totalContributions: fresh.totalContributions,
		totalStars: fresh.totalStars,
		type: user.type,
	});
	return {
		followers: fresh.followers,
		githubCreatedAt: fresh.githubCreatedAt,
		publicRepos: fresh.publicRepos,
	};
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: webhook entry point fans out into many guarded subcases by design; extracting each branch would obscure the linear pipeline.
const handlePullRequest = async (payload: GithubWebhookPayload) => {
	if (!(payload.repository && payload.pull_request)) {
		return;
	}
	// Skip everything except the actions we actually act on. closed/merged
	// trigger this webhook too and would otherwise cost an OpenRouter call
	// just to record state we already have. Tracking actions still update
	// the PullRequest row but don't re-run the analysis pipeline.
	if (
		!(
			PR_TRACKING_ACTIONS.has(payload.action ?? "") ||
			PR_ANALYSIS_ACTIONS.has(payload.action ?? "")
		)
	) {
		return;
	}
	await upsertInstallationFromPayload(payload.installation);
	// The repo upsert may reference the installation (FK), so it stays after the
	// installation write. The PR author is an independent entity, so upsert it in
	// parallel with the repo to save a round trip on the webhook hot path.
	const [repository, author] = await Promise.all([
		upsertRepoFromPayload(payload.repository, payload.installation?.id),
		upsertGithubUser({
			avatarUrl: payload.pull_request.user.avatar_url,
			githubUserId: payload.pull_request.user.id,
			htmlUrl: payload.pull_request.user.html_url,
			login: payload.pull_request.user.login,
			type: payload.pull_request.user.type,
		}),
	]);
	const pullRequestRecord = await upsertPullRequest({
		author,
		pullRequest: {
			additions: payload.pull_request.additions,
			baseRef: payload.pull_request.base?.ref,
			body: payload.pull_request.body,
			changedFiles: payload.pull_request.changed_files,
			closedAt: payload.pull_request.closed_at,
			commitCount: payload.pull_request.commits,
			deletions: payload.pull_request.deletions,
			githubPullRequestId: payload.pull_request.id,
			headSha: payload.pull_request.head?.sha,
			htmlUrl: payload.pull_request.html_url,
			mergedAt: payload.pull_request.merged_at,
			number: payload.pull_request.number,
			state: payload.pull_request.state,
			title: payload.pull_request.title,
		},
		repository,
	});

	if (PR_ANALYSIS_ACTIONS.has(payload.action ?? "")) {
		// Repo-insider PRs aren't the abuse vector this tool is designed for.
		// An OWNER/MEMBER/COLLABORATOR opening a PR on a repo they have
		// write access to is a normal workflow — we'd just be flagging
		// commit-hygiene smells (like accidentally committing .env) as if
		// they were external attacks. Skip the AI pipeline entirely; still
		// upserted the PR row above so we have the audit trail.
		const authorAssociation = payload.pull_request.author_association ?? "NONE";
		if (isMaintainerAssociation(authorAssociation)) {
			console.log(
				`pr-analysis: skipped, author_association=${authorAssociation} pr=${payload.repository.full_name}#${payload.pull_request.number}`
			);
			return;
		}
		if (author.isKnownGithubBot) {
			console.log(
				`pr-analysis: skipped known bot author=${author.login} pr=${payload.repository.full_name}#${payload.pull_request.number}`
			);
			return;
		}

		// One installation token, threaded into every read below.
		const octokit = await createInstallationClient({
			installationId: payload.installation?.id,
		});
		const [files, policy] = await Promise.all([
			listPullRequestFiles({
				octokit,
				pullNumber: payload.pull_request.number,
				repositoryFullName: payload.repository.full_name,
			}),
			getEffectiveRepositoryPolicy({
				octokit,
				repositoryFullName: payload.repository.full_name,
				repositoryId: repository.id,
			}),
		]);
		if (
			shouldSkipPullRequestAnalysis({
				authorLogin: author.login,
				filenames: files.map((file) => file.filename),
				policy,
				repositoryIsPrivate: repository.isPrivate,
			})
		) {
			console.log(
				`pr-analysis: skipped by repo policy pr=${payload.repository.full_name}#${payload.pull_request.number}`
			);
			return;
		}
		// Only fetched once the PR passed the policy gate, so a skipped PR costs
		// no extra API calls. Read the conversation, commit messages, and author
		// account context to feed the analysis.
		// Account enrichment hits the user/repos/search APIs, so only refresh it
		// when this author's signals are missing or stale — not on every PR.
		const [comments, commitMessages, analysisAccount] = await Promise.all([
			listPullRequestComments({
				octokit,
				prAuthorLogin: author.login,
				pullNumber: payload.pull_request.number,
				repositoryFullName: payload.repository.full_name,
			}),
			listPullRequestCommits({
				octokit,
				pullNumber: payload.pull_request.number,
				repositoryFullName: payload.repository.full_name,
			}),
			enrichAuthorAccount({
				author,
				octokit,
				user: payload.pull_request.user,
			}),
		]);
		await recordDuplicateCampaignSignal({
			author,
			currentPullRequest: pullRequestRecord,
			repository,
		});

		// Repo-local override applies before the (expensive) AI call. A local
		// "allow" short-circuits the entire review path for this PR on this repo
		// — no AI cost, no flag, no notification. A local "block" synthesizes a
		// flag with maximum confidence so the maintainer's intent is recorded
		// even when the AI couldn't have inferred it.
		const localDecision = await getRepoAccountDecision({
			repositoryId: repository.id,
			targetUserId: author.id,
		});
		if (localDecision === "allow") {
			console.log(
				`pr-analysis: skipped by repo-local allow author=${author.login} pr=${payload.repository.full_name}#${payload.pull_request.number}`
			);
			return;
		}

		const analysis =
			localDecision === "block"
				? {
						causes: ["Manually blocked for this repo by a maintainer."],
						confidence: 95,
						evidenceSummary: `Repo-local block for @${author.login} on ${payload.repository.full_name}.`,
						rationale:
							"This account is on the repo-local block list. No AI review was performed; the maintainer's decision is authoritative for this repository.",
						reasonCode: "maintainer_report" as const,
						scoreBreakdown: {
							aiQuality: 0,
							contributionValue: 0,
							credentialRisk: 0,
							farmingRisk: 0,
							maliciousRisk: 0,
							novelty: 0,
						},
						verdict: "likely_abuse" as const,
					}
				: applyRepositoryPolicy(
						await validatePullRequestWithOpenRouter(
							{
								account: analysisAccount,
								body: payload.pull_request.body,
								comments,
								commitMessages,
								files,
								targetLogin: author.login,
								title: payload.pull_request.title,
								url: payload.pull_request.html_url,
							},
							{ installationGithubId: payload.installation?.id }
						),
						policy
					);
		await notifyPullRequestFlag({
			analysis,
			authorLogin: author.login,
			installationId: payload.installation?.id,
			issueNumber: payload.pull_request.number,
			repositoryFullName: payload.repository.full_name,
		});
		const aiSignalWeight =
			analysis.verdict === "likely_abuse"
				? aiPrSignalWeight(analysis.confidence)
				: 0;
		// Replace any prior ai_pr_review signal on this same PR. Without this
		// dedupe, repeated synchronizes on a single PR stack the score (we
		// caught nassimna at score=100 from 6 signals on one PR).
		await replacePullRequestAiSignal({
			aiSignalWeight,
			analysis,
			analyzedContext: {
				account: analysisAccount,
				comments,
				commitMessages,
				files: files.map((file) => ({
					additions: file.additions,
					deletions: file.deletions,
					filename: file.filename,
					status: file.status,
				})),
			},
			pullRequestId: pullRequestRecord.id,
			pullRequestUrl: payload.pull_request.html_url,
			repositoryId: repository.id,
			targetUserId: author.id,
		});
		// Deterministic per-PR heuristics, recorded alongside the LLM signal so
		// both feed the score (LLM on top of the deterministic core).
		const diffSignature = diffSignatureScore(files);
		const commitVoice = commitVoiceScore(commitMessages);
		await replacePullRequestHeuristicSignal({
			commitVoice,
			diffSignature,
			pullRequestId: pullRequestRecord.id,
			pullRequestUrl: payload.pull_request.html_url,
			repositoryId: repository.id,
			targetUserId: author.id,
			weight: prHeuristicSignalWeight(diffSignature, commitVoice),
		});
		await recalculateRiskProfile(author.id);
	}
};

const CORRECTION_TITLES: Record<CorrectionCommand["kind"], string> = {
	allow: "Added to allowlist",
	confirm: "Report confirmed",
	dismiss: "Report dismissed",
	reset: "Risk profile reset",
};

// Instead of replying on the PR thread, record the maintainer's decision as an
// in-app notification so the rest of the team sees the change from the dashboard.
const notifyMaintainerCorrection = async ({
	command,
	correctedByLogin,
	installationId,
	kind,
	targetLogin,
}: {
	command: string;
	correctedByLogin: string;
	installationId?: null | number;
	kind: CorrectionCommand["kind"];
	targetLogin: string;
}) => {
	try {
		await notifyInstallationMaintainers({
			body: `@${correctedByLogin} ran "${command}" on @${targetLogin}`,
			installationGithubId: installationId,
			kind: "correction",
			link: `/accounts/${targetLogin}`,
			title: CORRECTION_TITLES[kind],
		});
	} catch (caught) {
		console.warn("Failed to notify maintainers of correction", caught);
	}
};

const handleMaintainerCorrection = async ({
	correction,
	installationId,
	pullRequestId,
	repositoryId,
	reporterLogin,
	sourceUrl,
	targetLogin,
	targetUserId,
}: {
	correction: CorrectionCommand;
	installationId?: null | number;
	pullRequestId?: null | string;
	repositoryId?: null | string;
	reporterLogin: string;
	sourceUrl: string;
	targetLogin: string;
	targetUserId: string;
}) => {
	const correctionInput = {
		correctedByLogin: reporterLogin,
		pullRequestId,
		repositoryId,
		sourceUrl,
		targetUserId,
	};

	// Idempotency guard: if GitHub re-delivers this webhook, the correction signal
	// will already exist for (sourceUrl, kind). Skip re-applying so we don't
	// re-promote a different report on confirm or stack negative weight on dismiss.
	const alreadyApplied = await correctionAlreadyApplied({
		kind: correction.kind,
		sourceUrl,
	});
	if (alreadyApplied) {
		return;
	}

	if (correction.kind === "dismiss") {
		await dismissReportsForUser(correctionInput);
	} else if (correction.kind === "confirm") {
		await validateLatestReportForUser(correctionInput);
	} else if (correction.kind === "reset") {
		await resetRiskProfile(correctionInput);
	} else {
		await allowlistUser(correctionInput);
	}

	await notifyMaintainerCorrection({
		command: correction.command,
		correctedByLogin: reporterLogin,
		installationId,
		kind: correction.kind,
		targetLogin,
	});
};

const upsertTargetUser = (user: GithubUserPayload) =>
	upsertGithubUser({
		avatarUrl: user.avatar_url,
		githubUserId: user.id,
		htmlUrl: user.html_url,
		login: user.login,
		type: user.type,
	});

const writeIssueCommentReport = async ({
	command,
	payload,
	pullRequest,
	repository,
	reporterAssociation,
	reporterIsMaintainer,
	targetUser,
}: {
	command: string;
	payload: GithubWebhookPayload;
	pullRequest: Awaited<
		ReturnType<typeof getPullRequestByRepositoryNumber>
	> | null;
	repository: { id: string };
	reporterAssociation: string;
	reporterIsMaintainer: boolean;
	targetUser: { id: string; login: string };
}) => {
	if (!(payload.repository && payload.issue && payload.comment?.user)) {
		return;
	}
	const reasonCode = inferReasonCode(command);
	const validation = await validateReportWithOpenRouter(
		{
			commandText: command,
			pullRequest: {
				body: pullRequest?.body ?? null,
				title: pullRequest?.title ?? payload.issue.title ?? null,
				url:
					pullRequest?.htmlUrl ?? payload.issue.pull_request?.html_url ?? null,
			},
			reasonText: command,
			reporterAssociation,
			reporterIsMaintainer,
			targetLogin: targetUser.login,
		},
		{ installationGithubId: payload.installation?.id }
	);

	await createRiskReport({
		aiRationale: validation.rationale,
		aiVerdict: validation.verdict,
		commandText: command,
		commentId: payload.comment.id,
		confidence: validation.confidence,
		evidence: [
			{
				type: "github_issue_comment",
				url: payload.comment.html_url ?? payload.issue.html_url,
			},
			{
				causes: validation.causes ?? [],
				evidenceSummary: validation.evidenceSummary,
				scoreBreakdown: validation.scoreBreakdown,
				type: "validation_causes",
			},
			{
				type: "github_pull_request",
				url: pullRequest?.htmlUrl ?? payload.issue.pull_request?.html_url,
			},
		],
		issueNumber: payload.issue.number,
		pullRequestId: pullRequest?.id ?? null,
		rawPayload: payload,
		reasonCode,
		reasonText: command,
		reporterAssociation,
		reporterGithubId: payload.comment.user.id,
		reporterIsMaintainer,
		reporterLogin: payload.comment.user.login,
		repositoryId: repository.id,
		sourceUrl: payload.comment.html_url ?? payload.issue.html_url ?? "",
		status: validation.status,
		targetUserId: targetUser.id,
	});
	await acknowledgeReport({
		confidence: validation.confidence,
		installationId: payload.installation?.id,
		reasonCode,
		status: validation.status,
		targetLogin: targetUser.login,
	});
};

const handleIssueComment = async (payload: GithubWebhookPayload) => {
	if (
		payload.action !== "created" ||
		!payload.comment?.body ||
		!payload.issue?.pull_request ||
		!(payload.repository && payload.issue.user && payload.comment.user) ||
		isOwnBotUser(payload.comment.user)
	) {
		return;
	}

	const correction = parseCorrectionCommand(payload.comment.body);
	const command = correction ? null : parseCommand(payload.comment.body);
	if (!(correction || command)) {
		return;
	}

	await upsertInstallationFromPayload(payload.installation);
	const repository = await upsertRepoFromPayload(
		payload.repository,
		payload.installation?.id
	);
	const targetUser = await upsertTargetUser(payload.issue.user);
	const pullRequest = payload.issue.number
		? await getPullRequestByRepositoryNumber(
				repository.id,
				payload.issue.number
			)
		: null;
	const reporterAssociation = payload.comment.author_association ?? "NONE";
	const reporterIsMaintainer = isMaintainerAssociation(reporterAssociation);

	if (correction) {
		if (!reporterIsMaintainer) {
			return;
		}
		await handleMaintainerCorrection({
			correction,
			installationId: payload.installation?.id,
			pullRequestId: pullRequest?.id ?? null,
			repositoryId: repository.id,
			reporterLogin: payload.comment.user.login,
			sourceUrl: payload.comment.html_url ?? payload.issue.html_url ?? "",
			targetLogin: targetUser.login,
			targetUserId: targetUser.id,
		});
		return;
	}

	if (!command) {
		return;
	}
	await writeIssueCommentReport({
		command,
		payload,
		pullRequest,
		repository,
		reporterAssociation,
		reporterIsMaintainer,
		targetUser,
	});
};

const ensurePullRequestForReviewComment = async ({
	payload,
	repository,
	targetUser,
}: {
	payload: GithubWebhookPayload;
	repository: Awaited<ReturnType<typeof upsertRepoFromPayload>>;
	targetUser: Awaited<ReturnType<typeof upsertTargetUser>>;
}) => {
	if (!payload.pull_request) {
		throw new Error("pull_request payload required");
	}
	const existing = await getPullRequestByRepositoryNumber(
		repository.id,
		payload.pull_request.number
	);
	if (existing) {
		return existing;
	}
	return upsertPullRequest({
		author: targetUser,
		pullRequest: {
			additions: payload.pull_request.additions,
			baseRef: payload.pull_request.base?.ref,
			body: payload.pull_request.body,
			changedFiles: payload.pull_request.changed_files,
			closedAt: payload.pull_request.closed_at,
			commitCount: payload.pull_request.commits,
			deletions: payload.pull_request.deletions,
			githubPullRequestId: payload.pull_request.id,
			headSha: payload.pull_request.head?.sha,
			htmlUrl: payload.pull_request.html_url,
			mergedAt: payload.pull_request.merged_at,
			number: payload.pull_request.number,
			state: payload.pull_request.state,
			title: payload.pull_request.title,
		},
		repository,
	});
};

const writeReviewCommentReport = async ({
	command,
	payload,
	pullRequest,
	repository,
	reporterAssociation,
	reporterIsMaintainer,
	targetUser,
}: {
	command: string;
	payload: GithubWebhookPayload;
	pullRequest: Awaited<ReturnType<typeof ensurePullRequestForReviewComment>>;
	repository: { id: string };
	reporterAssociation: string;
	reporterIsMaintainer: boolean;
	targetUser: { id: string; login: string };
}) => {
	if (!(payload.repository && payload.pull_request && payload.comment?.user)) {
		return;
	}
	const reasonCode = inferReasonCode(command);
	const validation = await validateReportWithOpenRouter(
		{
			commandText: command,
			pullRequest: {
				body: payload.pull_request.body,
				title: payload.pull_request.title,
				url: payload.pull_request.html_url,
			},
			reasonText: command,
			reporterAssociation,
			reporterIsMaintainer,
			targetLogin: targetUser.login,
		},
		{ installationGithubId: payload.installation?.id }
	);

	await createRiskReport({
		aiRationale: validation.rationale,
		aiVerdict: validation.verdict,
		commandText: command,
		commentId: payload.comment.id,
		confidence: validation.confidence,
		evidence: [
			{
				type: "github_pull_request_review_comment",
				url: payload.comment.html_url ?? payload.pull_request.html_url,
			},
			{
				causes: validation.causes ?? [],
				evidenceSummary: validation.evidenceSummary,
				scoreBreakdown: validation.scoreBreakdown,
				type: "validation_causes",
			},
			{ type: "github_pull_request", url: payload.pull_request.html_url },
		],
		issueNumber: payload.pull_request.number,
		pullRequestId: pullRequest.id,
		rawPayload: payload,
		reasonCode,
		reasonText: command,
		reporterAssociation,
		reporterGithubId: payload.comment.user.id,
		reporterIsMaintainer,
		reporterLogin: payload.comment.user.login,
		repositoryId: repository.id,
		sourceUrl: payload.comment.html_url ?? payload.pull_request.html_url,
		status: validation.status,
		targetUserId: targetUser.id,
	});
	await acknowledgeReport({
		confidence: validation.confidence,
		installationId: payload.installation?.id,
		reasonCode,
		status: validation.status,
		targetLogin: targetUser.login,
	});
};

const handlePullRequestReviewComment = async (
	payload: GithubWebhookPayload
) => {
	if (
		payload.action !== "created" ||
		!payload.comment?.body ||
		!(payload.repository && payload.pull_request && payload.comment.user) ||
		isOwnBotUser(payload.comment.user)
	) {
		return;
	}

	const correction = parseCorrectionCommand(payload.comment.body);
	const command = correction ? null : parseCommand(payload.comment.body);
	if (!(correction || command)) {
		return;
	}

	await upsertInstallationFromPayload(payload.installation);
	const repository = await upsertRepoFromPayload(
		payload.repository,
		payload.installation?.id
	);
	const targetUser = await upsertTargetUser(payload.pull_request.user);
	const pullRequest = await ensurePullRequestForReviewComment({
		payload,
		repository,
		targetUser,
	});
	const reporterAssociation = payload.comment.author_association ?? "NONE";
	const reporterIsMaintainer = isMaintainerAssociation(reporterAssociation);

	if (correction) {
		if (!reporterIsMaintainer) {
			return;
		}
		await handleMaintainerCorrection({
			correction,
			installationId: payload.installation?.id,
			pullRequestId: pullRequest.id,
			repositoryId: repository.id,
			reporterLogin: payload.comment.user.login,
			sourceUrl: payload.comment.html_url ?? payload.pull_request.html_url,
			targetLogin: targetUser.login,
			targetUserId: targetUser.id,
		});
		return;
	}

	if (!command) {
		return;
	}
	await writeReviewCommentReport({
		command,
		payload,
		pullRequest,
		repository,
		reporterAssociation,
		reporterIsMaintainer,
		targetUser,
	});
};

export const handleGithubWebhook = async ({
	body,
	deliveryId,
	eventName,
	skipSignatureVerification,
	signature,
}: GithubWebhookRequest) => {
	const verified =
		skipSignatureVerification ||
		(await verifyGithubSignature({ body, signature }));
	if (!verified) {
		return new Response("Invalid GitHub webhook signature", { status: 401 });
	}

	const payload = JSON.parse(body) as GithubWebhookPayload;
	const eventStart = Date.now();
	// Record the event up-front with status=pending. If Cloudflare cancels the
	// waitUntil() task before the heavy processing finishes, we still have an
	// audit row instead of a silently-dropped webhook.
	await recordAppEvent({
		action: payload.action,
		actorLogin: payload.sender?.login,
		deliveryId,
		eventName,
		installationGithubId: payload.installation?.id,
		rawPayload: payload,
		repositoryFullName: payload.repository?.full_name,
		status: "pending",
	});
	try {
		if (
			eventName === "installation" ||
			eventName === "installation_repositories"
		) {
			await handleInstallationRepositories(payload);
		}
		if (eventName === "pull_request") {
			await handlePullRequest(payload);
		}
		if (eventName === "issue_comment") {
			await handleIssueComment(payload);
		}
		if (eventName === "pull_request_review_comment") {
			await handlePullRequestReviewComment(payload);
		}

		console.log(
			`webhook: event=${eventName} action=${payload.action ?? "_"} elapsed_ms=${
				Date.now() - eventStart
			} status=processed`
		);
		await recordAppEvent({
			action: payload.action,
			actorLogin: payload.sender?.login,
			deliveryId,
			eventName,
			installationGithubId: payload.installation?.id,
			rawPayload: payload,
			repositoryFullName: payload.repository?.full_name,
			status: "processed",
		});
		return Response.json({ ok: true });
	} catch (caught) {
		console.warn(
			`webhook: event=${eventName} action=${payload.action ?? "_"} elapsed_ms=${
				Date.now() - eventStart
			} status=failed`,
			caught
		);
		await recordAppEvent({
			action: payload.action,
			actorLogin: payload.sender?.login,
			deliveryId,
			error: caught instanceof Error ? caught.message : "Unknown webhook error",
			eventName,
			installationGithubId: payload.installation?.id,
			rawPayload: payload,
			repositoryFullName: payload.repository?.full_name,
			status: "failed",
		});
		throw caught;
	}
};
