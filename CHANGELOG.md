# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-05-30

Maintainer console expansion. Renames the public surface and ships per-maintainer controls that were previously only available via JSON files or PR comment commands.

### Added

- Maintainer dashboard: **Audit log** tab — unified timeline of reports + maintainer corrections + repo overrides, with `all` / `decisions` / `overrides` / `reports` filter.
- Maintainer dashboard: **Repo overrides** tab — per-repo allow/block decisions for specific accounts. Allow short-circuits the PR analyzer; Block synthesizes a high-confidence flag without consuming AI credit.
- Maintainer dashboard: **Repo policy** tab — DB-backed editor for `enabled`, `analyzePrivateRepositories`, `minimumLikelyAbuseConfidence`, `trustedAuthors`, `ignoredPaths`. Per-field precedence: committed `.github/oss-protector.json` > DB-saved policy > built-in default.
- `/settings`: per-user notification kind toggles (`report`, `dispute`, `flag`, `correction`, `ok`, `info`). Muted kinds are no longer created.
- `/settings`: BYOK OpenRouter key panel. AES-256-GCM encrypted with HKDF off `BETTER_AUTH_SECRET`. Earliest-linked maintainer's key wins on multi-maintainer installations.
- Public endpoints: `GET /api/openrouter/free-models`.
- Maintainer endpoints (authenticated): `GET/POST /api/user/preferences`, `POST /api/openrouter/test`, `POST/DELETE /api/maintainer/repo-decision`, `GET /api/maintainer/repo-decisions`, `GET/POST/DELETE /api/maintainer/repo-policy`.
- New tables: `UserPreferences`, `RepoAccountDecision`, `RepoPolicy`.
- D1-backed `BackfillJob` queue + cron drainer, replacing Cloudflare Queues.
- Shared head builder (`buildSharedHead`) so every public route emits matching `og:*` / `twitter:*` / canonical / og:url / og:type.
- New env vars: `VITE_ENABLE_EMAIL_OTP`, `RESEND_API_KEY`, `EMAIL_FROM` for the email-OTP sign-in path.

### Changed

- **Breaking:** renamed the public `clankers` surface to `accounts` everywhere. `/api/clankers` → `/api/accounts`. Response key `{ clankers: [...] }` → `{ accounts: [...] }`. Profile route `/clankers/<login>` → `/accounts/<login>`. The old paths now 404 — update any external consumers.
- API: `/api/accounts` returns `400` with the list of allowed values when an unknown `status` or `reason` filter is supplied (previously silently fell through to the default).
- Maintainer console landing CTAs flip: primary action is now sign-in (with GitHub), install demoted to outline. After sign-in the dashboard surfaces the install prompt.
- Install page renders per-state titles (`Install` / `Install complete` / `GitHub App setup`).
- OTP delivery throws an explicit error in non-localhost environments when `RESEND_API_KEY` is unset (was previously a silent swallow).
- `fetch*` data-access functions renamed to `get*` / `list*` to match the project's verb convention.
- Top-level Worker router refactored to a routing table (no behavior change; reduces cognitive complexity).

### Fixed

- IPv6 `/64` rate-limit bucketing no longer collapses different prefixes when the address uses `::` compression.
- Earliest-linked maintainer's BYOK key is now selected deterministically (`ORDER BY` moved out of the IN-subquery into the outer query).
- `notificationKinds: null` no longer silently disables every notification kind on PATCH.
- `BETTER_AUTH_SECRET` shorter than 32 bytes is rejected up-front by the BYOK encryption helper.
- Non-404 errors from the GitHub policy-file fetch are now logged at `error` level with structured context (instead of `warn`-and-forget).
- Dispute submission on `/accounts/<login>` posts to `/api/appeal` correctly (stale TODO removed).

## [0.0.1] - 2026-05-17

First public release. Tags the state of the MVP that has been running on the hosted instance.

### Added

- Shared GitHub App webhook ingestion (`pull_request`, `issue_comment`, `pull_request_review_comment`).
- Automatic PR analysis with file/patch inspection and assessment comments.
- OpenRouter validation chain for maintainer reports and PR risk scoring, with deterministic fallback when no API key is configured.
- Public directory pages for risky accounts (`/clankers`), individual clanker profiles (`/clankers/<login>`), and maintainer protectors (`/protectors`).
- Filterable read APIs at `/api/clankers` and `/api/protectors`.
- Maintainer commands: `@oss-protector review|flag|recommend block|dismiss|confirm|allow|reset`.
- Scoring engine with age decay, AI weighting, report-bombing cap, and reporter trust.
- Per-IP rate limiting on public read endpoints via Cloudflare Rate Limiting.
- Post-deploy smoke test.
- Drizzle ORM beta schema on Cloudflare D1.
- Better Auth GitHub sign-in at `/api/auth/*`.
- 404, 500, and empty-profile pages.
- OSS docs (LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY) and GitHub issue/PR templates.

### Credits

The initial clanker seed data is sourced from the [Clankers Leaderboard](https://clankers-leaderboard.pages.dev/) by [@heyandras](https://x.com/heyandras), via the [`Bounty-Hunters/clankers.json`](https://raw.githubusercontent.com/UnsafeLabs/Bounty-Hunters/main/clankers.json) dataset.

[Unreleased]: https://github.com/lord007tn/oss-protector/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/lord007tn/oss-protector/compare/v0.0.1...v1.0.0
[0.0.1]: https://github.com/lord007tn/oss-protector/releases/tag/v0.0.1
