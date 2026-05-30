import { count, countDistinct, desc, eq } from "drizzle-orm";

import type { ReasonCode } from "@/constants/reason-codes";
import type { ReportStatus } from "@/constants/report-statuses";
import type { RiskStatus } from "@/constants/risk-statuses";
import { database, hasDatabaseBinding } from "@/db";
import { isMissingBindingError } from "@/db/errors";
import {
	BotReport,
	GithubUser,
	PullRequest,
	Repository,
	RiskProfile,
} from "@/db/schema";

export interface RepoFlag {
	avatarUrl: null | string;
	confidence: number;
	createdAt: number;
	login: string;
	prNumber: null | number;
	prUrl: null | string;
	reasonCode: ReasonCode;
	status: ReportStatus;
}

export interface RepoTopAccount {
	avatarUrl: null | string;
	login: string;
	reportCount: number;
	score: number;
	status: RiskStatus;
}

export interface RepoProfileResult {
	flaggedAccounts: number;
	flags: RepoFlag[];
	fullName: string;
	htmlUrl: string;
	isPrivate: boolean;
	isProtected: boolean;
	name: string;
	ownerLogin: string;
	reportCount: number;
	topAccounts: RepoTopAccount[];
	tracked: boolean;
}

const FLAG_LIMIT = 10;
const TOP_ACCOUNT_LIMIT = 5;

export const emptyRepoProfile = (
	owner: string,
	name: string
): RepoProfileResult => ({
	flaggedAccounts: 0,
	flags: [],
	fullName: `${owner}/${name}`,
	htmlUrl: `https://github.com/${owner}/${name}`,
	isPrivate: false,
	isProtected: false,
	name,
	ownerLogin: owner,
	reportCount: 0,
	topAccounts: [],
	tracked: false,
});

export const getRepoProfile = async (
	rawOwner: string,
	rawName: string
): Promise<RepoProfileResult> => {
	const owner = rawOwner.trim();
	const name = rawName.trim();
	const fullName = `${owner}/${name}`;
	if (!(owner && name && hasDatabaseBinding)) {
		return emptyRepoProfile(owner, name);
	}

	try {
		const [repo] = await database
			.select()
			.from(Repository)
			.where(eq(Repository.fullName, fullName))
			.limit(1);
		if (!repo) {
			return emptyRepoProfile(owner, name);
		}

		const isProtected = repo.isActive && repo.installationId !== null;
		const base = {
			...emptyRepoProfile(owner, name),
			fullName,
			htmlUrl: repo.htmlUrl ?? `https://github.com/${fullName}`,
			isProtected,
			name: repo.name,
			ownerLogin: repo.ownerLogin,
			tracked: true,
		};

		// Never expose private-repo flag detail on a public page.
		if (repo.isPrivate) {
			return { ...base, isPrivate: true };
		}

		const [flags, [counts], topAccounts] = await Promise.all([
			database
				.select({
					avatarUrl: GithubUser.avatarUrl,
					confidence: BotReport.confidence,
					createdAt: BotReport.createdAt,
					login: GithubUser.login,
					prNumber: PullRequest.number,
					prUrl: PullRequest.htmlUrl,
					reasonCode: BotReport.reasonCode,
					status: BotReport.status,
				})
				.from(BotReport)
				.innerJoin(GithubUser, eq(GithubUser.id, BotReport.targetUserId))
				.leftJoin(PullRequest, eq(PullRequest.id, BotReport.pullRequestId))
				.where(eq(BotReport.repositoryId, repo.id))
				.orderBy(desc(BotReport.createdAt))
				.limit(FLAG_LIMIT),
			database
				.select({
					flaggedAccounts: countDistinct(BotReport.targetUserId),
					reportCount: count(),
				})
				.from(BotReport)
				.where(eq(BotReport.repositoryId, repo.id)),
			database
				.select({
					avatarUrl: GithubUser.avatarUrl,
					login: GithubUser.login,
					reportCount: count(),
					score: RiskProfile.score,
					status: RiskProfile.status,
				})
				.from(BotReport)
				.innerJoin(GithubUser, eq(GithubUser.id, BotReport.targetUserId))
				.leftJoin(
					RiskProfile,
					eq(RiskProfile.targetUserId, BotReport.targetUserId)
				)
				.where(eq(BotReport.repositoryId, repo.id))
				.groupBy(
					GithubUser.login,
					GithubUser.avatarUrl,
					RiskProfile.score,
					RiskProfile.status
				)
				.orderBy(desc(count()))
				.limit(TOP_ACCOUNT_LIMIT),
		]);

		return {
			...base,
			flaggedAccounts: Number(counts?.flaggedAccounts ?? 0),
			flags: flags.map((row) => ({
				avatarUrl: row.avatarUrl,
				confidence: row.confidence,
				createdAt: row.createdAt,
				login: row.login,
				prNumber: row.prNumber ?? null,
				prUrl: row.prUrl ?? null,
				reasonCode: row.reasonCode as ReasonCode,
				status: row.status as ReportStatus,
			})),
			reportCount: Number(counts?.reportCount ?? 0),
			topAccounts: topAccounts.map((row) => ({
				avatarUrl: row.avatarUrl,
				login: row.login,
				reportCount: Number(row.reportCount ?? 0),
				score: row.score ?? 0,
				status: (row.status ?? "watch") as RiskStatus,
			})),
		};
	} catch (caught) {
		if (isMissingBindingError(caught)) {
			return emptyRepoProfile(owner, name);
		}
		throw caught;
	}
};
