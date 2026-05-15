import { and, eq } from "drizzle-orm";

import type { ReasonCode } from "@/constants/reason-codes";
import {
	REASON_CAUSES,
	REASON_DESCRIPTIONS,
	REASON_LABELS,
} from "@/constants/reason-codes";
import type { ReportStatus } from "@/constants/report-statuses";
import type { RiskStatus } from "@/constants/risk-statuses";
import {
	RISK_SCORE_BANDS,
	RISK_STATUS_DESCRIPTIONS,
	RISK_STATUS_LABELS,
	riskStatusForScore,
} from "@/constants/risk-statuses";
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

import {
	type ClankerFilters,
	filterClankers,
	filterProtectors,
	type ProtectorFilters,
} from "./directory-filters";

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

const CLANKER_LEADERBOARD_CREDIT = {
	creator: "@heyandras",
	creator_url: "https://x.com/heyandras",
	inspiration_url: "https://clankers-leaderboard.pages.dev/",
	note: "Initial inspiration and first clanker data layer.",
} as const;

const riskStatusDetails = (status: RiskStatus) => ({
	description: RISK_STATUS_DESCRIPTIONS[status],
	label: RISK_STATUS_LABELS[status],
	status,
});

const reasonDetails = (reasons: ReasonCode[]) =>
	reasons.map((reason) => ({
		causes: REASON_CAUSES[reason],
		code: reason,
		description: REASON_DESCRIPTIONS[reason],
		label: REASON_LABELS[reason],
	}));

const scoreDetails = (score: number) => ({
	bands: RISK_SCORE_BANDS.map((band) => ({
		label: RISK_STATUS_LABELS[band.status],
		max: band.max,
		min: band.min,
		status: band.status,
	})),
	method:
		"Score combines maintainer reports, repeated observations, PR activity, AI review signals, and imported source matches. It is a review aid, not a final accusation.",
	value: score,
});

const isMissingBindingError = (caught: unknown) =>
	caught instanceof Error &&
	(caught.message.includes("Missing Cloudflare D1 binding") ||
		caught.message.includes("no such table"));

const emptyDashboard = () => ({
	protectors: [],
	imports: [],
	reports: [],
	riskProfiles: [],
	stats: {
		activeRepositories: 0,
		blockedUsers: 0,
		highRiskUsers: 0,
		importedUsers: 0,
		openReports: 0,
		reviewUsers: 0,
		signals: 0,
		trackedPrs: 0,
		trackedUsers: 0,
	},
});

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
	if (status === "needs_review") {
		return reporterIsMaintainer ? 14 : 4;
	}
	if (status === "pending") {
		return reporterIsMaintainer ? 6 : 2;
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
	if (status === "needs_review") {
		return reporterIsMaintainer ? 12 : 3;
	}
	return reporterIsMaintainer ? 6 : 1;
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
	if (report.status === "dismissed") {
		return 0;
	}
	const statusBoost = report.status === "validated" ? 12 : 0;
	return (
		reportBaseScore(report) + reportAiBoost(report.aiVerdict) + statusBoost
	);
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

	const reportScore = reports.reduce(
		(sum, report) => sum + scoreReport(report),
		0
	);
	const signalScore = signals.reduce((sum, signal) => sum + signal.weight, 0);
	const activityScore = Math.min(20, prs.length * 2);
	const importedScore = existing[0]?.importedSource ? 48 : 0;
	const computedScore = boundedConfidence(
		Math.max(
			existing[0]?.score ?? 0,
			reportScore + signalScore + activityScore + importedScore
		)
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

export const listDirectoryDashboard = async () => {
	try {
		const [profiles, reports, repositories, imports, signals] =
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
			]);

		const pullRequests = await database.query.PullRequest.findMany();
		const riskProfiles = profiles.map((profile) => {
			const status = riskStatusForScore({
				isAllowed: profile.status === "allow",
				score: profile.score,
			});
			return {
				avatarUrl: profile.targetUser.avatarUrl,
				confidence: profile.confidence,
				commitCount: profile.commitCount,
				githubUserId: profile.targetUser.githubUserId,
				htmlUrl: profile.targetUser.htmlUrl,
				importedSource: profile.importedSource,
				lastSeenAt: profile.lastSeenAt,
				login: profile.targetUser.login,
				prCount: profile.prCount,
				reasonCodes: parseJsonArray<ReasonCode>(profile.reasonCodesJson),
				reportCount: profile.reportCount,
				repositoryCount: profile.repositoryCount,
				score: profile.score,
				status,
				summary: profile.summary,
				validatedReportCount: profile.validatedReportCount,
			};
		});
		const catcherMap = new Map<
			string,
			{
				login: string;
				reports: number;
				score: number;
				validatedReports: number;
			}
		>();
		for (const report of reports) {
			const current = catcherMap.get(report.reporterLogin) ?? {
				login: report.reporterLogin,
				reports: 0,
				score: 0,
				validatedReports: 0,
			};
			current.reports += 1;
			current.validatedReports += report.status === "validated" ? 1 : 0;
			current.score += report.reporterIsMaintainer ? 12 : 4;
			current.score += report.status === "validated" ? 10 : 0;
			catcherMap.set(report.reporterLogin, current);
		}

		return {
			protectors: [...catcherMap.values()].sort((a, b) => b.score - a.score),
			imports: imports.map((item) => ({
				importedAt: item.importedAt,
				itemCount: item.itemCount,
				sourceName: item.sourceName,
				sourceUrl: item.sourceUrl,
				status: item.status,
			})),
			reports: reports.map((report) => ({
				aiRationale: report.aiRationale,
				aiVerdict: report.aiVerdict,
				confidence: report.confidence,
				createdAt: report.createdAt,
				id: report.id,
				reasonCode: report.reasonCode,
				reasonText: report.reasonText,
				reporterAssociation: report.reporterAssociation,
				reporterIsMaintainer: report.reporterIsMaintainer,
				reporterLogin: report.reporterLogin,
				sourceUrl: report.sourceUrl,
				status: report.status,
				targetLogin: report.targetUser.login,
			})),
			riskProfiles,
			stats: {
				activeRepositories: repositories.filter((repo) => repo.isActive).length,
				blockedUsers: riskProfiles.filter(
					(profile) => profile.status === "block"
				).length,
				highRiskUsers: riskProfiles.filter(
					(profile) => profile.status === "high_risk"
				).length,
				importedUsers: profiles.filter((profile) => profile.importedSource)
					.length,
				openReports: reports.filter(
					(report) =>
						report.status === "pending" || report.status === "needs_review"
				).length,
				reviewUsers: profiles.filter((profile) => profile.status === "review")
					.length,
				signals: signals.length,
				trackedPrs: pullRequests.length,
				trackedUsers: profiles.length,
			},
		};
	} catch (caught) {
		if (isMissingBindingError(caught)) {
			return emptyDashboard();
		}
		throw caught;
	}
};

