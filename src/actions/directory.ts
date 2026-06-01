import type { ReasonCode } from "@/constants/reason-codes";
import {
	REASON_CAUSES,
	REASON_DESCRIPTIONS,
	REASON_LABELS,
} from "@/constants/reason-codes";
import type { RiskStatus } from "@/constants/risk-statuses";
import {
	RISK_SCORE_BANDS,
	RISK_STATUS_DESCRIPTIONS,
	RISK_STATUS_LABELS,
	riskStatusForScore,
} from "@/constants/risk-statuses";
import {
	type DirectoryCounts,
	getDirectoryAccountApiProfiles,
	getDirectoryCounts,
	getDirectoryDashboardRecords,
	recentWebhookEventsQuery,
} from "@/data-access/directory";
import { isDatabaseReadError } from "@/db/errors";
import {
	type AccountFilters,
	filterAccounts,
	filterProtectors,
	type ProtectorFilters,
} from "@/helpers/directory-filters";
import { parseJsonArray } from "@/lib/json";

const LEADERBOARD_CREDIT = {
	creator: "@heyandras",
	creator_url: "https://x.com/heyandras",
	inspiration_url: "https://clankers-leaderboard.pages.dev/",
	note: "Initial inspiration and seed data layer.",
} as const;

const PUBLIC_APP_URL = "https://oss-protector.raedbahri90.workers.dev";
const DELISTING = {
	appeal_url: `${PUBLIC_APP_URL}/appeal`,
	maintainer_command: "@oss-protector dismiss",
	note: "If you are listed and believe it is wrong, ask any maintainer of the repo where the report came from to run the maintainer command in any PR comment, or submit an appeal at the appeal URL.",
} as const;

type DashboardRecords = Awaited<
	ReturnType<typeof getDirectoryDashboardRecords>
>;
type DashboardReport = DashboardRecords["reports"][number];

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
		"Score combines validated maintainer reports, independently corroborated PR signals, repeated observations, and imported source matches. Submitted reports are tracked but do not affect public score until validated.",
	value: score,
});

const emptyDashboard = () => ({
	protectors: [],
	imports: [],
	reports: [],
	repositories: [] as { fullName: string; name: string; ownerLogin: string }[],
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
		watchUsers: 0,
	},
});

const protectorScoreForReport = (report: DashboardReport) => {
	if (report.status !== "validated") {
		return 0;
	}
	return report.reporterIsMaintainer ? 20 : 8;
};

const buildProtectors = (reports: DashboardRecords["reports"]) => {
	const protectorMap = new Map<
		string,
		{
			dismissedReports: number;
			login: string;
			needsReviewReports: number;
			reports: number;
			score: number;
			submittedReports: number;
			validatedReports: number;
		}
	>();

	for (const report of reports) {
		const current = protectorMap.get(report.reporterLogin) ?? {
			dismissedReports: 0,
			login: report.reporterLogin,
			needsReviewReports: 0,
			reports: 0,
			score: 0,
			submittedReports: 0,
			validatedReports: 0,
		};
		current.reports += 1;
		current.score += protectorScoreForReport(report);
		if (report.status === "validated") {
			current.validatedReports += 1;
		} else if (report.status === "needs_review") {
			current.needsReviewReports += 1;
		} else if (report.status === "dismissed") {
			current.dismissedReports += 1;
		} else {
			current.submittedReports += 1;
		}
		protectorMap.set(report.reporterLogin, current);
	}

	return Array.from(protectorMap.values()).toSorted(
		(a, b) =>
			b.score - a.score ||
			b.validatedReports - a.validatedReports ||
			b.reports - a.reports
	);
};

const buildDirectoryDashboard = (
	{
		imports,
		profiles,
		pullRequests,
		reports,
		repositories,
		signals,
	}: DashboardRecords,
	counts: DirectoryCounts
) => {
	const publicPullRequests = pullRequests.filter(
		(pr) => !pr.repository?.isPrivate
	);
	const publicSignals = signals.filter(
		(signal) => !signal.repository?.isPrivate
	);
	const publicReports = reports.filter(
		(report) => report.reporterIsMaintainer && !report.repository?.isPrivate
	);
	const publishedProfiles = profiles.filter(
		(profile) => profile.status !== "allow"
	);
	const publicPrCountByUser = new Map<string, number>();
	for (const pullRequest of publicPullRequests) {
		publicPrCountByUser.set(
			pullRequest.authorUserId,
			(publicPrCountByUser.get(pullRequest.authorUserId) ?? 0) + 1
		);
	}
	const publicReportCountByUser = new Map<string, number>();
	const publicValidatedReportCountByUser = new Map<string, number>();
	for (const report of publicReports) {
		publicReportCountByUser.set(
			report.targetUserId,
			(publicReportCountByUser.get(report.targetUserId) ?? 0) + 1
		);
		if (report.status === "validated") {
			publicValidatedReportCountByUser.set(
				report.targetUserId,
				(publicValidatedReportCountByUser.get(report.targetUserId) ?? 0) + 1
			);
		}
	}
	const riskProfiles = publishedProfiles.map((profile) => {
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
			prCount: publicPrCountByUser.get(profile.targetUserId) ?? 0,
			reasonCodes: parseJsonArray<ReasonCode>(profile.reasonCodesJson),
			reportCount: publicReportCountByUser.get(profile.targetUserId) ?? 0,
			repositoryCount: profile.repositoryCount,
			score: profile.score,
			status,
			summary: profile.summary,
			validatedReportCount:
				publicValidatedReportCountByUser.get(profile.targetUserId) ?? 0,
		};
	});

	return {
		protectors: buildProtectors(publicReports),
		imports: imports.map((item) => ({
			importedAt: item.importedAt,
			itemCount: item.itemCount,
			sourceName: item.sourceName,
			sourceUrl: item.sourceUrl,
			status: item.status,
		})),
		reports: publicReports.map((report) => ({
			createdAt: report.createdAt,
			id: report.id,
			status: report.status,
		})),
		repositories: repositories.flatMap((repo) =>
			repo.isActive && !repo.isPrivate
				? [
						{
							fullName: repo.fullName,
							name: repo.name,
							ownerLogin: repo.ownerLogin,
						},
					]
				: []
		),
		riskProfiles,
		stats: {
			activeRepositories: repositories.filter(
				(repo) => repo.isActive && !repo.isPrivate
			).length,
			blockedUsers: counts.blocked,
			highRiskUsers: counts.highRisk,
			importedUsers: counts.imported,
			openReports: publicReports.filter(
				(report) =>
					report.status === "pending" || report.status === "needs_review"
			).length,
			reviewUsers: counts.review,
			signals: publicSignals.length,
			trackedPrs: publicPullRequests.length,
			trackedUsers: counts.total,
			watchUsers: counts.watch,
		},
	};
};

