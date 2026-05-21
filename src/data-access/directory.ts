import {
	and,
	count,
	countDistinct,
	desc,
	eq,
	gte,
	inArray,
	isNull,
	max,
	or,
	sql,
} from "drizzle-orm";

import type { ReasonCode } from "@/constants/reason-codes";
import type { ReportStatus } from "@/constants/report-statuses";
import type { RiskStatus } from "@/constants/risk-statuses";
import { riskStatusForScore } from "@/constants/risk-statuses";
import { database } from "@/db";
import {
	AppEvent,
	BotReport,
	BotSignal,
	GithubUser,
	type GithubUserSelect,
	Installation,
	PullRequest,
	type PullRequestSelect,
	Repository,
	type RepositorySelect,
	RiskProfile,
	SourceImport,
} from "@/db/schema";
import {
	bioMatchesBotPattern,
	handleEntropyIsSuspicious,
	handleMatchesBotPattern,
} from "@/lib/account-heuristics";
import { composeProfileScore } from "@/lib/scoring";
import { toUnixSeconds, unixNow } from "@/lib/time";

export interface GithubAccountInput {
	avatarUrl?: null | string;
	bio?: null | string;
	followers?: null | number;
	following?: null | number;
	githubCreatedAt?: null | number;
	githubUserId: number | string;
	htmlUrl?: null | string;
	lastEnrichedAt?: null | number;
	login: string;
	publicRepos?: null | number;
	totalContributions?: null | number;
	totalStars?: null | number;
	type?: null | string;
}

export interface GithubRepositoryInput {
	defaultBranch?: null | string;
	fullName: string;
	githubRepositoryId: number | string;
	htmlUrl?: null | string;
	installationGithubId?: null | number | string;
	isPrivate?: boolean;
	name: string;
	ownerLogin: string;
}

export interface GithubInstallationInput {
	accountGithubId?: null | number | string;
	accountLogin: string;
	accountType?: null | string;
	githubInstallationId: number | string;
	// Only set on install events (payload.sender.id). Left undefined on the
	// PR/comment-driven upserts so we never overwrite the real installer with a
	// passing actor's id.
	installerGithubId?: null | number | string;
	repositorySelection?: null | string;
	suspendedAt?: null | string;
}

export interface GithubPullRequestInput {
	additions?: null | number;
	baseRef?: null | string;
	body?: null | string;
	changedFiles?: null | number;
	closedAt?: null | string;
	commitCount?: null | number;
	deletions?: null | number;
	githubPullRequestId: number | string;
	headSha?: null | string;
	htmlUrl: string;
	mergedAt?: null | string;
	number: number;
	state: string;
	title: string;
}

export interface CreateRiskReportInput {
	aiRationale?: null | string;
	aiVerdict?: null | string;
	commandText: string;
	commentId?: null | number | string;
	confidence: number;
	evidence: unknown[];
	issueNumber?: null | number;
	pullRequestId?: null | string;
	rawPayload?: unknown;
	reasonCode: ReasonCode;
	reasonText?: null | string;
	reporterAssociation: string;
	reporterGithubId?: null | number | string;
	reporterIsMaintainer: boolean;
	reporterLogin: string;
	repositoryId?: null | string;
	sourceUrl: string;
	status: ReportStatus;
	targetUserId: string;
}

const boundedConfidence = (value: number) =>
	Math.max(0, Math.min(100, Math.round(value)));

const asTextId = (value: number | string) => String(value);

const json = (value: unknown) => JSON.stringify(value);

// Webhook/report payloads are stored for the audit ledger. Cap the size so a
// pathological payload can't blow past D1's row limits; oversized payloads keep
// a truncated preview plus the original byte count.
const MAX_RAW_PAYLOAD_BYTES = 200_000;
const serializeRawPayload = (value: unknown): null | string => {
	if (value === undefined || value === null) {
		return null;
	}
	try {
		const text = JSON.stringify(value);
		if (text.length > MAX_RAW_PAYLOAD_BYTES) {
			return JSON.stringify({
				bytes: text.length,
				preview: text.slice(0, MAX_RAW_PAYLOAD_BYTES),
				truncated: true,
			});
		}
		return text;
	} catch {
		return null;
	}
};

const DUPLICATE_CAMPAIGN_WINDOW_SECONDS = 90 * 86_400;
const DUPLICATE_CAMPAIGN_MIN_PRS = 3;
const DUPLICATE_CAMPAIGN_MIN_REPOSITORIES = 2;

const COMMON_TITLE_WORDS = new Set([
	"a",
	"add",
	"and",
	"chore",
	"docs",
	"fix",
	"for",
	"in",
	"of",
	"readme",
	"the",
	"to",
	"update",
]);

const normalizeCampaignTitle = (title: string) =>
	title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.split(" ")
		.filter((word) => word.length > 2 && !COMMON_TITLE_WORDS.has(word))
		.slice(0, 8)
		.join(" ");

// Fields written identically on both the insert and the conflict-update path.
// Extracted so upsertGithubUser doesn't duplicate the isKnownGithubBot/default
// logic (and stays under the cognitive-complexity budget).
const githubUserScalars = (input: GithubAccountInput) => ({
	accountType: input.type ?? "User",
	avatarUrl: input.avatarUrl ?? null,
	htmlUrl: input.htmlUrl ?? `https://github.com/${input.login}`,
	isKnownGithubBot:
		(input.type ?? "").toLowerCase() === "bot" || input.login.endsWith("[bot]"),
	login: input.login,
});

