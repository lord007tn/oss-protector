import { and, desc, eq, inArray } from "drizzle-orm";

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
		weight: 2,
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

const reportBaseScore = ({
	reporterIsMaintainer,
	status,
}: {
	reporterIsMaintainer: boolean;
	status: string;
}) => {
	if (status === "validated") {
		return reporterIsMaintainer ? 28 : 6;
	}
	return 0;
};

const reportAiBoost = (verdict: null | string) => {
	if (verdict === "likely_abuse") {
		return 14;
	}
	if (verdict === "unclear") {
		return 4;
	}
	return 0;
};

const scoreReport = (report: {
	aiVerdict: null | string;
	reporterIsMaintainer: boolean;
	status: string;
}) => {
	if (report.status !== "validated") {
		return 0;
	}
	return reportBaseScore(report) + reportAiBoost(report.aiVerdict) + 12;
};

const riskSummary = ({
	existingSummary,
	reporterCount,
	status,
}: {
	existingSummary?: null | string;
	reporterCount: number;
	status: RiskStatus;
}) => {
	if (status === "allow") {
		return "Known GitHub bot account; kept on the allow list.";
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

export const recalculateRiskProfile = async (targetUserId: string) => {
	const [user] = await database
		.select()
		.from(GithubUser)
		.where(eq(GithubUser.id, targetUserId))
		.limit(1);
	if (!user) {
		return null;
	}

	const reports = await database
		.select()
		.from(BotReport)
		.where(eq(BotReport.targetUserId, targetUserId));
	const signals = await database
		.select()
		.from(BotSignal)
		.where(eq(BotSignal.targetUserId, targetUserId));
	const prs = await database
		.select()
		.from(PullRequest)
		.where(eq(PullRequest.authorUserId, targetUserId));

	const existing = await database
		.select()
		.from(RiskProfile)
		.where(eq(RiskProfile.targetUserId, targetUserId))
		.limit(1);

	const reasonCodes = new Set<ReasonCode>(
		parseJsonArray<ReasonCode>(existing[0]?.reasonCodesJson)
	);
	for (const report of reports) {
		reasonCodes.add(report.reasonCode);
	}

	const validatedReportIds = new Set(
		reports
			.filter((report) => report.status === "validated")
			.map((report) => report.id)
	);
	const reportScore = reports.reduce(
		(sum, report) => sum + scoreReport(report),
		0
	);
	const signalScore = signals.reduce((sum, signal) => {
		if (signal.signalType !== "maintainer_report") {
			return sum + signal.weight;
		}
		return signal.reportId && validatedReportIds.has(signal.reportId)
			? sum + signal.weight
			: sum;
	}, 0);
	const activityScore = Math.min(20, prs.length * 2);
	const importedScore = existing[0]?.importedSource ? 48 : 0;
	const computedScore = boundedConfidence(
		reportScore + signalScore + activityScore + importedScore
	);
	const isAllowed = user.isKnownGithubBot || existing[0]?.status === "allow";
	const score = isAllowed ? 0 : computedScore;
	const status = riskStatusForScore({ isAllowed, score });

	const repositoryIds = new Set(
		prs.map((pr) => pr.repositoryId).filter((value): value is string => !!value)
	);
	const commitCount = prs.reduce((sum, pr) => sum + pr.commitCount, 0);
	const lastSeenAt = Math.max(
		user.lastSeenAt,
		...prs.map((pr) => pr.lastSeenAt),
		...reports.map((report) => report.createdAt),
		...signals.map((signal) => signal.observedAt)
	);
	const reporterCount = new Set(reports.map((report) => report.reporterLogin))
		.size;
	const summary = riskSummary({
		existingSummary: existing[0]?.summary,
		reporterCount,
		status,
	});

	const values = {
		confidence: score,
		commitCount,
		importedSource: existing[0]?.importedSource ?? null,
		lastSeenAt,
		lastSignalAt:
			signals.at(-1)?.observedAt ?? existing[0]?.lastSignalAt ?? null,
		prCount: Math.max(existing[0]?.prCount ?? 0, prs.length),
		reasonCodesJson: json([...reasonCodes]),
		reportCount: reports.length,
		repositoryCount: repositoryIds.size || existing[0]?.repositoryCount || 0,
		score,
		status,
		summary,
		targetUserId,
		updatedAt: unixNow(),
		validatedReportCount: reports.filter(
			(report) => report.status === "validated"
		).length,
	};

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

const correctionMetadata = (
	kind: "allow" | "confirm" | "dismiss",
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
	kind: "allow" | "confirm" | "dismiss";
	metadata?: Record<string, unknown>;
	weight: number;
}) =>
	recordSignal({
		metadata: correctionMetadata(kind, input, metadata),
		pullRequestId: input.pullRequestId ?? null,
		repositoryId: input.repositoryId ?? null,
		signalType: "maintainer_correction",
		source: "github_comment_command",
		sourceUrl: input.sourceUrl,
		targetUserId: input.targetUserId,
		weight,
	});

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

	await recordCorrectionSignal({
		input,
		kind: "dismiss",
		metadata: { dismissedReportIds: updated.map((row) => row.id) },
		weight: -30,
	});
	const profile = await recalculateRiskProfile(input.targetUserId);
	return { dismissedCount: updated.length, profile };
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
