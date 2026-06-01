-- Wipes ALL row data from the database while keeping the schema intact, so the
-- app starts clean. Deletes in child -> parent order to satisfy foreign keys.
-- Includes the Better Auth tables (user/session/account/verification): after a
-- reset, the only admin is whoever signs in next with an ADMIN_EMAILS address
-- (granted the `admin` role by the create hook in src/auth.ts).
--
--   Local:  pnpm db:reset         (wrangler d1 execute --local  --file ...)
--   Remote: pnpm db:reset:remote  (wrangler d1 execute --remote --file ...)
--
-- This is destructive and irreversible. Re-seed afterwards with `pnpm db:seed`
-- (imported blocklist) or `pnpm db:seed:demo` (maintainer demo) if desired.

-- Signals reference users/repos/PRs/reports — delete first.
DELETE FROM BotSignal;
DELETE FROM Notification;
DELETE FROM UserPreferences;
DELETE FROM InstallationMaintainer;
DELETE FROM RepoAccountDecision;
DELETE FROM RepoPolicy;
DELETE FROM BotReport;
DELETE FROM RiskProfile;
DELETE FROM PullRequest;
DELETE FROM Repository;
DELETE FROM Installation;
DELETE FROM GithubUser;
DELETE FROM Appeal;
DELETE FROM AppEvent;
DELETE FROM BackfillJob;
DELETE FROM SourceImport;
DELETE FROM Sponsor;

-- Better Auth tables (sessions/accounts reference user).
DELETE FROM session;
DELETE FROM account;
DELETE FROM verification;
DELETE FROM user;
