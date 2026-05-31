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
import { SPONSOR_STATUSES, SPONSOR_TIERS } from "@/constants/sponsor-tiers";

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
		// Account-level abuse signals pulled from the GitHub user API. Used as a
		// corroborator (young, thin accounts boost existing suspicion) — never as a
		// standalone accusation. Null when we couldn't enrich (no installation token).
		githubCreatedAt: integer("githubCreatedAt", { mode: "number" }),
		followers: integer("followers", { mode: "number" }).notNull().default(0),
		following: integer("following", { mode: "number" }).notNull().default(0),
		publicRepos: integer("publicRepos", { mode: "number" })
			.notNull()
			.default(0),
		// Sum of stargazers across the account's owned public repos — a reputation
		// signal that dampens suspicion for established maintainers.
		totalStars: integer("totalStars", { mode: "number" }).notNull().default(0),
		// Total public PRs the account has authored (GitHub search total_count).
		totalContributions: integer("totalContributions", { mode: "number" })
			.notNull()
			.default(0),
		bio: text("bio"),
		// GitHub profile achievements (Pull Shark, etc.) — best-effort, may be empty.
		achievementsJson: text("achievementsJson").notNull().default("[]"),
		// When the heavier account signals (stars, contributions) were last
		// refreshed, so per-PR analysis doesn't re-hit the search/repos API.
		lastEnrichedAt: integer("lastEnrichedAt", { mode: "number" }),
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
		// GitHub user id of whoever installed the app (payload.sender.id on the
		// install event). Lets a maintainer who signs in *after* installing get
		// linked to this installation — see backfillMaintainerLinks.
		installerGithubId: text("installerGithubId"),
		repositorySelection: text("repositorySelection").notNull().default("all"),
		suspendedAt: integer("suspendedAt", { mode: "number" }),
		createdAt: integer("createdAt", { mode: "number" })
			.notNull()
			.default(unixNow),
		updatedAt: integer("updatedAt", { mode: "number" })
			.notNull()
			.default(unixNow),
	},
	(table) => [
		index("installations_account_login_idx").on(table.accountLogin),
		index("installations_installer_idx").on(table.installerGithubId),
	]
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

export const Appeal = sqliteTable(
	"Appeal",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => createId()),
		login: text("login").notNull(),
		email: text("email"),
		// "self" (account holder) or "rep" (representing them).
		relationship: text("relationship").notNull().default("self"),
		story: text("story").notNull(),
		evidenceJson: text("evidenceJson").notNull().default("[]"),
		status: text("status").notNull().default("pending"),
		submittedByUserId: text("submittedByUserId"),
		createdAt: integer("createdAt", { mode: "number" })
			.notNull()
			.default(unixNow),
		updatedAt: integer("updatedAt", { mode: "number" })
			.notNull()
			.default(unixNow),
	},
	(table) => [
		index("appeals_login_idx").on(table.login),
		index("appeals_status_idx").on(table.status),
	]
);

// Links a signed-in (better-auth) user to a GitHub App installation they
// maintain. Scopes the dashboard + notifications per user without reaching
// into the better-auth tables.
export const InstallationMaintainer = sqliteTable(
	"InstallationMaintainer",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => createId()),
		userId: text("userId").notNull(),
		installationId: text("installationId")
			.notNull()
			.references(() => Installation.id, { onDelete: "cascade" }),
		role: text("role").notNull().default("maintainer"),
		createdAt: integer("createdAt", { mode: "number" })
			.notNull()
			.default(unixNow),
	},
	(table) => [
		uniqueIndex("installation_maintainers_user_install_idx").on(
			table.userId,
			table.installationId
		),
		index("installation_maintainers_user_idx").on(table.userId),
	]
);

// In-app notifications — replaces the GitHub PR-comment feedback channel.
export const Notification = sqliteTable(
	"Notification",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => createId()),
		userId: text("userId").notNull(),
		kind: text("kind").notNull().default("info"),
		title: text("title").notNull(),
		body: text("body"),
		link: text("link"),
		read: integer("read", { mode: "boolean" }).notNull().default(false),
		createdAt: integer("createdAt", { mode: "number" })
			.notNull()
			.default(unixNow),
	},
	(table) => [
		index("notifications_user_idx").on(table.userId),
		index("notifications_user_read_idx").on(table.userId, table.read),
	]
);

// Per-repo policy edits made from the dashboard. Mirrors the fields in
// `.github/oss-protector.json`. Each column is nullable — a missing value
// means "fall through to the committed file or the default". When both DB and
// file have a value for a field, the committed file wins (code-as-config).
export const RepoPolicy = sqliteTable("RepoPolicy", {
	repositoryId: text("repositoryId")
		.primaryKey()
		.references(() => Repository.id, { onDelete: "cascade" }),
	enabled: integer("enabled", { mode: "boolean" }),
	analyzePrivateRepositories: integer("analyzePrivateRepositories", {
		mode: "boolean",
	}),
	minimumLikelyAbuseConfidence: integer("minimumLikelyAbuseConfidence", {
		mode: "number",
	}),
	trustedAuthorsJson: text("trustedAuthorsJson"),
	ignoredPathsJson: text("ignoredPathsJson"),
	updatedByUserId: text("updatedByUserId"),
	updatedByLogin: text("updatedByLogin"),
	updatedAt: integer("updatedAt", { mode: "number" })
		.notNull()
		.default(unixNow),
});