export const upsertGithubUser = async (input: GithubAccountInput) => {
	const now = unixNow();
	const scalars = githubUserScalars(input);
	const [created] = await database
		.insert(GithubUser)
		.values({
			...scalars,
			bio: input.bio ?? null,
			followers: input.followers ?? 0,
			following: input.following ?? 0,
			githubCreatedAt: input.githubCreatedAt ?? null,
			githubUserId: asTextId(input.githubUserId),
			lastEnrichedAt: input.lastEnrichedAt ?? null,
			lastSeenAt: now,
			publicRepos: input.publicRepos ?? 0,
			totalContributions: input.totalContributions ?? 0,
			totalStars: input.totalStars ?? 0,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			// Preserve enrichment-only fields when a caller (e.g. a webhook with
			// only the embedded user object) doesn't supply them.
			set: {
				...scalars,
				bio: input.bio ?? sql`${GithubUser.bio}`,
				followers: input.followers ?? sql`${GithubUser.followers}`,
				following: input.following ?? sql`${GithubUser.following}`,
				githubCreatedAt:
					input.githubCreatedAt ?? sql`${GithubUser.githubCreatedAt}`,
				lastEnrichedAt:
					input.lastEnrichedAt ?? sql`${GithubUser.lastEnrichedAt}`,
				lastSeenAt: now,
				publicRepos: input.publicRepos ?? sql`${GithubUser.publicRepos}`,
				totalContributions:
					input.totalContributions ?? sql`${GithubUser.totalContributions}`,
				totalStars: input.totalStars ?? sql`${GithubUser.totalStars}`,
				updatedAt: now,
			},
			target: GithubUser.githubUserId,
		})
		.returning();

	return created;
};

export const upsertInstallation = async (input: GithubInstallationInput) => {
	const now = unixNow();
	const installerGithubId =
		input.installerGithubId == null
			? undefined
			: asTextId(input.installerGithubId);
	const set = {
		accountGithubId: input.accountGithubId
			? asTextId(input.accountGithubId)
			: null,
		accountLogin: input.accountLogin,
		accountType: input.accountType ?? "Organization",
		repositorySelection: input.repositorySelection ?? "all",
		suspendedAt: toUnixSeconds(input.suspendedAt),
		updatedAt: now,
	};
	const [created] = await database
		.insert(Installation)
		.values({
			...set,
			githubInstallationId: asTextId(input.githubInstallationId),
			// null on first insert when unknown; a later install event fills it in.
			installerGithubId: installerGithubId ?? null,
		})
		.onConflictDoUpdate({
			// Only carry installerGithubId into the update when this call actually
			// knows it (install events). Otherwise leave the stored value intact.
			set: installerGithubId ? { ...set, installerGithubId } : set,
			target: Installation.githubInstallationId,
		})
		.returning();

	return created;
};

const findInstallationByGithubId = async (
	githubInstallationId?: null | string
) => {
	if (!githubInstallationId) {
		return null;
	}
	const [installation] = await database
		.select()
		.from(Installation)
		.where(eq(Installation.githubInstallationId, githubInstallationId))
		.limit(1);
	return installation ?? null;
};

export const upsertRepository = async (input: GithubRepositoryInput) => {
	const now = unixNow();
	const installation = await findInstallationByGithubId(
		input.installationGithubId ? asTextId(input.installationGithubId) : null
	);
	const [created] = await database
		.insert(Repository)
		.values({
			defaultBranch: input.defaultBranch ?? null,
			fullName: input.fullName,
			githubRepositoryId: asTextId(input.githubRepositoryId),
			htmlUrl: input.htmlUrl ?? `https://github.com/${input.fullName}`,
			installationId: installation?.id ?? null,
			isPrivate: input.isPrivate ?? false,
			name: input.name,
			ownerLogin: input.ownerLogin,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			set: {
				defaultBranch: input.defaultBranch ?? null,
				fullName: input.fullName,
				htmlUrl: input.htmlUrl ?? `https://github.com/${input.fullName}`,
				installationId: installation?.id ?? null,
				isActive: true,
				isPrivate: input.isPrivate ?? false,
				name: input.name,
				ownerLogin: input.ownerLogin,
				updatedAt: now,
			},
			target: Repository.githubRepositoryId,
		})
		.returning();

	return created;
};

export const markRepositoryInactive = async (
	githubRepositoryId: number | string
) => {
	const [updated] = await database
		.update(Repository)
		.set({ isActive: false, updatedAt: unixNow() })
		.where(eq(Repository.githubRepositoryId, asTextId(githubRepositoryId)))
		.returning();
	return updated ?? null;
};

export const upsertPullRequest = async ({
	author,
	pullRequest,
	repository,
}: {
	author: GithubUserSelect;
	pullRequest: GithubPullRequestInput;
	repository: RepositorySelect;
}) => {
	const now = unixNow();
	const [created] = await database
		.insert(PullRequest)
		.values({
			additions: pullRequest.additions ?? 0,
			authorUserId: author.id,
			baseRef: pullRequest.baseRef ?? null,
			body: pullRequest.body ?? null,
			changedFiles: pullRequest.changedFiles ?? 0,
			closedAt: toUnixSeconds(pullRequest.closedAt),
			commitCount: pullRequest.commitCount ?? 0,
			deletions: pullRequest.deletions ?? 0,
			githubPullRequestId: asTextId(pullRequest.githubPullRequestId),
			headSha: pullRequest.headSha ?? null,
			htmlUrl: pullRequest.htmlUrl,
			lastSeenAt: now,
			mergedAt: toUnixSeconds(pullRequest.mergedAt),
			number: pullRequest.number,
			repositoryId: repository.id,
			state: pullRequest.state,
			title: pullRequest.title,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			set: {
				additions: pullRequest.additions ?? 0,
				baseRef: pullRequest.baseRef ?? null,
				body: pullRequest.body ?? null,
				changedFiles: pullRequest.changedFiles ?? 0,
				closedAt: toUnixSeconds(pullRequest.closedAt),
				commitCount: pullRequest.commitCount ?? 0,
				deletions: pullRequest.deletions ?? 0,
				headSha: pullRequest.headSha ?? null,
				htmlUrl: pullRequest.htmlUrl,
				lastSeenAt: now,
				mergedAt: toUnixSeconds(pullRequest.mergedAt),
				state: pullRequest.state,
				title: pullRequest.title,
				updatedAt: now,
			},
			target: PullRequest.githubPullRequestId,
		})
		.returning();

	// pull_request_seen is recorded for audit/timeline only. Weight stays at 0
	// because activityScore in recalculateRiskProfile already caps PR-count
	// contribution at 20 — adding +2/PR here double-counts and lets a
	// high-volume author get pushed past the watch threshold purely by
	// opening lots of benign PRs.
	await recordSignal({
		metadata: {
			changedFiles: pullRequest.changedFiles ?? 0,
			commitCount: pullRequest.commitCount ?? 0,
			number: pullRequest.number,
		},
		pullRequestId: created.id,
		repositoryId: repository.id,
		signalType: "pull_request_seen",
		source: "github_webhook",
		sourceUrl: pullRequest.htmlUrl,
		targetUserId: author.id,
		weight: 0,
	});
	await recalculateRiskProfile(author.id);

	return created;
};

