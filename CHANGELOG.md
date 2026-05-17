# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.1] - 2026-05-17

First public release. Tags the state of the MVP that has been running on the hosted instance.

### Added

- Shared GitHub App webhook ingestion (`pull_request`, `issue_comment`, `pull_request_review_comment`).
- Automatic PR analysis with file/patch inspection and assessment comments.
- OpenRouter validation chain for maintainer reports and PR risk scoring, with deterministic fallback when no API key is configured.
- Public directory pages for risky accounts (`/clankers`), individual clanker profiles (`/clankers/<login>`), and maintainer protectors (`/protectors`).
- Public JSON feed at `/api/risky-users.json` (and `/api/feed.json` compatibility alias).
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

[Unreleased]: https://github.com/lord007tn/oss-protector/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/lord007tn/oss-protector/releases/tag/v0.0.1
