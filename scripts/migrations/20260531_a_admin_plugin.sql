-- Adds the columns the Better Auth `admin` plugin expects on the user/session
-- tables: role + ban fields on `user`, and `impersonatedBy` on `session`.
-- Dates/booleans follow Better Auth's D1 conventions (booleans as 0/1 integers,
-- dates as epoch-ms integers).
--
-- Apply once against each database (run-once — ADD COLUMN errors if re-applied):
--   pnpm exec wrangler d1 execute oss-protector --local \
--     --file scripts/migrations/20260531_a_admin_plugin.sql
--   pnpm exec wrangler d1 execute oss-protector --remote \
--     --file scripts/migrations/20260531_a_admin_plugin.sql

ALTER TABLE user ADD COLUMN role text;
ALTER TABLE user ADD COLUMN banned integer DEFAULT false;
ALTER TABLE user ADD COLUMN banReason text;
ALTER TABLE user ADD COLUMN banExpires integer;

ALTER TABLE session ADD COLUMN impersonatedBy text;