export const recordDuplicateCampaignSignal = async ({
	author,
	currentPullRequest,
	repository,
}: {
	author: GithubUserSelect;
	currentPullRequest: PullRequestSelect;
	repository: RepositorySelect;
}) => {
	const normalizedTitle = normalizeCampaignTitle(currentPullRequest.title);
	if (normalizedTitle.split(" ").length < 2) {
		return;
	}
	const [existingSignal] = await database
		.select({ id: BotSignal.id })
		.from(BotSignal)
		.where(
			and(
				eq(BotSignal.pullRequestId, currentPullRequest.id),
				eq(BotSignal.signalType, "duplicate_campaign")
			)
		)
		.limit(1);
	if (existingSignal) {
		return;
	}

	const recentCutoff = unixNow() - DUPLICATE_CAMPAIGN_WINDOW_SECONDS;
	const recentPullRequests = await database
		.select({
			htmlUrl: PullRequest.htmlUrl,
			lastSeenAt: PullRequest.lastSeenAt,
			repositoryFullName: Repository.fullName,
			title: PullRequest.title,
		})
		.from(PullRequest)
		.innerJoin(Repository, eq(Repository.id, PullRequest.repositoryId))
		.where(eq(PullRequest.authorUserId, author.id))
		.orderBy(desc(PullRequest.lastSeenAt))
		.limit(100);

	const matches = recentPullRequests.filter(
		(row) =>
			row.lastSeenAt >= recentCutoff &&
			normalizeCampaignTitle(row.title) === normalizedTitle
	);
	const repositoryCount = new Set(matches.map((row) => row.repositoryFullName))
		.size;
	if (
		matches.length < DUPLICATE_CAMPAIGN_MIN_PRS ||
		repositoryCount < DUPLICATE_CAMPAIGN_MIN_REPOSITORIES
	) {
		return;
	}

	await recordSignal({
		metadata: {
			matchedPullRequests: matches.slice(0, 8).map((row) => ({
				repositoryFullName: row.repositoryFullName,
				title: row.title,
				url: row.htmlUrl,
			})),
			normalizedTitle,
			reasonCode: "duplicate_pr",
			repositoryCount,
		},
		pullRequestId: currentPullRequest.id,
		repositoryId: repository.id,
		signalType: "duplicate_campaign",
		source: "cross_repo_pattern",
		sourceUrl: currentPullRequest.htmlUrl,
		targetUserId: author.id,
		weight: 55,
	});
};

export const recordSignal = async (input: {
	metadata?: Record<string, unknown>;
	pullRequestId?: null | string;
	reportId?: null | string;
	repositoryId?: null | string;
	signalType: string;
	source: string;
	sourceUrl?: null | string;
	targetUserId: string;
	weight: number;
}) => {
	const [created] = await database
		.insert(BotSignal)
		.values({
			metadataJson: json(input.metadata ?? {}),
			pullRequestId: input.pullRequestId ?? null,
			reportId: input.reportId ?? null,
			repositoryId: input.repositoryId ?? null,
			signalType: input.signalType,
			source: input.source,
			sourceUrl: input.sourceUrl ?? null,
			targetUserId: input.targetUserId,
			weight: input.weight,
		})
		.returning();
	return created;
};

const reportSignalWeight = ({
	reporterIsMaintainer,
	status,
}: Pick<CreateRiskReportInput, "reporterIsMaintainer" | "status">) => {
	if (status === "validated") {
		return reporterIsMaintainer ? 35 : 12;
	}
	return 0;
};

export const createRiskReport = async (input: CreateRiskReportInput) => {
	const now = unixNow();
	const values = {
		aiRationale: input.aiRationale ?? null,
		aiVerdict: input.aiVerdict ?? null,
		commandText: input.commandText,
		commentId: input.commentId ? asTextId(input.commentId) : null,
		confidence: boundedConfidence(input.confidence),
		evidenceJson: json(input.evidence),
		issueNumber: input.issueNumber ?? null,
		pullRequestId: input.pullRequestId ?? null,
		rawPayloadJson: serializeRawPayload(input.rawPayload),
		reasonCode: input.reasonCode,
		reasonText: input.reasonText ?? null,
		reporterAssociation: input.reporterAssociation,
		reporterGithubId: input.reporterGithubId
			? asTextId(input.reporterGithubId)
			: null,
		reporterIsMaintainer: input.reporterIsMaintainer,
		reporterLogin: input.reporterLogin,
		repositoryId: input.repositoryId ?? null,
		sourceUrl: input.sourceUrl,
		status: input.status,
		targetUserId: input.targetUserId,
		updatedAt: now,
	};

	const [created] = await database
		.insert(BotReport)
		.values(values)
		.onConflictDoUpdate({
			set: values,
			target: BotReport.commentId,
		})
		.returning();

	const signalWeight = reportSignalWeight(input);
	if (signalWeight > 0) {
		await database
			.delete(BotSignal)
			.where(
				and(
					eq(BotSignal.reportId, created.id),
					eq(BotSignal.signalType, "maintainer_report")
				)
			);
		await recordSignal({
			metadata: {
				aiVerdict: input.aiVerdict ?? null,
				reporterAssociation: input.reporterAssociation,
				reporterLogin: input.reporterLogin,
				status: input.status,
			},
			pullRequestId: input.pullRequestId ?? null,
			reportId: created.id,
			repositoryId: input.repositoryId ?? null,
			signalType: "maintainer_report",
			source: "github_comment_command",
			sourceUrl: input.sourceUrl,
			targetUserId: input.targetUserId,
			weight: signalWeight,
		});
	}
	await recalculateRiskProfile(input.targetUserId);

	return created;
};

