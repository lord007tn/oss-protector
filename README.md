# OSS Protector

Shared OSS abuse intelligence for suspicious GitHub pull request activity.

The app is a TanStack Start + Cloudflare Workers product with:

- Shared GitHub App installation and webhook ingestion.
- Automatic PR analysis comments that inspect pull request metadata, changed files, and patch snippets.
- PR, issue comment, and PR review comment signals.
- OpenRouter validation for maintainer reports and PR risk analysis, with deterministic fallback scoring when no API key is configured.
- Drizzle ORM beta schema on Cloudflare D1.
- Public JSON feed at `/api/risky-users.json` with a `/api/feed.json` compatibility alias.
- Public directory for risky accounts, report reasons, and maintainers who submit reports.

## Stack

- TanStack Start
- React Query
- shadcn/ui with Base UI primitives
- Drizzle ORM `1.0.0-beta.24`
- Cloudflare Workers + D1
- OpenRouter chat completions

## Local Setup

```bash
pnpm install
pnpm dev
```

`pnpm dev` runs the Vite app. Use the Cloudflare worker preview when you need
real D1 bindings locally:

```bash
pnpm build
pnpm exec wrangler dev --local --port 8787
```

Copy `.env.example` to `.env` and fill values as they become available:

```bash
VITE_APP_URL=http://localhost:3000
VITE_ENABLE_GITHUB_AUTH=false
CLOUDFLARE_D1_DATABASE_NAME=clankers-list-db
OPENROUTER_API_KEY=
```

## Public Feed

Projects can consume the directory with:

```bash
curl https://oss-protector.raedbahri90.workers.dev/api/risky-users.json
```

The response includes `risky_users` for accounts to review or ban and
`protectors` for maintainers who submitted reports. `/api/feed.json` returns the
same payload for older clients.

## Database

Generate migrations after schema edits:

```bash
pnpm run db:generate
```

Apply locally:

```bash
pnpm run db:migrate:local
pnpm run db:seed
```

Apply remotely:

```bash
pnpm run db:migrate
pnpm run db:seed:remote
```

The seed imports `https://raw.githubusercontent.com/UnsafeLabs/Bounty-Hunters/main/clankers.json`.
The first layer of the idea and initial clanker data is credited to the
[Clankers Leaderboard](https://clankers-leaderboard.pages.dev/) published by
[@heyandras](https://x.com/heyandras).

## GitHub App

OSS Protector is one shared GitHub App. OSS maintainers should not create their own apps; they install the shared app on selected repositories:

```text
https://github.com/apps/oss-protector/installations/new
```

The GitHub App settings should use:

```text
Webhook URL: https://oss-protector.raedbahri90.workers.dev/api/github/webhook
Repository permissions: Contents read, Issues write, Pull requests write
Subscribed events: Issue comment, Pull request, Pull request review comment
Visibility: Public
```

Store the app values in Cloudflare:

```bash
GITHUB_APP_ID=...
GITHUB_APP_SLUG=...
GITHUB_WEBHOOK_SECRET=...
GITHUB_APP_PRIVATE_KEY=...
BETTER_AUTH_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
VITE_ENABLE_GITHUB_AUTH=true
```

For Cloudflare production, store secrets with Wrangler:

```bash
wrangler secret put GITHUB_WEBHOOK_SECRET
wrangler secret put GITHUB_APP_PRIVATE_KEY
wrangler secret put GITHUB_APP_ID
wrangler secret put BETTER_AUTH_SECRET
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put OPENROUTER_API_KEY
```

Better Auth handles GitHub user sign-in at `/api/auth/*` when
`BETTER_AUTH_SECRET`, `GITHUB_CLIENT_ID`, and `GITHUB_CLIENT_SECRET` are
configured. The GitHub App webhook and installation-token flow still uses
`@octokit/auth-app`, because Better Auth does not replace GitHub App
installation authentication.

The internal OpenRouter model chain only uses model IDs that end in `:free`.

## Automatic PR Analysis

OSS Protector participates automatically when a pull request is opened,
reopened, marked ready for review, or updated. It fetches the changed file list
and patch snippets, analyzes the PR for suspicious OSS abuse patterns, then posts
an assessment directly on the PR.

The automatic assessment can flag patterns such as fake bounty farming, duplicate
low-effort PRs, spam, low-quality AI filler, credential phishing, malicious code,
dependency script abuse, obfuscation, or backdoor indicators.

Only strong evidence is promoted automatically. Weak or non-maintainer reports stay in review states.

## Maintainer commands

Anyone can mention the bot to file a report:

```text
@oss-protector review this user
@oss-protector flag this user reason: fake bounty
@oss-protector recommend block reason: malicious code
```

Repo owners, organization members, and collaborators (GitHub
`author_association` `OWNER`, `MEMBER`, or `COLLABORATOR`) can also correct
the system from any PR comment:

```text
@oss-protector dismiss     # mark all open reports on this PR's author as dismissed and add a negative correction signal
@oss-protector confirm     # validate the most recent open report and add a positive correction signal
@oss-protector allow       # permanently allowlist the PR author (status = allow, score = 0)
```

The bot posts a confirmation comment for each correction. Non-maintainer
comments using those verbs are ignored.

## Rate limits

Public read endpoints (`/api/clankers`, `/api/protectors`,
`/api/risky-users.json`, `/api/feed.json`) are rate-limited per client IP via
the Cloudflare Rate Limiting binding configured in `wrangler.json`. GitHub
webhooks are not rate-limited.

## Verification

```bash
pnpm check
pnpm run typecheck
pnpm build
```

## Deploy

Create or update the D1 database ID in `wrangler.json`, then:

```bash
pnpm run deploy
```

Deploys are wired through Cloudflare's Git integration on this Worker — every
push to `main` triggers a Cloudflare-managed build and deploy. Run
`pnpm run deploy` locally only for out-of-cycle hotfixes.