// Repo-scoped allow/block decision for a specific account. Distinct from the
// shared RiskProfile.status: this is a maintainer saying "for MY repo,
// override the shared score." On webhook analysis we check this table before
// applying the shared score so a local allow short-circuits the flag (and a
// local block force-flags regardless of the shared profile).
export const RepoAccountDecision = sqliteTable(
	"RepoAccountDecision",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => createId()),
		repositoryId: text("repositoryId")
			.notNull()
			.references(() => Repository.id, { onDelete: "cascade" }),
		targetUserId: text("targetUserId")
			.notNull()
			.references(() => GithubUser.id, { onDelete: "cascade" }),
		decision: text("decision").notNull(),
		note: text("note"),
		correctedByLogin: text("correctedByLogin").notNull(),
		correctedByUserId: text("correctedByUserId"),
		createdAt: integer("createdAt", { mode: "number" })
			.notNull()
			.default(unixNow),
		updatedAt: integer("updatedAt", { mode: "number" })
			.notNull()
			.default(unixNow),
	},
	(table) => [
		uniqueIndex("repo_account_decisions_repo_target_idx").on(
			table.repositoryId,
			table.targetUserId
		),
		index("repo_account_decisions_repo_idx").on(table.repositoryId),
		index("repo_account_decisions_target_idx").on(table.targetUserId),
	]
);

// Per-maintainer preferences: BYOK OpenRouter key (AES-GCM encrypted with a
// secret-derived key) and per-kind notification toggles. One row per better-auth
// userId. Absent row means defaults (no BYOK, all notification kinds on).
export const UserPreferences = sqliteTable(
	"UserPreferences",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => createId()),
		userId: text("userId").notNull(),
		openrouterApiKeyEncrypted: text("openrouterApiKeyEncrypted"),
		notificationKindsJson: text("notificationKindsJson")
			.notNull()
			.default('["report","dispute","flag","correction","ok","info"]'),
		updatedAt: integer("updatedAt", { mode: "number" })
			.notNull()
			.default(unixNow),
	},
	(table) => [uniqueIndex("user_preferences_user_idx").on(table.userId)]
);

// Durable, D1-backed work queue for one-time account PR backfills. Replaces the
// Cloudflare Queue (which needs Workers Paid): a cron-triggered handler drains
// pending rows. One row per login — re-enqueueing an existing login is a no-op.
export const BackfillJob = sqliteTable(
	"BackfillJob",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => createId()),
		login: text("login").notNull().unique(),
		// pending → drained by cron; done → completed; failed → parked after
		// MAX_ATTEMPTS so a permanently-broken login can't loop forever.
		status: text("status").notNull().default("pending"),
		attempts: integer("attempts", { mode: "number" }).notNull().default(0),
		lastError: text("lastError"),
		createdAt: integer("createdAt", { mode: "number" })
			.notNull()
			.default(unixNow),
		updatedAt: integer("updatedAt", { mode: "number" })
			.notNull()
			.default(unixNow),
	},
	(table) => [index("backfill_jobs_status_idx").on(table.status)]
);

// Sponsors shown on the public /sponsors page, managed from the admin console.
// Honest by design: only `active` rows are published. `tier` drives grouping and
// ordering on the page; `sortOrder` is a manual tiebreak within a tier (lower
// sorts first). No amounts are stored — the page never fabricates figures.
export const Sponsor = sqliteTable(
	"Sponsor",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => createId()),
		name: text("name").notNull(),
		url: text("url").notNull(),
		logoUrl: text("logoUrl"),
		description: text("description"),
		tier: text("tier", { enum: SPONSOR_TIERS }).notNull().default("supporter"),
		status: text("status", { enum: SPONSOR_STATUSES })
			.notNull()
			.default("active"),
		sortOrder: integer("sortOrder", { mode: "number" }).notNull().default(0),
		createdAt: integer("createdAt", { mode: "number" })
			.notNull()
			.default(unixNow),
		updatedAt: integer("updatedAt", { mode: "number" })
			.notNull()
			.default(unixNow),
	},
	(table) => [
		index("sponsors_status_idx").on(table.status),
		index("sponsors_tier_idx").on(table.tier),
	]
);

export const appSchema = {
	AppEvent,
	Appeal,
	BackfillJob,
	BotReport,
	BotSignal,
	GithubUser,
	Installation,
	InstallationMaintainer,
	Notification,
	PullRequest,
	RepoAccountDecision,
	RepoPolicy,
	Repository,
	RiskProfile,
	SourceImport,
	Sponsor,
	UserPreferences,
};

export type AppEventSelect = typeof AppEvent.$inferSelect;
export type AppealSelect = typeof Appeal.$inferSelect;
export type BackfillJobSelect = typeof BackfillJob.$inferSelect;
export type BotReportSelect = typeof BotReport.$inferSelect;
export type BotSignalSelect = typeof BotSignal.$inferSelect;
export type GithubUserSelect = typeof GithubUser.$inferSelect;
export type InstallationSelect = typeof Installation.$inferSelect;
export type InstallationMaintainerSelect =
	typeof InstallationMaintainer.$inferSelect;
export type NotificationSelect = typeof Notification.$inferSelect;
export type PullRequestSelect = typeof PullRequest.$inferSelect;
export type RepositorySelect = typeof Repository.$inferSelect;
export type RiskProfileSelect = typeof RiskProfile.$inferSelect;
export type RepoAccountDecisionSelect = typeof RepoAccountDecision.$inferSelect;
export type RepoPolicySelect = typeof RepoPolicy.$inferSelect;
export type SourceImportSelect = typeof SourceImport.$inferSelect;
export type SponsorSelect = typeof Sponsor.$inferSelect;
export type UserPreferencesSelect = typeof UserPreferences.$inferSelect;