// Per-report score is now computed inside reportAggregatesQuery via SQL CASE
// statements; the JS scoreReport helper has moved into that aggregate.

const riskSummary = ({
	existingSummary,
	isKnownBot,
	reporterCount,
	status,
}: {
	existingSummary?: null | string;
	isKnownBot: boolean;
	reporterCount: number;
	status: RiskStatus;
}) => {
	if (status === "allow") {
		// Prefer an existing custom summary (e.g. a maintainer allowlist note);
		// only fall back to the bot-account boilerplate when nothing better exists.
		if (existingSummary && !isKnownBot) {
			return existingSummary;
		}
		return isKnownBot
			? "Known GitHub bot account; kept on the allow list."
			: (existingSummary ?? "Allowlisted account.");
	}
	if (reporterCount > 0) {
		return `Reported by ${reporterCount} maintainer account(s).`;
	}
	return existingSummary ?? "Observed through shared OSS abuse signals.";
};

export const importExternalRiskUser = async (input: {
	firstSeenAt?: null | string;
	lastSeenAt?: null | string;
	login: string;
	sourceName: string;
	totalPrs?: number;
}) => {
	const user = await upsertGithubUser({
		avatarUrl: `https://github.com/${input.login}.png`,
		githubUserId: `external:${input.login}`,
		htmlUrl: `https://github.com/${input.login}`,
		login: input.login,
		type: "User",
	});
	const firstSeenAt = toUnixSeconds(input.firstSeenAt) ?? unixNow();
	const lastSeenAt = toUnixSeconds(input.lastSeenAt) ?? firstSeenAt;
	const score = Math.min(84, 40 + Math.max(0, input.totalPrs ?? 0));
	const status = riskStatusForScore({ isAllowed: false, score });

	await database
		.insert(RiskProfile)
		.values({
			confidence: score,
			firstSeenAt,
			importedSource: input.sourceName,
			lastSeenAt,
			lastSignalAt: lastSeenAt,
			prCount: input.totalPrs ?? 0,
			reasonCodesJson: json(["external_blocklist"]),
			score,
			status,
			summary: `Imported from ${input.sourceName}.`,
			targetUserId: user.id,
			updatedAt: unixNow(),
		})
		.onConflictDoUpdate({
			set: {
				confidence: score,
				importedSource: input.sourceName,
				lastSeenAt,
				lastSignalAt: lastSeenAt,
				prCount: input.totalPrs ?? 0,
				reasonCodesJson: json(["external_blocklist"]),
				score,
				status,
				summary: `Imported from ${input.sourceName}.`,
				updatedAt: unixNow(),
			},
			target: RiskProfile.targetUserId,
		});
};

export const recordSourceImport = async (input: {
	itemCount: number;
	sourceName: string;
	sourceUrl: string;
	status?: string;
}) => {
	const [created] = await database
		.insert(SourceImport)
		.values({
			itemCount: input.itemCount,
			sourceName: input.sourceName,
			sourceUrl: input.sourceUrl,
			status: input.status ?? "completed",
		})
		.returning();
	return created;
};

// Read the most recent pull_request webhook events for a single repo within
// a bounded window. Used by the smoke endpoint to confirm webhook delivery.
const MAX_RECENT_EVENT_WINDOW_SECONDS = 600;
const MAX_RECENT_EVENT_ROWS = 10;

export const recentWebhookEventsQuery = (input: {
	repositoryFullName: string;
	sinceSeconds: number;
}) => {
	const cappedSince = Math.max(
		input.sinceSeconds,
		Math.floor(Date.now() / 1000) - MAX_RECENT_EVENT_WINDOW_SECONDS
	);
	return database
		.select({
			action: AppEvent.action,
			processedAt: AppEvent.processedAt,
			status: AppEvent.status,
		})
		.from(AppEvent)
		.where(
			and(
				eq(AppEvent.eventName, "pull_request"),
				eq(AppEvent.repositoryFullName, input.repositoryFullName)
			)
		)
		.orderBy(desc(AppEvent.processedAt))
		.limit(MAX_RECENT_EVENT_ROWS)
		.then((rows) => rows.filter((row) => row.processedAt >= cappedSince));
};

export const recordAppEvent = async (input: {
	action?: null | string;
	actorLogin?: null | string;
	deliveryId?: null | string;
	error?: null | string;
	eventName: string;
	installationGithubId?: null | number | string;
	rawPayload?: unknown;
	repositoryFullName?: null | string;
	status?: string;
}) => {
	const values = {
		action: input.action ?? null,
		actorLogin: input.actorLogin ?? null,
		deliveryId: input.deliveryId ?? null,
		error: input.error ?? null,
		eventName: input.eventName,
		installationGithubId: input.installationGithubId
			? asTextId(input.installationGithubId)
			: null,
		rawPayloadJson: serializeRawPayload(input.rawPayload),
		repositoryFullName: input.repositoryFullName ?? null,
		status: input.status ?? "processed",
	};
	const [created] = await database
		.insert(AppEvent)
		.values(values)
		.onConflictDoUpdate({
			set: values,
			target: AppEvent.deliveryId,
		})
		.returning();
	return created;
};

// SQL aggregate of report-derived counts (no longer includes reportScore;
// that's computed via the per-reporter capped query below to defend against
// report-bombing).
const reportAggregatesQuery = (targetUserId: string) =>
	database
		.select({
			reasonCodesCsv: sql<string>`COALESCE(GROUP_CONCAT(DISTINCT CASE WHEN ${BotReport.status} = 'validated' THEN ${BotReport.reasonCode} ELSE NULL END), '')`,
			reportCount: count(),
			reporterCount: countDistinct(BotReport.reporterLogin),
			validatedReportCount: sql<number>`COALESCE(SUM(CASE WHEN ${BotReport.status} = 'validated' THEN 1 ELSE 0 END), 0)`,
			maxReportAt: max(BotReport.createdAt),
		})
		.from(BotReport)
		.leftJoin(Repository, eq(Repository.id, BotReport.repositoryId))
		.where(
			and(
				eq(BotReport.targetUserId, targetUserId),
				or(isNull(BotReport.repositoryId), eq(Repository.isPrivate, false))
			)
		);

