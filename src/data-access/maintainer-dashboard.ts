import { and, count, countDistinct, desc, eq, inArray } from "drizzle-orm";

import type { ReasonCode } from "@/constants/reason-codes";
import type { ReportStatus } from "@/constants/report-statuses";
import {
	type AppealReviewItem,
	listAppealsForReview,
} from "@/data-access/appeals";
import { listMaintainerInstallationIds } from "@/data-access/maintainers";
import {
	listRepoDecisionsForMaintainer,
	type RepoDecisionRow,
} from "@/data-access/repo-decisions";
import { database } from "@/db";
import {
	BotReport,
	BotSignal,
	GithubUser,
	PullRequest,
	Repository,
	RiskProfile,
} from "@/db/schema";
import { parseJsonObject } from "@/lib/json";

export interface DashboardRepo {
	flaggedCount: number;
	fullName: string;
	id: string;
	isPrivate: boolean;
	name: string;
	ownerLogin: string;
	reportCount: number;
}

export interface DashboardQueueItem {
	avatarUrl: null | string;
	confidence: number;
	createdAt: number;
	login: string;
	prNumber: null | number;
	prUrl: null | string;
	reasonCode: ReasonCode;
	repoFullName: string;
	reportId: string;
	score: number;
	status: ReportStatus;
}

export interface DashboardAllowEntry {
	avatarUrl: null | string;
	login: string;
	summary: null | string;
	updatedAt: number;
}

export type CorrectionKind = "allow" | "confirm" | "dismiss" | "reset";

export type DashboardActivityItem =
	| {
			eventType: "report";
			createdAt: number;
			id: string;
			login: string;
			reasonCode: ReasonCode;
			repoFullName: string;
			status: ReportStatus;
	  }
	| {
			eventType: "correction";
			createdAt: number;
			id: string;
			login: string;
			correctionKind: CorrectionKind;
			correctedByLogin: string;
			repoFullName: string | null;
	  }
	| {
			eventType: "repo_decision";
			createdAt: number;
			id: string;
			login: string;
			decision: "allow" | "block";
			correctedByLogin: string;
			repoFullName: string;
			note: string | null;
	  };

export interface MaintainerDashboard {
	activity: DashboardActivityItem[];
	allowlist: DashboardAllowEntry[];
	appeals: AppealReviewItem[];
	queue: DashboardQueueItem[];
	repoOverrides: RepoDecisionRow[];
	repos: DashboardRepo[];
	stats: {
		allowedCount: number;
		appealCount: number;
		blockedCount: number;
		overrideCount: number;
		queueCount: number;
		repoCount: number;
	};
}

const QUEUE_STATUSES = ["pending", "needs_review"] as const;
const BLOCKED_STATUSES = ["block", "high_risk"] as const;
const ACTIVITY_LIMIT = 30;
const QUEUE_LIMIT = 50;
const CORRECTION_SIGNAL_TYPES = [
	"maintainer_correction_allow",
	"maintainer_correction_confirm",
	"maintainer_correction_dismiss",
	"maintainer_correction_reset",
] as const;

const correctionKindFromSignalType = (signalType: string): CorrectionKind => {
	if (signalType === "maintainer_correction_allow") {
		return "allow";
	}
	if (signalType === "maintainer_correction_confirm") {
		return "confirm";
	}
	if (signalType === "maintainer_correction_dismiss") {
		return "dismiss";
	}
	return "reset";
};

const emptyDashboard = (
	appeals: AppealReviewItem[] = []
): MaintainerDashboard => ({
	activity: [],
	allowlist: [],
	appeals,
	queue: [],
	repoOverrides: [],
	repos: [],
	stats: {
		allowedCount: 0,
		appealCount: appeals.length,
		blockedCount: 0,
		overrideCount: 0,
		queueCount: 0,
		repoCount: 0,
	},
});

