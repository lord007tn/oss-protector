-- Adds the Sponsor table that backs the public /sponsors page and the admin
-- Sponsors tab. Apply once against each database:
--
--   pnpm exec wrangler d1 execute oss-protector --local \
--     --file scripts/migrations/20260601_a_sponsors.sql
--   pnpm exec wrangler d1 execute oss-protector --remote \
--     --file scripts/migrations/20260601_a_sponsors.sql
--
-- Idempotent: every statement uses IF NOT EXISTS so re-running is safe. Mirrors
-- the `Sponsor` table in src/db/schema.ts — keep the two in sync.

CREATE TABLE IF NOT EXISTS Sponsor (
	id TEXT PRIMARY KEY NOT NULL,
	name TEXT NOT NULL,
	url TEXT NOT NULL,
	logoUrl TEXT,
	description TEXT,
	tier TEXT DEFAULT 'supporter' NOT NULL,
	status TEXT DEFAULT 'active' NOT NULL,
	sortOrder INTEGER DEFAULT 0 NOT NULL,
	createdAt INTEGER DEFAULT (unixepoch()) NOT NULL,
	updatedAt INTEGER DEFAULT (unixepoch()) NOT NULL
);

CREATE INDEX IF NOT EXISTS sponsors_status_idx ON Sponsor(status);
CREATE INDEX IF NOT EXISTS sponsors_tier_idx ON Sponsor(tier);