// Linear age decay applied at query time. Mirrors lib/scoring.ts ageDecay:
//   - Full weight for 30 days (2592000s).
//   - Linear decay to floor of 0.2 at 365 days (31536000s).
//   - Stays at floor forever after.
const AGE_DECAY_SQL = (createdAtColumn: ReturnType<typeof sql.raw>) =>
	sql`MAX(0.2, MIN(1.0, 1.0 - (MAX(0, (unixepoch() - ${createdAtColumn}) - 2592000) * 1.0 / 28944000.0) * 0.8))`;

// Per-reporter MAX validated contribution for this target, age-decayed.
// Caps report-bombing: a single reporter filing N validated reports on the
// same target counts the same as 1 (the highest-scoring one × decay).
//
// `validatedScore` mirrors the original per-report formula:
//   base + ai-boost + 12, where
//   base = 28 if reporterIsMaintainer else 6
//   ai-boost = 14 if likely_abuse, 4 if unclear, else 0
// Then multiplied by ageDecay(createdAt).
const perReporterContributionQuery = (targetUserId: string) =>
	database
		.select({
			reporterLogin: BotReport.reporterLogin,
			validatedScore: sql<number>`COALESCE(MAX(CASE
				WHEN ${BotReport.status} = 'validated' THEN
					((CASE WHEN ${BotReport.reporterIsMaintainer} = 1 THEN 28 ELSE 6 END)
						+ (CASE
							WHEN ${BotReport.aiVerdict} = 'likely_abuse' THEN 14
							WHEN ${BotReport.aiVerdict} = 'unclear' THEN 4
							ELSE 0
						END)
						+ 12)
					* ${AGE_DECAY_SQL(sql.raw(`"BotReport"."createdAt"`))}
				ELSE 0
			END), 0)`,
		})
		.from(BotReport)
		.leftJoin(Repository, eq(Repository.id, BotReport.repositoryId))
		.where(
			and(
				eq(BotReport.targetUserId, targetUserId),
				or(isNull(BotReport.repositoryId), eq(Repository.isPrivate, false))
			)
		)
		.groupBy(BotReport.reporterLogin);

// Global per-reporter accuracy used to weight new contributions. A reporter
// with all validated reports gets weight ~1; a reporter with all dismissed
// reports approaches 0. The +3 prior in the denominator stops new reporters
// (low total) from being scored unfairly low or unfairly high — they trend
// toward the baseline until they accumulate a track record.
const reporterTrustQuery = (logins: string[]) =>
	database
		.select({
			reporterLogin: BotReport.reporterLogin,
			total: count(),
			validated: sql<number>`COALESCE(SUM(CASE WHEN ${BotReport.status} = 'validated' THEN 1 ELSE 0 END), 0)`,
		})
		.from(BotReport)
		.leftJoin(Repository, eq(Repository.id, BotReport.repositoryId))
		.where(
			and(
				inArray(BotReport.reporterLogin, logins),
				or(isNull(BotReport.repositoryId), eq(Repository.isPrivate, false))
			)
		)
		.groupBy(BotReport.reporterLogin);

const TRUST_PRIOR = 3;
const TRUST_NEUTRAL = 0.5;
const TRUST_FLOOR = 0.2;

const reporterTrust = (validated: number, total: number) => {
	if (total <= 0) {
		return TRUST_NEUTRAL;
	}
	const raw = validated / Math.max(total, TRUST_PRIOR);
	return Math.max(TRUST_FLOOR, raw);
};

// SQL aggregate of signal score, age-decayed. maintainer_report signals
// only contribute when their linked BotReport is validated, matching the
// original JS reducer. Each contributing signal's weight is multiplied by
// the ageDecay factor based on observedAt.
const signalAggregatesQuery = (targetUserId: string) =>
	database
		.select({
			reasonCodesCsv: sql<string>`COALESCE(GROUP_CONCAT(DISTINCT CASE
				WHEN ${BotSignal.signalType} = 'duplicate_campaign' THEN 'duplicate_pr'
				WHEN ${BotSignal.signalType} = 'ai_pr_review' AND ${BotSignal.metadataJson} LIKE '%"reasonCode":"credential_phishing"%' THEN 'credential_phishing'
				WHEN ${BotSignal.signalType} = 'ai_pr_review' AND ${BotSignal.metadataJson} LIKE '%"reasonCode":"malicious_code"%' THEN 'malicious_code'
				WHEN ${BotSignal.signalType} = 'ai_pr_review' AND ${BotSignal.metadataJson} LIKE '%"reasonCode":"duplicate_pr"%' THEN 'duplicate_pr'
				WHEN ${BotSignal.signalType} = 'ai_pr_review' AND ${BotSignal.metadataJson} LIKE '%"reasonCode":"spam_pr"%' THEN 'spam_pr'
				WHEN ${BotSignal.signalType} = 'ai_pr_review' AND ${BotSignal.metadataJson} LIKE '%"reasonCode":"ai_slop"%' THEN 'ai_slop'
				WHEN ${BotSignal.signalType} = 'ai_pr_review' AND ${BotSignal.metadataJson} LIKE '%"reasonCode":"fake_bounty"%' THEN 'fake_bounty'
				ELSE NULL
			END), '')`,
			signalScore: sql<number>`COALESCE(SUM(CASE
				WHEN ${BotSignal.signalType} != 'maintainer_report'
					THEN ${BotSignal.weight} * ${AGE_DECAY_SQL(sql.raw(`"BotSignal"."observedAt"`))}
				WHEN ${BotReport.status} = 'validated'
					THEN ${BotSignal.weight} * ${AGE_DECAY_SQL(sql.raw(`"BotSignal"."observedAt"`))}
				ELSE 0
			END), 0)`,
			maxObservedAt: max(BotSignal.observedAt),
		})
		.from(BotSignal)
		.leftJoin(BotReport, eq(BotReport.id, BotSignal.reportId))
		.leftJoin(Repository, eq(Repository.id, BotSignal.repositoryId))
		.where(
			and(
				eq(BotSignal.targetUserId, targetUserId),
				or(isNull(BotSignal.repositoryId), eq(Repository.isPrivate, false))
			)
		);