// Everything the maintainer console renders, scoped to the installations the
// signed-in user maintains. Returns an empty shape (not an error) when the user
// maintains nothing yet, so the UI can show friendly empty states.
export async function getMaintainerDashboard(
	userId: string
): Promise<MaintainerDashboard> {
	// Appeals are global moderation items (not repo-scoped), so they load
	// independently of which installations this user maintains.
	const [appeals, installationIds] = await Promise.all([
		listAppealsForReview(),
		listMaintainerInstallationIds(userId),
	]);
	if (installationIds.length === 0) {
		return emptyDashboard(appeals);
	}

	const repoRows = await database
		.select({
			fullName: Repository.fullName,
			id: Repository.id,
			isPrivate: Repository.isPrivate,
			name: Repository.name,
			ownerLogin: Repository.ownerLogin,
		})
		.from(Repository)
		.where(
			and(
				inArray(Repository.installationId, installationIds),
				eq(Repository.isActive, true)
			)
		)
		.orderBy(Repository.fullName);
	const repoIds = repoRows.map((row) => row.id);
	if (repoIds.length === 0) {
		return emptyDashboard(appeals);
	}

	const [queueRows, repoCounts, reportTargets, prAuthors, reportActivityRows] =
		await Promise.all([
			database
				.select({
					avatarUrl: GithubUser.avatarUrl,
					confidence: BotReport.confidence,
					createdAt: BotReport.createdAt,
					login: GithubUser.login,
					prNumber: PullRequest.number,
					prUrl: PullRequest.htmlUrl,
					reasonCode: BotReport.reasonCode,
					reportId: BotReport.id,
					repoFullName: Repository.fullName,
					score: RiskProfile.score,
					status: BotReport.status,
				})
				.from(BotReport)
				.innerJoin(Repository, eq(Repository.id, BotReport.repositoryId))
				.innerJoin(GithubUser, eq(GithubUser.id, BotReport.targetUserId))
				.leftJoin(PullRequest, eq(PullRequest.id, BotReport.pullRequestId))
				.leftJoin(
					RiskProfile,
					eq(RiskProfile.targetUserId, BotReport.targetUserId)
				)
				.where(
					and(
						inArray(BotReport.repositoryId, repoIds),
						inArray(BotReport.status, [...QUEUE_STATUSES])
					)
				)
				.orderBy(desc(BotReport.createdAt))
				.limit(QUEUE_LIMIT),
			database
				.select({
					flaggedCount: countDistinct(BotReport.targetUserId),
					reportCount: count(),
					repositoryId: BotReport.repositoryId,
				})
				.from(BotReport)
				.where(inArray(BotReport.repositoryId, repoIds))
				.groupBy(BotReport.repositoryId),
			database
				.selectDistinct({ targetUserId: BotReport.targetUserId })
				.from(BotReport)
				.where(inArray(BotReport.repositoryId, repoIds)),
			database
				.selectDistinct({ authorUserId: PullRequest.authorUserId })
				.from(PullRequest)
				.where(inArray(PullRequest.repositoryId, repoIds)),
			database
				.select({
					createdAt: BotReport.createdAt,
					id: BotReport.id,
					login: GithubUser.login,
					reasonCode: BotReport.reasonCode,
					repoFullName: Repository.fullName,
					status: BotReport.status,
				})
				.from(BotReport)
				.innerJoin(Repository, eq(Repository.id, BotReport.repositoryId))
				.innerJoin(GithubUser, eq(GithubUser.id, BotReport.targetUserId))
				.where(inArray(BotReport.repositoryId, repoIds))
				.orderBy(desc(BotReport.createdAt))
				.limit(ACTIVITY_LIMIT),
		]);

	const candidateIds = [
		...new Set([
			...reportTargets.map((row) => row.targetUserId),
			...prAuthors.map((row) => row.authorUserId),
		]),
	];

	const correctionActivityRows =
		candidateIds.length === 0
			? []
			: await database
					.select({
						id: BotSignal.id,
						login: GithubUser.login,
						metadataJson: BotSignal.metadataJson,
						observedAt: BotSignal.observedAt,
						repoFullName: Repository.fullName,
						signalType: BotSignal.signalType,
					})
					.from(BotSignal)
					.innerJoin(GithubUser, eq(GithubUser.id, BotSignal.targetUserId))
					.leftJoin(Repository, eq(Repository.id, BotSignal.repositoryId))
					.where(
						and(
							inArray(BotSignal.targetUserId, candidateIds),
							inArray(BotSignal.signalType, [...CORRECTION_SIGNAL_TYPES])
						)
					)
					.orderBy(desc(BotSignal.observedAt))
					.limit(ACTIVITY_LIMIT);

	const [allowRows, blockedRows] = await Promise.all([
		candidateIds.length === 0
			? Promise.resolve([])
			: database
					.select({
						avatarUrl: GithubUser.avatarUrl,
						login: GithubUser.login,
						summary: RiskProfile.summary,
						updatedAt: RiskProfile.updatedAt,
					})
					.from(RiskProfile)
					.innerJoin(GithubUser, eq(GithubUser.id, RiskProfile.targetUserId))
					.where(
						and(
							eq(RiskProfile.status, "allow"),
							inArray(RiskProfile.targetUserId, candidateIds)
						)
					)
					.orderBy(desc(RiskProfile.updatedAt)),
		candidateIds.length === 0
			? Promise.resolve([])
			: database
					.select({ targetUserId: RiskProfile.targetUserId })
					.from(RiskProfile)
					.where(
						and(
							inArray(RiskProfile.status, [...BLOCKED_STATUSES]),
							inArray(RiskProfile.targetUserId, candidateIds)
						)
					),
	]);

	const countsById = new Map(
		repoCounts.map((row) => [
			row.repositoryId,
			{ flaggedCount: row.flaggedCount, reportCount: row.reportCount },
		])
	);
	const repos: DashboardRepo[] = repoRows.map((row) => ({
		flaggedCount: countsById.get(row.id)?.flaggedCount ?? 0,
		fullName: row.fullName,
		id: row.id,
		isPrivate: row.isPrivate,
		name: row.name,
		ownerLogin: row.ownerLogin,
		reportCount: countsById.get(row.id)?.reportCount ?? 0,
	}));

	const queue: DashboardQueueItem[] = queueRows.map((row) => ({
		avatarUrl: row.avatarUrl,
		confidence: row.confidence,
		createdAt: row.createdAt,
		login: row.login,
		prNumber: row.prNumber ?? null,
		prUrl: row.prUrl ?? null,
		reasonCode: row.reasonCode as ReasonCode,
		reportId: row.reportId,
		repoFullName: row.repoFullName,
		score: row.score ?? 0,
		status: row.status as ReportStatus,
	}));

	const allowlist: DashboardAllowEntry[] = allowRows.map((row) => ({
		avatarUrl: row.avatarUrl,
		login: row.login,
		summary: row.summary,
		updatedAt: row.updatedAt,
	}));

	const reportActivity: DashboardActivityItem[] = reportActivityRows.map(
		(row) => ({
			createdAt: row.createdAt,
			eventType: "report" as const,
			id: row.id,
			login: row.login,
			reasonCode: row.reasonCode as ReasonCode,
			repoFullName: row.repoFullName,
			status: row.status as ReportStatus,
		})
	);
	const correctionActivity: DashboardActivityItem[] =
		correctionActivityRows.flatMap((row) => {
			const metadata = parseJsonObject<{ correctedByLogin?: string }>(
				row.metadataJson
			);
			const correctedByLogin = metadata.correctedByLogin?.trim();
			if (!correctedByLogin) {
				return [];
			}
			return [
				{
					correctedByLogin,
					correctionKind: correctionKindFromSignalType(row.signalType),
					createdAt: row.observedAt,
					eventType: "correction" as const,
					id: row.id,
					login: row.login,
					repoFullName: row.repoFullName ?? null,
				},
			];
		});
	const repoOverrides = await listRepoDecisionsForMaintainer(userId);
	const repoDecisionActivity: DashboardActivityItem[] = repoOverrides.map(
		(row) => ({
			correctedByLogin: row.correctedByLogin,
			createdAt: row.updatedAt,
			decision: row.decision,
			eventType: "repo_decision" as const,
			id: `repo-decision-${row.id}`,
			login: row.login,
			note: row.note,
			repoFullName: row.repoFullName,
		})
	);
	const activity: DashboardActivityItem[] = [
		...reportActivity,
		...correctionActivity,
		...repoDecisionActivity,
	]
		.sort((a, b) => b.createdAt - a.createdAt)
		.slice(0, ACTIVITY_LIMIT);

	return {
		activity,
		allowlist,
		appeals,
		queue,
		repoOverrides,
		repos,
		stats: {
			allowedCount: allowlist.length,
			appealCount: appeals.length,
			blockedCount: blockedRows.length,
			overrideCount: repoOverrides.length,
			queueCount: queue.length,
			repoCount: repos.length,
		},
	};
}
