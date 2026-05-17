import { desc, eq } from "drizzle-orm";

import type { ReasonCode } from "@/constants/reason-codes";
import type { ReportStatus } from "@/constants/report-statuses";
import type { RiskStatus } from "@/constants/risk-statuses";
import { riskStatusForScore } from "@/constants/risk-statuses";
import { database } from "@/db";
import { isMissingBindingError } from "@/db/errors";
import {
	BotReport,
	GithubUser,
	PullRequest,
	Repository,
	RiskProfile,
} from "@/db/schema";
import { parseJsonArray } from "@/lib/json";

export interface PublicPullRequest {
	htmlUrl: string;
	lastSeenAt: number;
	number: number;
	repositoryFullName: string;
	state: string;
	title: string;
}

export interface ClankerReport {
	aiVerdict: null | string;
	confidence: number;
	createdAt: number;
	reasonCode: ReasonCode;
	reporterLogin: string;
	sourceUrl: null | string;
	status: ReportStatus;
}

export interface ClankerProfileResult {
	avatarUrl: null | string;
	confidence: number;
	htmlUrl: null | string;
	importedSource: null | string;
	lastSeenAt: number;
	login: string;
	notFound: boolean;
	prCount: number;
	privatePrCount: number;
	publicPrs: PublicPullRequest[];
	reasonCodes: ReasonCode[];
	reportCount: number;
	reports: ClankerReport[];
	score: number;
	status: RiskStatus;
	summary: null | string;
	totalPrs: number;
	validatedReportCount: number;
}

const PR_LIMIT = 40;
const REPORT_LIMIT = 40;

const emptyProfile = (login: string): ClankerProfileResult => ({
	avatarUrl: null,
	confidence: 0,
	htmlUrl: `https://github.com/${login}`,
	importedSource: null,
	lastSeenAt: 0,
	login,
	notFound: true,
	privatePrCount: 0,
	prCount: 0,
	publicPrs: [],
	reasonCodes: [],
	reports: [],
	reportCount: 0,
	score: 0,
	status: "watch",
	summary: null,
	totalPrs: 0,
	validatedReportCount: 0,
});

export const getClankerProfile = async (
	rawLogin: string
): Promise<ClankerProfileResult> => {
	const login = rawLogin.trim();
	if (!login) {
		return emptyProfile(rawLogin);
	}

	try {
		const [user] = await database
			.select()
			.from(GithubUser)
			.where(eq(GithubUser.login, login))
			.limit(1);

		if (!user) {
			return emptyProfile(login);
		}

		const [[profile], reports, prs] = await Promise.all([
			database
				.select()
				.from(RiskProfile)
				.where(eq(RiskProfile.targetUserId, user.id))
				.limit(1),
			database
				.select({
					aiVerdict: BotReport.aiVerdict,
					confidence: BotReport.confidence,
					createdAt: BotReport.createdAt,
					reasonCode: BotReport.reasonCode,
					reporterLogin: BotReport.reporterLogin,
					sourceUrl: BotReport.sourceUrl,
					status: BotReport.status,
					repositoryIsPrivate: Repository.isPrivate,
				})
				.from(BotReport)
				.leftJoin(Repository, eq(Repository.id, BotReport.repositoryId))
				.where(eq(BotReport.targetUserId, user.id))
				.orderBy(desc(BotReport.createdAt))
				.limit(REPORT_LIMIT),
			database
				.select({
					htmlUrl: PullRequest.htmlUrl,
					isPrivate: Repository.isPrivate,
					lastSeenAt: PullRequest.lastSeenAt,
					number: PullRequest.number,
					repositoryFullName: Repository.fullName,
					state: PullRequest.state,
					title: PullRequest.title,
				})
				.from(PullRequest)
				.innerJoin(Repository, eq(Repository.id, PullRequest.repositoryId))
				.where(eq(PullRequest.authorUserId, user.id))
				.orderBy(desc(PullRequest.lastSeenAt))
				.limit(200),
		]);

		const publicPrs = prs.filter((row) => !row.isPrivate).slice(0, PR_LIMIT);
		const privatePrCount =
			prs.length - prs.filter((row) => !row.isPrivate).length;

		// Hide source URLs that point at private repos. Public commenters
		// browsing the directory don't need to know a report was filed inside
		// a private repo — that's privileged context for the maintainer.
		const sanitizedReports: ClankerReport[] = reports.map((row) => ({
			aiVerdict: row.aiVerdict,
			confidence: row.confidence,
			createdAt: row.createdAt,
			reasonCode: row.reasonCode,
			reporterLogin: row.reporterLogin,
			sourceUrl: row.repositoryIsPrivate ? null : row.sourceUrl,
			status: row.status,
		}));

		const reasonCodes = parseJsonArray<ReasonCode>(profile?.reasonCodesJson);
		const score = profile?.score ?? 0;
		const status =
			profile?.status ??
			riskStatusForScore({ isAllowed: user.isKnownGithubBot, score });

		return {
			avatarUrl: user.avatarUrl,
			confidence: profile?.confidence ?? 0,
			htmlUrl: user.htmlUrl,
			importedSource: profile?.importedSource ?? null,
			lastSeenAt: profile?.lastSeenAt ?? user.lastSeenAt,
			login: user.login,
			notFound: false,
			privatePrCount,
			prCount: profile?.prCount ?? prs.length,
			publicPrs: publicPrs.map((row) => ({
				htmlUrl: row.htmlUrl,
				lastSeenAt: row.lastSeenAt,
				number: row.number,
				repositoryFullName: row.repositoryFullName,
				state: row.state,
				title: row.title,
			})),
			reasonCodes,
			reports: sanitizedReports,
			reportCount: profile?.reportCount ?? reports.length,
			score,
			status,
			summary: profile?.summary ?? null,
			totalPrs: prs.length,
			validatedReportCount: profile?.validatedReportCount ?? 0,
		};
	} catch (caught) {
		if (isMissingBindingError(caught)) {
			return emptyProfile(login);
		}
		throw caught;
	}
};
