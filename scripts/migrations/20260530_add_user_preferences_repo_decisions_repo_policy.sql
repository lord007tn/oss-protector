-- Focused additive migration for the v2 changes. Apply once against remote D1:
--
--   pnpm exec wrangler d1 execute oss-protector --remote \
--     --file scripts/migrations/20260530_add_user_preferences_repo_decisions_repo_policy.sql
--
-- Idempotent: each statement uses IF NOT EXISTS so re-running is safe.

CREATE TABLE IF NOT EXISTS UserPreferences (
	id TEXT PRIMARY KEY NOT NULL,
	userId TEXT NOT NULL,
	openrouterApiKeyEncrypted TEXT,
	notificationKindsJson TEXT DEFAULT '["report","dispute","flag","correction","ok","info"]' NOT NULL,
	updatedAt INTEGER DEFAULT (unixepoch()) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS user_preferences_user_idx
	ON UserPreferences(userId);

CREATE TABLE IF NOT EXISTS RepoAccountDecision (
	id TEXT PRIMARY KEY NOT NULL,
	repositoryId TEXT NOT NULL REFERENCES Repository(id) ON DELETE CASCADE,
	targetUserId TEXT NOT NULL REFERENCES GithubUser(id) ON DELETE CASCADE,
	decision TEXT NOT NULL,
	note TEXT,
	correctedByLogin TEXT NOT NULL,
	correctedByUserId TEXT,
	createdAt INTEGER DEFAULT (unixepoch()) NOT NULL,
	updatedAt INTEGER DEFAULT (unixepoch()) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS repo_account_decisions_repo_target_idx
	ON RepoAccountDecision(repositoryId, targetUserId);
CREATE INDEX IF NOT EXISTS repo_account_decisions_repo_idx
	ON RepoAccountDecision(repositoryId);
CREATE INDEX IF NOT EXISTS repo_account_decisions_target_idx
	ON RepoAccountDecision(targetUserId);

CREATE TABLE IF NOT EXISTS RepoPolicy (
	repositoryId TEXT PRIMARY KEY NOT NULL REFERENCES Repository(id) ON DELETE CASCADE,
	enabled INTEGER,
	analyzePrivateRepositories INTEGER,
	minimumLikelyAbuseConfidence INTEGER,
	trustedAuthorsJson TEXT,
	ignoredPathsJson TEXT,
	updatedByUserId TEXT,
	updatedByLogin TEXT,
	updatedAt INTEGER DEFAULT (unixepoch()) NOT NULL
);