const pullRequestAggregatesQuery = (targetUserId: string) =>
	database
		.select({
			prCount: count(),
			commitCount: sql<number>`COALESCE(SUM(${PullRequest.commitCount}), 0)`,
			repositoryCount: countDistinct(PullRequest.repositoryId),
			maxLastSeenAt: max(PullRequest.lastSeenAt),
		})
		.from(PullRequest)
		.innerJoin(Repository, eq(Repository.id, PullRequest.repositoryId))
		.where(
			and(
				eq(PullRequest.authorUserId, targetUserId),
				eq(Repository.isPrivate, false)
			)
		);

const PR_VELOCITY_WINDOW_SECONDS = 7 * 86_400;

// Recent PR rate + how many distinct repo owners they span — feeds the
// scattershot-velocity signal (bursty PRs across many unrelated orgs).
const pullRequestVelocityQuery = (targetUserId: string) =>
	database
		.select({
			distinctOwners: countDistinct(Repository.ownerLogin),
			recentPrCount: count(),
		})
		.from(PullRequest)
		.innerJoin(Repository, eq(Repository.id, PullRequest.repositoryId))
		.where(
			and(
				eq(PullRequest.authorUserId, targetUserId),
				eq(Repository.isPrivate, false),
				gte(PullRequest.lastSeenAt, unixNow() - PR_VELOCITY_WINDOW_SECONDS)
			)
		);

type ReportAgg = Awaited<ReturnType<typeof reportAggregatesQuery>>[number];
type SignalAgg = Awaited<ReturnType<typeof signalAggregatesQuery>>[number];
type PrAgg = Awaited<ReturnType<typeof pullRequestAggregatesQuery>>[number];
type PrVelocityAgg = Awaited<
	ReturnType<typeof pullRequestVelocityQuery>
>[number];
type ExistingProfile =
	| {
			importedSource: null | string;
			lastSignalAt: null | number;
			prCount: number;
			reasonCodesJson: null | string;
			repositoryCount: number;
			status: RiskStatus;
			summary: null | string;
	  }
	| undefined;

const mergeReasonCodes = (
	existing: ExistingProfile,
	reportAgg: ReportAgg | undefined,
	signalAgg: SignalAgg | undefined
) => {
	const codes = new Set<ReasonCode>();
	if (existing?.importedSource) {
		codes.add("external_blocklist");
	}
	for (const code of [
		...(reportAgg?.reasonCodesCsv ?? "").split(","),
		...(signalAgg?.reasonCodesCsv ?? "").split(","),
	]) {
		const trimmed = code.trim();
		if (trimmed) {
			codes.add(trimmed as ReasonCode);
		}
	}
	return codes;
};

const buildProfileValues = ({
	existing,
	prAgg,
	reportAgg,
	reportScore,
	signalAgg,
	targetUserId,
	user,
	velocityAgg,
}: {
	existing: ExistingProfile;
	prAgg: PrAgg | undefined;
	reportAgg: ReportAgg | undefined;
	reportScore: number;
	signalAgg: SignalAgg | undefined;
	targetUserId: string;
	user: GithubUserSelect;
	velocityAgg: PrVelocityAgg | undefined;
}) => {
	const signalScore = Number(signalAgg?.signalScore ?? 0);
	const reportCount = Number(reportAgg?.reportCount ?? 0);
	const validatedReportCount = Number(reportAgg?.validatedReportCount ?? 0);
	const reporterCount = Number(reportAgg?.reporterCount ?? 0);
	const prCount = Number(prAgg?.prCount ?? 0);
	const commitCount = Number(prAgg?.commitCount ?? 0);
	const repositoryCount = Number(prAgg?.repositoryCount ?? 0);

	// Deterministic core + young-account/bot-pattern boosts + reputation
	// dampening all live in composeProfileScore, so the published score matches
	// the unit-tested math (single source of truth).
	const { score, status } = composeProfileScore({
		accountCreatedAt: user.githubCreatedAt,
		botPatternMatch:
			handleMatchesBotPattern(user.login) || bioMatchesBotPattern(user.bio),
		distinctOwners: Number(velocityAgg?.distinctOwners ?? 0),
		followers: user.followers,
		following: user.following,
		importedSource: existing?.importedSource ?? null,
		isAllowedSticky: existing?.status === "allow",
		isKnownGithubBot: user.isKnownGithubBot,
		prCount,
		recentPrCount: Number(velocityAgg?.recentPrCount ?? 0),
		reportScore,
		signalScore,
		suspiciousHandleEntropy: handleEntropyIsSuspicious(user.login),
		totalContributions: user.totalContributions,
		totalStars: user.totalStars,
		validatedReportCount,
	});

	const lastSeenAt = Math.max(
		user.lastSeenAt,
		Number(prAgg?.maxLastSeenAt ?? 0),
		Number(reportAgg?.maxReportAt ?? 0),
		Number(signalAgg?.maxObservedAt ?? 0)
	);
	const summary = riskSummary({
		existingSummary: existing?.summary,
		isKnownBot: user.isKnownGithubBot,
		reporterCount,
		status,
	});

	return {
		commitCount,
		confidence: score,
		importedSource: existing?.importedSource ?? null,
		lastSeenAt,
		lastSignalAt:
			Number(signalAgg?.maxObservedAt ?? existing?.lastSignalAt ?? 0) || null,
		prCount: Math.max(existing?.prCount ?? 0, prCount),
		reasonCodesJson: json([
			...mergeReasonCodes(existing, reportAgg, signalAgg),
		]),
		reportCount,
		repositoryCount: repositoryCount || existing?.repositoryCount || 0,
		score,
		status,
		summary,
		targetUserId,
		updatedAt: unixNow(),
		validatedReportCount,
	};
};

