import { createId } from "@paralleldrive/cuid2";
import { sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { REASON_CODES } from "@/constants/reason-codes";
import { REPORT_STATUSES } from "@/constants/report-statuses";
import { RISK_STATUSES } from "@/constants/risk-statuses";

const unixNow = sql`(unixepoch())`;

export const GithubUser = sqliteTable(
	"GithubUser",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => createId()),
		githubUserId: text("githubUserId").notNull().unique(),
		login: text("login").notNull().unique(),
		avatarUrl: text("avatarUrl"),
		htmlUrl: text("htmlUrl"),
		accountType: text("accountType").notNull().default("User"),
		isKnownGithubBot: integer("isKnownGithubBot", { mode: "boolean" })
			.notNull()
			.default(false),
		firstSeenAt: integer("firstSeenAt", { mode: "number" })
			.notNull()
			.default(unixNow),
		lastSeenAt: integer("lastSeenAt", { mode: "number" })
			.notNull()
			.default(unixNow),
		createdAt: integer("createdAt", { mode: "number" })
			.notNull()
			.default(unixNow),
		updatedAt: integer("updatedAt", { mode: "number" })
			.notNull()
			.default(unixNow),
	},
	(table) => [
		index("github_users_login_idx").on(table.login),
		index("github_users_last_seen_idx").on(table.lastSeenAt),
	]
);

export const Installation = sqliteTable(
	"Installation",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => createId()),
		githubInstallationId: text("githubInstallationId").notNull().unique(),
		accountGithubId: text("accountGithubId"),
		accountLogin: text("accountLogin").notNull(),
		accountType: text("accountType").notNull().default("Organization"),
		repositorySelection: text("repositorySelection").notNull().default("all"),
		suspendedAt: integer("suspendedAt", { mode: "number" }),
		createdAt: integer("createdAt", { mode: "number" })
			.notNull()
			.default(unixNow),
		updatedAt: integer("updatedAt", { mode: "number" })
			.notNull()
			.default(unixNow),
	},
	(table) => [index("installations_account_login_idx").on(table.accountLogin)]
);

export const Repository = sqliteTable(
	"Repository",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => createId()),
		installationId: text("installationId").references(() => Installation.id, {
			onDelete: "set null",
		}),
		githubRepositoryId: text("githubRepositoryId").notNull().unique(),
		fullName: text("fullName").notNull().unique(),
		ownerLogin: text("ownerLogin").notNull(),
		name: text("name").notNull(),
		defaultBranch: text("defaultBranch"),
		htmlUrl: text("htmlUrl"),
		isPrivate: integer("isPrivate", { mode: "boolean" })
			.notNull()
			.default(false),
		isActive: integer("isActive", { mode: "boolean" }).notNull().default(true),
		createdAt: integer("createdAt", { mode: "number" })
			.notNull()
			.default(unixNow),
		updatedAt: integer("updatedAt", { mode: "number" })
			.notNull()
			.default(unixNow),
	},
	(table) => [
		index("repositories_installation_idx").on(table.installationId),
		index("repositories_owner_idx").on(table.ownerLogin),
	]
);

export const PullRequest = sqliteTable(
	"PullRequest",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => createId()),
		repositoryId: text("repositoryId")
			.notNull()
			.references(() => Repository.id, { onDelete: "cascade" }),
		authorUserId: text("authorUserId")
			.notNull()
			.references(() => GithubUser.id, { onDelete: "cascade" }),
		githubPullRequestId: text("githubPullRequestId").notNull().unique(),
		number: integer("number", { mode: "number" }).notNull(),
		title: text("title").notNull(),
		body: text("body"),
		state: text("state").notNull().default("open"),
		htmlUrl: text("htmlUrl").notNull(),
		headSha: text("headSha"),
		baseRef: text("baseRef"),
		additions: integer("additions", { mode: "number" }).notNull().default(0),
		deletions: integer("deletions", { mode: "number" }).notNull().default(0),
		changedFiles: integer("changedFiles", { mode: "number" })
			.notNull()
			.default(0),
		commitCount: integer("commitCount", { mode: "number" })
			.notNull()
			.default(0),
		firstSeenAt: integer("firstSeenAt", { mode: "number" })
			.notNull()
			.default(unixNow),
		lastSeenAt: integer("lastSeenAt", { mode: "number" })
			.notNull()
			.default(unixNow),
		closedAt: integer("closedAt", { mode: "number" }),
		mergedAt: integer("mergedAt", { mode: "number" }),
		createdAt: integer("createdAt", { mode: "number" })
			.notNull()
			.default(unixNow),
		updatedAt: integer("updatedAt", { mode: "number" })
			.notNull()
			.default(unixNow),
	},
	(table) => [
		uniqueIndex("pull_requests_repo_number_idx").on(
			table.repositoryId,
			table.number
		),
		index("pull_requests_author_idx").on(table.authorUserId),
		index("pull_requests_last_seen_idx").on(table.lastSeenAt),
	]
);

