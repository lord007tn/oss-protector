-- Adds the GithubUser enrichment columns + Installation installer link that
-- the schema already references but were never pushed to remote D1. Without
-- these, every GithubUser INSERT and the dashboard SELECT both fail (D1
-- returns HTTPError on the missing-column SQL error).
--
-- Apply once:
--   pnpm exec wrangler d1 execute oss-protector --remote \
--     --file scripts/migrations/20260530_b_account_enrichment_columns.sql

ALTER TABLE GithubUser ADD COLUMN githubCreatedAt INTEGER;
ALTER TABLE GithubUser ADD COLUMN followers INTEGER NOT NULL DEFAULT 0;
ALTER TABLE GithubUser ADD COLUMN following INTEGER NOT NULL DEFAULT 0;
ALTER TABLE GithubUser ADD COLUMN publicRepos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE GithubUser ADD COLUMN totalStars INTEGER NOT NULL DEFAULT 0;
ALTER TABLE GithubUser ADD COLUMN totalContributions INTEGER NOT NULL DEFAULT 0;
ALTER TABLE GithubUser ADD COLUMN bio TEXT;
ALTER TABLE GithubUser ADD COLUMN achievementsJson TEXT NOT NULL DEFAULT '[]';
ALTER TABLE GithubUser ADD COLUMN lastEnrichedAt INTEGER;

ALTER TABLE Installation ADD COLUMN installerGithubId TEXT;
CREATE INDEX IF NOT EXISTS installations_installer_idx ON Installation(installerGithubId);
