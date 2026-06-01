// Every table the app owns, listed child → parent so deletes and drops never
// violate a foreign key (a child is always removed before the parent it
// references). Mirrors src/db/schema.ts + the Better Auth tables. Keep in sync
// when adding a table.
export const APP_TABLES_CHILD_TO_PARENT = [
	"BotSignal",
	"Notification",
	"UserPreferences",
	"InstallationMaintainer",
	"RepoAccountDecision",
	"RepoPolicy",
	"BotReport",
	"RiskProfile",
	"PullRequest",
	"Repository",
	"Installation",
	"GithubUser",
	"Appeal",
	"AppEvent",
	"BackfillJob",
	"SourceImport",
	"Sponsor",
] as const;

// Better Auth tables (sessions/accounts reference user), also child → parent.
export const AUTH_TABLES_CHILD_TO_PARENT = [
	"session",
	"account",
	"verification",
	"user",
] as const;

// Drizzle's migration bookkeeping tables (remote uses __drizzle_migrations; the
// local companion runner uses __drizzle_migrations_local). Dropped on clean so a
// rebuild re-applies every migration from scratch.
export const MIGRATION_TRACKING_TABLES = [
	"__drizzle_migrations",
	"__drizzle_migrations_local",
] as const;
