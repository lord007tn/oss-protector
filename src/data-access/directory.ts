import {
	and,
	count,
	countDistinct,
	desc,
	eq,
	inArray,
	max,
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
import { parseJsonArray } from "@/lib/json";
import { toUnixSeconds, unixNow } from "@/lib/time";

export interface GithubAccountInput {
	avatarUrl?: null | string;
	githubUserId: number | string;
	htmlUrl?: null | string;
	login: string;
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

export const upsertGithubUser = async (input: GithubAccountInput) => {
	const now = unixNow();
	const [created] = await database
		.insert(GithubUser)
		.values({
			accountType: input.type ?? "User",
			avatarUrl: input.avatarUrl ?? null,
			githubUserId: asTextId(input.githubUserId),
			htmlUrl: input.htmlUrl ?? `https://github.com/${input.login}`,
			isKnownGithubBot:
				(input.type ?? "").toLowerCase() === "bot" ||
				input.login.endsWith("[bot]"),
			lastSeenAt: now,
			login: input.login,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			set: {
				accountType: input.type ?? "User",
				avatarUrl: input.avatarUrl ?? null,
				htmlUrl: input.htmlUrl ?? `https://github.com/${input.login}`,
				isKnownGithubBot:
					(input.type ?? "").toLowerCase() === "bot" ||
					input.login.endsWith("[bot]"),
				lastSeenAt: now,
				login: input.login,
				updatedAt: now,
			},
			target: GithubUser.githubUserId,
		})
		.returning();

	return created;
};

export const upsertInstallation = async (input: GithubInstallationInput) => {
	const now = unixNow();
	const [created] = await database
		.insert(Installation)
		.values({
			accountGithubId: input.accountGithubId
				? asTextId(input.accountGithubId)
				: null,
			accountLogin: input.accountLogin,
			accountType: input.accountType ?? "Organization",
			githubInstallationId: asTextId(input.githubInstallationId),
			repositorySelection: input.repositorySelection ?? "all",
			suspendedAt: toUnixSeconds(input.suspendedAt),
			updatedAt: now,
		})
		.onConflictDoUpdate({
			set: {
				accountGithubId: input.accountGithubId
					? asTextId(input.accountGithubId)
					: null,
				accountLogin: input.accountLogin,
				accountType: input.accountType ?? "Organization",
				repositorySelection: input.repositorySelection ?? "all",
				suspendedAt: toUnixSeconds(input.suspendedAt),
				updatedAt: now,
			},
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
		rawPayloadJson: input.rawPayload ? json(input.rawPayload) : null,
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
		rawPayloadJson: input.rawPayload ? json(input.rawPayload) : null,
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
			reasonCodesCsv: sql<string>`COALESCE(GROUP_CONCAT(DISTINCT ${BotReport.reasonCode}), '')`,
			reportCount: count(),
			reporterCount: countDistinct(BotReport.reporterLogin),
			validatedReportCount: sql<number>`COALESCE(SUM(CASE WHEN ${BotReport.status} = 'validated' THEN 1 ELSE 0 END), 0)`,
			maxReportAt: max(BotReport.createdAt),
		})
		.from(BotReport)
		.where(eq(BotReport.targetUserId, targetUserId));

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
		.where(eq(BotReport.targetUserId, targetUserId))
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
		.where(inArray(BotReport.reporterLogin, logins))
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
		.where(eq(BotSignal.targetUserId, targetUserId));

const pullRequestAggregatesQuery = (targetUserId: string) =>
	database
		.select({
			prCount: count(),
			commitCount: sql<number>`COALESCE(SUM(${PullRequest.commitCount}), 0)`,
			repositoryCount: countDistinct(PullRequest.repositoryId),
			maxLastSeenAt: max(PullRequest.lastSeenAt),
		})
		.from(PullRequest)
		.where(eq(PullRequest.authorUserId, targetUserId));

type ReportAgg = Awaited<ReturnType<typeof reportAggregatesQuery>>[number];
type SignalAgg = Awaited<ReturnType<typeof signalAggregatesQuery>>[number];
type PrAgg = Awaited<ReturnType<typeof pullRequestAggregatesQuery>>[number];
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
	reportAgg: ReportAgg | undefined
) => {
	const codes = new Set<ReasonCode>(
		parseJsonArray<ReasonCode>(existing?.reasonCodesJson)
	);
	for (const code of (reportAgg?.reasonCodesCsv ?? "").split(",")) {
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
}: {
	existing: ExistingProfile;
	prAgg: PrAgg | undefined;
	reportAgg: ReportAgg | undefined;
	reportScore: number;
	signalAgg: SignalAgg | undefined;
	targetUserId: string;
	user: GithubUserSelect;
}) => {
	const signalScore = Number(signalAgg?.signalScore ?? 0);
	const reportCount = Number(reportAgg?.reportCount ?? 0);
	const validatedReportCount = Number(reportAgg?.validatedReportCount ?? 0);
	const reporterCount = Number(reportAgg?.reporterCount ?? 0);
	const prCount = Number(prAgg?.prCount ?? 0);
	const commitCount = Number(prAgg?.commitCount ?? 0);
	const repositoryCount = Number(prAgg?.repositoryCount ?? 0);

	const activityScore = Math.min(20, prCount * 2);
	const importedScore = existing?.importedSource ? 48 : 0;
	const computedScore = boundedConfidence(
		reportScore + signalScore + activityScore + importedScore
	);
	const isAllowed = user.isKnownGithubBot || existing?.status === "allow";
	const score = isAllowed ? 0 : computedScore;
	const status = riskStatusForScore({ isAllowed, score });

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
		reasonCodesJson: json([...mergeReasonCodes(existing, reportAgg)]),
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

	const [[reportAgg], [signalAgg], [prAgg], [existing], perReporter] =
		await Promise.all([
			reportAggregatesQuery(targetUserId),
			signalAggregatesQuery(targetUserId),
			pullRequestAggregatesQuery(targetUserId),
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

export type CorrectionKind = "allow" | "confirm" | "dismiss" | "reset";

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
				with: { targetUser: true },
			}),
			database.query.Repository.findMany(),
			database.query.SourceImport.findMany({
				orderBy: { importedAt: "desc" },
			}),
			database.query.BotSignal.findMany(),
			database.query.PullRequest.findMany(),
		]);

	return { imports, profiles, pullRequests, reports, repositories, signals };
};

export type DirectoryPullRequest = PullRequestSelect;