export const listPublicFeed = async () => {
	const dashboard = await listDirectoryDashboard();
	const riskyUsers = dashboard.riskProfiles
		.filter((profile) => profile.status !== "allow")
		.map((profile) => ({
			confidence: profile.confidence / 100,
			evidence_summary: profile.summary,
			github_user_id: profile.githubUserId,
			last_seen: new Date(profile.lastSeenAt * 1000).toISOString(),
			login: profile.login,
			platform: "github",
			reason_details: reasonDetails(profile.reasonCodes),
			reasons: profile.reasonCodes,
			status: profile.status,
			status_detail: riskStatusDetails(profile.status),
			url: profile.htmlUrl,
		}));
	return {
		credits: CLANKER_LEADERBOARD_CREDIT,
		directory_url: "https://oss-protector.raedbahri90.workers.dev",
		generated_at: new Date().toISOString(),
		protectors: dashboard.protectors.map((protector) => ({
			login: protector.login,
			reports: protector.reports,
			score: protector.score,
			validated_reports: protector.validatedReports,
		})),
		risky_users: riskyUsers,
		schema_version: "2026-05-15",
		source: "oss-protector",
		users: riskyUsers,
	};
};

export const listClankersApi = async (filters: ClankerFilters) => {
	const dashboard = await listDirectoryDashboard();
	const clankers = filterClankers(dashboard.riskProfiles, filters);

	return {
		clankers: clankers.map((profile) => ({
			confidence: profile.confidence / 100,
			evidence_summary: profile.summary,
			github_user_id: profile.githubUserId,
			last_seen: new Date(profile.lastSeenAt * 1000).toISOString(),
			login: profile.login,
			platform: "github",
			reason_details: reasonDetails(profile.reasonCodes),
			reasons: profile.reasonCodes,
			score: profile.score,
			score_detail: scoreDetails(profile.score),
			status: profile.status,
			status_detail: riskStatusDetails(profile.status),
			url: profile.htmlUrl,
		})),
		count: clankers.length,
		credits: CLANKER_LEADERBOARD_CREDIT,
		filters,
		generated_at: new Date().toISOString(),
		schema_version: "2026-05-15",
		source: "oss-protector",
		total_available: dashboard.riskProfiles.filter(
			(profile) => profile.status !== "allow"
		).length,
	};
};

export const listProtectorsApi = async (filters: ProtectorFilters) => {
	const dashboard = await listDirectoryDashboard();
	const protectors = filterProtectors(dashboard.protectors, filters);

	return {
		count: protectors.length,
		credits: CLANKER_LEADERBOARD_CREDIT,
		filters,
		generated_at: new Date().toISOString(),
		protectors: protectors.map((protector) => ({
			login: protector.login,
			reports: protector.reports,
			score: protector.score,
			validated_reports: protector.validatedReports,
		})),
		schema_version: "2026-05-15",
		source: "oss-protector",
		total_available: dashboard.protectors.length,
	};
};

export type DirectoryDashboard = Awaited<
	ReturnType<typeof listDirectoryDashboard>
>;
export type DirectoryPullRequest = PullRequestSelect;
