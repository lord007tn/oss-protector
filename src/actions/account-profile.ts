import { desc, eq } from "drizzle-orm";

import type { ReasonCode } from "@/constants/reason-codes";
import type { ReportStatus } from "@/constants/report-statuses";
import type { RiskStatus } from "@/constants/risk-statuses";
import { riskStatusForScore } from "@/constants/risk-statuses";
import { database, hasDatabaseBinding } from "@/db";
import { isDatabaseReadError } from "@/db/errors";
import {
	BotReport,
	BotSignal,
	GithubUser,
	PullRequest,
	Repository,
	RiskProfile,
} from "@/db/schema";
import { parseJsonArray, parseJsonObject } from "@/lib/json";

export interface PublicPullRequest {
	htmlUrl: string;
	lastSeenAt: number;
	number: number;
	repositoryFullName: string;
	state: string;
	title: string;
}

export interface AccountReport {
	aiVerdict: null | string;
	confidence: number;
	createdAt: number;
	reasonCode: ReasonCode;
	reporterLogin: string;
	sourceUrl: null | string;
	status: ReportStatus;
}

export interface AccountSignal {
	observedAt: number;
	reasonCode: ReasonCode | null;
	repositoryFullName: null | string;
	signalType: string;
	source: string;
	sourceUrl: null | string;
	weight: number;
}

export interface AccountProfileResult {
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
	reports: AccountReport[];
	score: number;
	signals: AccountSignal[];
	status: RiskStatus;
	summary: null | string;
	totalPrs: number;
	validatedReportCount: number;
}

const PR_LIMIT = 40;
const REPORT_LIMIT = 40;
const SIGNAL_LIMIT = 40;

export const emptyAccountProfile = (login: string): AccountProfileResult => ({
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
	signals: [],
	status: "watch",
	summary: null,
	totalPrs: 0,
	validatedReportCount: 0,
});

export const getAccountProfile = async (
	rawLogin: string
): Promise<AccountProfileResult> => {
	const login = rawLogin.trim();
	if (!login) {
		return emptyAccountProfile(rawLogin);
	}
	if (!hasDatabaseBinding) {
		return emptyAccountProfile(login);
	}

	try {
		const [user] = await database
			.select()
			.from(GithubUser)
			.where(eq(GithubUser.login, login))
			.limit(1);

		if (!user) {
			return emptyAccountProfile(login);
		}

		const [[profile], reports, prs, signals] = await Promise.all([
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
					reporterIsMaintainer: BotReport.reporterIsMaintainer,
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
			database
				.select({
					isPrivate: Repository.isPrivate,
					metadataJson: BotSignal.metadataJson,
					observedAt: BotSignal.observedAt,
					repositoryFullName: Repository.fullName,
					signalType: BotSignal.signalType,
					source: BotSignal.source,
					sourceUrl: BotSignal.sourceUrl,
					weight: BotSignal.weight,
				})
				.from(BotSignal)
				.leftJoin(Repository, eq(Repository.id, BotSignal.repositoryId))
				.where(eq(BotSignal.targetUserId, user.id))
				.orderBy(desc(BotSignal.observedAt))
				.limit(SIGNAL_LIMIT),
		]);

		if (profile?.status === "allow") {
			return emptyAccountProfile(login);
		}

		const publicPrs = prs.filter((row) => !row.isPrivate).slice(0, PR_LIMIT);

		// Hide source URLs that point at private repos. Public commenters
		// browsing the directory don't need to know a report was filed inside
		// a private repo — that's privileged context for the maintainer.
		const sanitizedReports: AccountReport[] = reports.flatMap((row) =>
			row.reporterIsMaintainer && !row.repositoryIsPrivate
				? [
						{
							aiVerdict: row.aiVerdict,
							confidence: row.confidence,
							createdAt: row.createdAt,
							reasonCode: row.reasonCode,
							reporterLogin: row.reporterLogin,
							sourceUrl: row.sourceUrl,
							status: row.status,
						},
					]
				: []
		);

		const reasonCodes = parseJsonArray<ReasonCode>(profile?.reasonCodesJson);
		const sanitizedSignals: AccountSignal[] = signals.flatMap((row) => {
			if (row.isPrivate) {
				return [];
			}
			const metadata = parseJsonObject<{ reasonCode: ReasonCode }>(
				row.metadataJson
			);
			return [
				{
					observedAt: row.observedAt,
					reasonCode:
						metadata.reasonCode && reasonCodes.includes(metadata.reasonCode)
							? metadata.reasonCode
							: null,
					repositoryFullName: row.repositoryFullName ?? null,
					signalType: row.signalType,
					source: row.source,
					sourceUrl: row.sourceUrl,
					weight: row.weight,
				},
			];
		});
		const publishedPrCount = profile?.importedSource
			? Math.max(profile.prCount, publicPrs.length)
			: publicPrs.length;
		const validatedReportCount = sanitizedReports.filter(
			(report) => report.status === "validated"
		).length;
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
			privatePrCount: 0,
			prCount: publishedPrCount,
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
			reportCount: sanitizedReports.length,
			score,
			signals: sanitizedSignals,
			status,
			summary: profile?.summary ?? null,
			totalPrs: publishedPrCount,
			validatedReportCount,
		};
	} catch (caught) {
		if (isDatabaseReadError(caught)) {
			// Public read-only page: degrade to an empty profile on any DB read
			// failure (missing binding, schema drift, transient D1 error) instead of
			// 500-ing during SSR. Non-DB errors still throw so they stay observable.
			console.error("getAccountProfile read failed", caught);
			return emptyAccountProfile(login);
		}
		throw caught;
	}
};