const publicUser = (profile: DirectoryDashboard["riskProfiles"][number]) => ({
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
});

const publicProtector = (
	protector: DirectoryDashboard["protectors"][number]
) => ({
	dismissed_reports: protector.dismissedReports,
	login: protector.login,
	needs_review_reports: protector.needsReviewReports,
	reports: protector.reports,
	review_signal_count: protector.reports,
	score: protector.score,
	submitted_reports: protector.submittedReports,
	validated_reports: protector.validatedReports,
});

export const listDirectoryDashboard = async () => {
	try {
		const [records, counts] = await Promise.all([
			getDirectoryDashboardRecords(),
			getDirectoryCounts(),
		]);
		return buildDirectoryDashboard(records, counts);
	} catch (caught) {
		if (isDatabaseReadError(caught)) {
			// Read-only public aggregate behind /, /feed, /accounts, /protectors and
			// the JSON API — never let one bad or over-limit query 500 all of them.
			console.error("listDirectoryDashboard read failed", caught);
			return emptyDashboard();
		}
		throw caught;
	}
};

export type DirectoryDashboard = Awaited<
	ReturnType<typeof listDirectoryDashboard>
>;

const listAccountApiProfiles = async () => {
	const profiles = await getDirectoryAccountApiProfiles();
	return profiles.flatMap((profile) => {
		if (profile.status === "allow") {
			return [];
		}
		const status = riskStatusForScore({
			isAllowed: false,
			score: profile.score,
		});
		return [
			{
				avatarUrl: profile.targetUser.avatarUrl,
				confidence: profile.confidence,
				commitCount: profile.commitCount,
				githubUserId: profile.targetUser.githubUserId,
				htmlUrl: profile.targetUser.htmlUrl,
				importedSource: profile.importedSource,
				lastSeenAt: profile.lastSeenAt,
				login: profile.targetUser.login,
				prCount: 0,
				reasonCodes: parseJsonArray<ReasonCode>(profile.reasonCodesJson),
				reportCount: 0,
				repositoryCount: profile.repositoryCount,
				score: profile.score,
				status,
				summary: profile.summary,
				validatedReportCount: 0,
			},
		];
	});
};

export const listAccountsApi = async (filters: AccountFilters) => {
	const profiles = await listAccountApiProfiles();
	const { page, pageInfo } = filterAccounts(profiles, filters);

	return {
		accounts: page.map((profile) => ({
			...publicUser(profile),
			score: profile.score,
			score_detail: scoreDetails(profile.score),
		})),
		count: page.length,
		credits: LEADERBOARD_CREDIT,
		delisting: DELISTING,
		filters,
		generated_at: new Date().toISOString(),
		page_info: pageInfo,
		schema_version: "2026-05-30",
		source: "oss-protector",
		total_available: pageInfo.total,
	};
};

// Public smoke-check helper: returns recent pull_request AppEvent rows for a
// given repo. Used by the post-deploy smoke script to confirm a webhook
// landed without needing wrangler. Capped server-side to a 10-minute window
// so this isn't a general audit-log endpoint.
export const recentWebhookEvents = async (input: {
	repositoryFullName: string;
	sinceSeconds: number;
}) => {
	const events = await recentWebhookEventsQuery(input);
	return {
		events,
		generated_at: new Date().toISOString(),
		repository_full_name: input.repositoryFullName,
		since: input.sinceSeconds,
	};
};

export const listProtectorsApi = async (filters: ProtectorFilters) => {
	const dashboard = await listDirectoryDashboard();
	const { page, pageInfo } = filterProtectors(dashboard.protectors, filters);

	return {
		count: page.length,
		credits: LEADERBOARD_CREDIT,
		delisting: DELISTING,
		filters,
		generated_at: new Date().toISOString(),
		page_info: pageInfo,
		protectors: page.map(publicProtector),
		schema_version: "2026-05-30",
		source: "oss-protector",
		total_available: dashboard.protectors.length,
	};
};