export const recalculateRiskProfile = async (targetUserId: string) => {
	const [user] = await database
		.select()
		.from(GithubUser)
		.where(eq(GithubUser.id, targetUserId))
		.limit(1);
	if (!user) {
		return null;
	}

	const [
		[reportAgg],
		[signalAgg],
		[prAgg],
		[velocityAgg],
		[existing],
		perReporter,
	] = await Promise.all([
		reportAggregatesQuery(targetUserId),
		signalAggregatesQuery(targetUserId),
		pullRequestAggregatesQuery(targetUserId),
		pullRequestVelocityQuery(targetUserId),
		database
			.select()
			.from(RiskProfile)
			.where(eq(RiskProfile.targetUserId, targetUserId))
			.limit(1),
		perReporterContributionQuery(targetUserId),
	]);

	// Compute reportScore: per-reporter MAX validated contribution × trust.
	// Caps report-bombing (one reporter spamming N reports stays capped at
	// one report's worth of score) and downweights low-accuracy reporters.
	const reporterLogins = perReporter.map((r) => r.reporterLogin);
	const trusts = reporterLogins.length
		? await reporterTrustQuery(reporterLogins)
		: [];
	const trustByLogin = new Map(
		trusts.map((t) => [
			t.reporterLogin,
			reporterTrust(Number(t.validated), Number(t.total)),
		])
	);
	const reportScore = perReporter.reduce(
		(acc, r) =>
			acc +
			Number(r.validatedScore) *
				(trustByLogin.get(r.reporterLogin) ?? TRUST_NEUTRAL),
		0
	);

	const values = buildProfileValues({
		existing,
		prAgg,
		reportAgg,
		reportScore,
		signalAgg,
		targetUserId,
		user,
		velocityAgg,
	});

	const [profile] = await database
		.insert(RiskProfile)
		.values(values)
		.onConflictDoUpdate({
			set: values,
			target: RiskProfile.targetUserId,
		})
		.returning();

	return profile;
};

export interface MaintainerCorrectionInput {
	correctedByLogin: string;
	pullRequestId?: null | string;
	repositoryId?: null | string;
	sourceUrl: string;
	targetUserId: string;
}

type CorrectionKind = "allow" | "confirm" | "dismiss" | "reset";

const correctionSignalType = (kind: CorrectionKind) =>
	`maintainer_correction_${kind}` as const;

const correctionMetadata = (
	kind: CorrectionKind,
	input: MaintainerCorrectionInput,
	extra: Record<string, unknown> = {}
) => ({
	correctedByLogin: input.correctedByLogin,
	kind,
	...extra,
});

const recordCorrectionSignal = async ({
	input,
	kind,
	metadata,
	weight,
}: {
	input: MaintainerCorrectionInput;
	kind: CorrectionKind;
	metadata?: Record<string, unknown>;
	weight: number;
}) =>
	recordSignal({
		metadata: correctionMetadata(kind, input, metadata),
		pullRequestId: input.pullRequestId ?? null,
		repositoryId: input.repositoryId ?? null,
		signalType: correctionSignalType(kind),
		source: "github_comment_command",
		sourceUrl: input.sourceUrl,
		targetUserId: input.targetUserId,
		weight,
	});

export const correctionAlreadyApplied = async ({
	kind,
	sourceUrl,
}: {
	kind: CorrectionKind;
	sourceUrl: string;
}) => {
	const [existing] = await database
		.select({ id: BotSignal.id })
		.from(BotSignal)
		.where(
			and(
				eq(BotSignal.sourceUrl, sourceUrl),
				eq(BotSignal.signalType, correctionSignalType(kind))
			)
		)
		.limit(1);
	return !!existing;
};

// Replace any prior ai_pr_review signal on this (target, pullRequest) with
// the latest analysis. Repeated synchronizes on the same PR shouldn't stack
// the score — the AI's most recent verdict is the authoritative one. Setting
// stale signals' weight to 0 keeps them as audit history without affecting
// the score.
export const replacePullRequestAiSignal = async ({
	aiSignalWeight,
	analysis,
	analyzedContext,
	pullRequestId,
	pullRequestUrl,
	repositoryId,
	targetUserId,
}: {
	aiSignalWeight: number;
	analysis: {
		causes: string[];
		confidence: number;
		evidenceSummary?: string;
		rationale: string;
		reasonCode: string;
		scoreBreakdown?: unknown;
		verdict: string;
	};
	// The inputs the analysis actually read (comments, commit messages, file
	// metadata, account context) — persisted alongside the verdict for the audit
	// trail, so a flagged PR's full evidence is reconstructable.
	analyzedContext?: unknown;
	pullRequestId: string;
	pullRequestUrl: string;
	repositoryId: string;
	targetUserId: string;
}) => {
	// Zero out the weight on prior ai_pr_review rows for this PR.
	await database
		.update(BotSignal)
		.set({ weight: 0 })
		.where(
			and(
				eq(BotSignal.targetUserId, targetUserId),
				eq(BotSignal.pullRequestId, pullRequestId),
				eq(BotSignal.signalType, "ai_pr_review")
			)
		);

	// Insert the fresh signal if the latest analysis was actionable.
	if (aiSignalWeight > 0) {
		await recordSignal({
			metadata: {
				aiConfidence: analysis.confidence,
				aiCauses: analysis.causes,
				aiEvidenceSummary: analysis.evidenceSummary,
				aiRationale: analysis.rationale,
				aiScoreBreakdown: analysis.scoreBreakdown,
				aiVerdict: analysis.verdict,
				analyzedContext: analyzedContext ?? null,
				reasonCode: analysis.reasonCode,
			},
			pullRequestId,
			repositoryId,
			signalType: "ai_pr_review",
			source: "openrouter",
			sourceUrl: pullRequestUrl,
			targetUserId,
			weight: aiSignalWeight,
		});
	}
};

