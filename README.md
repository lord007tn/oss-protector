# Clankers List

Shared OSS abuse intelligence for suspicious GitHub pull request activity.

The app is a TanStack Start + Cloudflare Workers product with:

- GitHub App manifest registration and webhook ingestion.
- Comment commands such as `@clankers-list report bot reason: fake bounty`.
- PR, issue comment, and PR review comment signals.
- OpenRouter validation for maintainer reports and PR risk analysis, with deterministic fallback scoring when no API key is configured.
- Drizzle ORM beta schema on Cloudflare D1.
- Public JSON feed at `/api/feed.json`.
- Dashboard filters, maintainer reports, imported profiles, and catcher leaderboard.

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

Local dev renders demo data when the Cloudflare D1 binding is not present.

Copy `.env.example` to `.env` and fill values as they become available:

```bash
VITE_APP_URL=http://localhost:3000
CLOUDFLARE_D1_DATABASE_NAME=clankers-list-db
OPENROUTER_API_KEY=
OPENROUTER_MODEL=qwen/qwen3-next-80b-a3b-instruct:free
OPENROUTER_FALLBACK_MODELS=openai/gpt-oss-120b:free,deepseek/deepseek-v4-flash:free,z-ai/glm-4.7-flash,openai/gpt-5-nano
```

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

## GitHub App

Start the app and use the dashboard `Register App` button. GitHub redirects back to `/install?code=...`.

On the install page, exchange the manifest code and save the returned values:

```bash
GITHUB_APP_ID=...
GITHUB_APP_SLUG=...
GITHUB_WEBHOOK_SECRET=...
GITHUB_APP_PRIVATE_KEY=...
```

For Cloudflare production, store secrets with Wrangler:

```bash
wrangler secret put GITHUB_WEBHOOK_SECRET
wrangler secret put GITHUB_APP_PRIVATE_KEY
wrangler secret put GITHUB_APP_ID
wrangler secret put OPENROUTER_API_KEY
```

The default model chain tries free OpenRouter models first, then falls back to cheap GLM/GPT nano models only when the free providers are unavailable or rate-limited.

Webhook URL:

```text
https://<deployment-host>/api/github/webhook
```

## Commands

Maintainers can flag the PR author from PR conversations:

```text
@clankers-list report bot reason: fake bounty
@clankers-list this is a bot
@this-product this is a bot
/clankers report spam
```

Only strong evidence is promoted automatically. Weak or non-maintainer reports stay in review states.

## Verification

```bash
pnpm check
pnpm run typecheck
pnpm build
```

## Deploy

Create or update the D1 database ID in `wrangler.json`, then:

```bash
pnpm run build:prod
wrangler deploy
```