export const BotReport = sqliteTable(
	"BotReport",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => createId()),
		targetUserId: text("targetUserId")
			.notNull()
			.references(() => GithubUser.id, { onDelete: "cascade" }),
		reporterGithubId: text("reporterGithubId"),
		reporterLogin: text("reporterLogin").notNull(),
		reporterAssociation: text("reporterAssociation").notNull().default("NONE"),
		reporterIsMaintainer: integer("reporterIsMaintainer", { mode: "boolean" })
			.notNull()
			.default(false),
		repositoryId: text("repositoryId").references(() => Repository.id, {
			onDelete: "set null",
		}),
		pullRequestId: text("pullRequestId").references(() => PullRequest.id, {
			onDelete: "set null",
		}),
		issueNumber: integer("issueNumber", { mode: "number" }),
		commentId: text("commentId"),
		sourceUrl: text("sourceUrl").notNull(),
		commandText: text("commandText").notNull(),
		reasonCode: text("reasonCode", { enum: REASON_CODES })
			.notNull()
			.default("maintainer_report"),
		reasonText: text("reasonText"),
		status: text("status", { enum: REPORT_STATUSES })
			.notNull()
			.default("pending"),
		confidence: integer("confidence", { mode: "number" }).notNull().default(0),
		aiVerdict: text("aiVerdict"),
		aiRationale: text("aiRationale"),
		evidenceJson: text("evidenceJson").notNull().default("[]"),
		rawPayloadJson: text("rawPayloadJson"),
		createdAt: integer("createdAt", { mode: "number" })
			.notNull()
			.default(unixNow),
		updatedAt: integer("updatedAt", { mode: "number" })
			.notNull()
			.default(unixNow),
	},
	(table) => [
		uniqueIndex("bot_reports_comment_idx").on(table.commentId),
		index("bot_reports_target_idx").on(table.targetUserId),
		index("bot_reports_reporter_idx").on(table.reporterLogin),
		index("bot_reports_status_idx").on(table.status),
	]
);

export const BotSignal = sqliteTable(
	"BotSignal",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => createId()),
		targetUserId: text("targetUserId")
			.notNull()
			.references(() => GithubUser.id, { onDelete: "cascade" }),
		repositoryId: text("repositoryId").references(() => Repository.id, {
			onDelete: "set null",
		}),
		pullRequestId: text("pullRequestId").references(() => PullRequest.id, {
			onDelete: "set null",
		}),
		reportId: text("reportId").references(() => BotReport.id, {
			onDelete: "set null",
		}),
		signalType: text("signalType").notNull(),
		source: text("source").notNull(),
		sourceUrl: text("sourceUrl"),
		weight: integer("weight", { mode: "number" }).notNull().default(0),
		metadataJson: text("metadataJson").notNull().default("{}"),
		observedAt: integer("observedAt", { mode: "number" })
			.notNull()
			.default(unixNow),
	},
	(table) => [
		index("bot_signals_target_idx").on(table.targetUserId),
		index("bot_signals_observed_idx").on(table.observedAt),
	]
);

export const RiskProfile = sqliteTable(
	"RiskProfile",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => createId()),
		targetUserId: text("targetUserId")
			.notNull()
			.unique()
			.references(() => GithubUser.id, { onDelete: "cascade" }),
		status: text("status", { enum: RISK_STATUSES }).notNull().default("watch"),
		confidence: integer("confidence", { mode: "number" }).notNull().default(0),
		score: integer("score", { mode: "number" }).notNull().default(0),
		reasonCodesJson: text("reasonCodesJson").notNull().default("[]"),
		summary: text("summary"),
		importedSource: text("importedSource"),
		reportCount: integer("reportCount", { mode: "number" })
			.notNull()
			.default(0),
		validatedReportCount: integer("validatedReportCount", { mode: "number" })
			.notNull()
			.default(0),
		prCount: integer("prCount", { mode: "number" }).notNull().default(0),
		commitCount: integer("commitCount", { mode: "number" })
			.notNull()
			.default(0),
		repositoryCount: integer("repositoryCount", { mode: "number" })
			.notNull()
			.default(0),
		firstSeenAt: integer("firstSeenAt", { mode: "number" })
			.notNull()
			.default(unixNow),
		lastSeenAt: integer("lastSeenAt", { mode: "number" })
			.notNull()
			.default(unixNow),
		lastSignalAt: integer("lastSignalAt", { mode: "number" }),
		updatedAt: integer("updatedAt", { mode: "number" })
			.notNull()
			.default(unixNow),
	},
	(table) => [
		index("risk_profiles_status_idx").on(table.status),
		index("risk_profiles_score_idx").on(table.score),
	]
);

export const SourceImport = sqliteTable("SourceImport", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => createId()),
	sourceName: text("sourceName").notNull(),
	sourceUrl: text("sourceUrl").notNull(),
	status: text("status").notNull().default("completed"),
	itemCount: integer("itemCount", { mode: "number" }).notNull().default(0),
	importedAt: integer("importedAt", { mode: "number" })
		.notNull()
		.default(unixNow),
});

export const AppEvent = sqliteTable(
	"AppEvent",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => createId()),
		deliveryId: text("deliveryId").unique(),
		eventName: text("eventName").notNull(),
		action: text("action"),
		installationGithubId: text("installationGithubId"),
		repositoryFullName: text("repositoryFullName"),
		actorLogin: text("actorLogin"),
		status: text("status").notNull().default("processed"),
		error: text("error"),
		rawPayloadJson: text("rawPayloadJson"),
		processedAt: integer("processedAt", { mode: "number" })
			.notNull()
			.default(unixNow),
	},
	(table) => [
		index("app_events_event_idx").on(table.eventName),
		index("app_events_processed_idx").on(table.processedAt),
	]
);

export const appSchema = {
	AppEvent,
	BotReport,
	BotSignal,
	GithubUser,
	Installation,
	PullRequest,
	Repository,
	RiskProfile,
	SourceImport,
};

export type AppEventSelect = typeof AppEvent.$inferSelect;
export type BotReportSelect = typeof BotReport.$inferSelect;
export type BotSignalSelect = typeof BotSignal.$inferSelect;
export type GithubUserSelect = typeof GithubUser.$inferSelect;
export type InstallationSelect = typeof Installation.$inferSelect;
export type PullRequestSelect = typeof PullRequest.$inferSelect;
export type RepositorySelect = typeof Repository.$inferSelect;
export type RiskProfileSelect = typeof RiskProfile.$inferSelect;
export type SourceImportSelect = typeof SourceImport.$inferSelect;