// Deterministic per-PR heuristics (diff signature + commit-message voice).
// Recorded alongside the LLM's ai_pr_review so the deterministic core and the
// LLM both contribute to the score. Deduped per PR like ai_pr_review: prior
// rows are zeroed so repeated synchronizes don't stack.
export const replacePullRequestHeuristicSignal = async ({
	commitVoice,
	diffSignature,
	pullRequestId,
	pullRequestUrl,
	repositoryId,
	targetUserId,
	weight,
}: {
	commitVoice: number;
	diffSignature: number;
	pullRequestId: string;
	pullRequestUrl: string;
	repositoryId: string;
	targetUserId: string;
	weight: number;
}) => {
	await database
		.update(BotSignal)
		.set({ weight: 0 })
		.where(
			and(
				eq(BotSignal.targetUserId, targetUserId),
				eq(BotSignal.pullRequestId, pullRequestId),
				eq(BotSignal.signalType, "pr_heuristics")
			)
		);
	if (weight > 0) {
		await recordSignal({
			metadata: { commitVoice, diffSignature },
			pullRequestId,
			repositoryId,
			signalType: "pr_heuristics",
			source: "deterministic_pr_heuristics",
			sourceUrl: pullRequestUrl,
			targetUserId,
			weight,
		});
	}
};

export const dismissReportsForUser = async (
	input: MaintainerCorrectionInput
) => {
	const updated = await database
		.update(BotReport)
		.set({ status: "dismissed", updatedAt: unixNow() })
		.where(
			and(
				eq(BotReport.targetUserId, input.targetUserId),
				inArray(BotReport.status, ["pending", "needs_review", "validated"])
			)
		)
		.returning();

	// Also zero out any ai_pr_review signals on this PR — a maintainer saying
	// "this PR is a false positive" should fully clear the AI's footprint on
	// this PR, not just the report row. Other PRs from the same author keep
	// their own AI analysis untouched.
	let neutralizedSignals = 0;
	if (input.pullRequestId) {
		const neutralized = await database
			.update(BotSignal)
			.set({ weight: 0 })
			.where(
				and(
					eq(BotSignal.targetUserId, input.targetUserId),
					eq(BotSignal.pullRequestId, input.pullRequestId),
					eq(BotSignal.signalType, "ai_pr_review")
				)
			)
			.returning({ id: BotSignal.id });
		neutralizedSignals = neutralized.length;
	}

	await recordCorrectionSignal({
		input,
		kind: "dismiss",
		metadata: {
			dismissedReportIds: updated.map((row) => row.id),
			neutralizedAiSignals: neutralizedSignals,
		},
		weight: -30,
	});
	const profile = await recalculateRiskProfile(input.targetUserId);
	return {
		dismissedCount: updated.length,
		neutralizedSignals,
		profile,
	};
};

export const validateLatestReportForUser = async (
	input: MaintainerCorrectionInput
) => {
	const [latest] = await database
		.select()
		.from(BotReport)
		.where(
			and(
				eq(BotReport.targetUserId, input.targetUserId),
				inArray(BotReport.status, ["pending", "needs_review"])
			)
		)
		.orderBy(desc(BotReport.createdAt))
		.limit(1);

	if (latest) {
		await database
			.update(BotReport)
			.set({ status: "validated", updatedAt: unixNow() })
			.where(eq(BotReport.id, latest.id));
	}

	await recordCorrectionSignal({
		input,
		kind: "confirm",
		metadata: { confirmedReportId: latest?.id ?? null },
		weight: 25,
	});
	const profile = await recalculateRiskProfile(input.targetUserId);
	return { profile, validated: latest ?? null };
};

export const allowlistUser = async (input: MaintainerCorrectionInput) => {
	const now = unixNow();
	const summary = `Allowlisted by maintainer @${input.correctedByLogin}.`;
	await database
		.insert(RiskProfile)
		.values({
			confidence: 0,
			firstSeenAt: now,
			lastSeenAt: now,
			score: 0,
			status: "allow",
			summary,
			targetUserId: input.targetUserId,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			set: {
				confidence: 0,
				score: 0,
				status: "allow",
				summary,
				updatedAt: now,
			},
			target: RiskProfile.targetUserId,
		});

	await recordCorrectionSignal({ input, kind: "allow", weight: 0 });
	const profile = await recalculateRiskProfile(input.targetUserId);
	return { profile };
};

// Undo a prior allow. We can't unallow a known GitHub bot (isKnownGithubBot
// is sticky and still drives isAllowed=true in recalculateRiskProfile), but
// for human accounts the status flips to "watch" and the recalculate pass
// will then compute the real score from current signals + reports.
export const resetRiskProfile = async (input: MaintainerCorrectionInput) => {
	const now = unixNow();
	const summary = `Reset by maintainer @${input.correctedByLogin}.`;
	await database
		.update(RiskProfile)
		.set({
			confidence: 0,
			score: 0,
			status: "watch",
			summary,
			updatedAt: now,
		})
		.where(eq(RiskProfile.targetUserId, input.targetUserId));

	await recordCorrectionSignal({ input, kind: "reset", weight: 0 });
	const profile = await recalculateRiskProfile(input.targetUserId);
	return { profile };
};

export const getPullRequestByRepositoryNumber = async (
	repositoryId: string,
	number: number
) => {
	const [pullRequest] = await database
		.select()
		.from(PullRequest)
		.where(
			and(
				eq(PullRequest.repositoryId, repositoryId),
				eq(PullRequest.number, number)
			)
		)
		.limit(1);
	return pullRequest ?? null;
};

export const fetchDirectoryDashboardRecords = async () => {
	const [profiles, reports, repositories, imports, signals, pullRequests] =
		await Promise.all([
			database.query.RiskProfile.findMany({
				orderBy: { score: "desc" },
				with: { targetUser: true },
			}),
			database.query.BotReport.findMany({
				orderBy: { createdAt: "desc" },
				with: { repository: true, targetUser: true },
			}),
			database.query.Repository.findMany(),
			database.query.SourceImport.findMany({
				orderBy: { importedAt: "desc" },
			}),
			database.query.BotSignal.findMany({
				with: { repository: true },
			}),
			database.query.PullRequest.findMany({
				with: { repository: true },
			}),
		]);

	return { imports, profiles, pullRequests, reports, repositories, signals };
};

export type DirectoryPullRequest = PullRequestSelect;
