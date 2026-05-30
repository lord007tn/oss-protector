<div align="center">

<img src="public/oss-protector-mark.svg" alt="OSS Protector" width="96" height="96" />

# OSS Protector

**Shared abuse intelligence for suspicious GitHub pull request activity.**

A single GitHub App + public directory that helps maintainers spot bounty-farming, AI-spam, low-effort duplicate PRs, and outright malicious contributions before they waste anyone's time.

[![CI](https://github.com/lord007tn/oss-protector/actions/workflows/ci.yml/badge.svg)](https://github.com/lord007tn/oss-protector/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[Hosted instance](https://oss-protector.raedbahri90.workers.dev) · [Install the App](https://github.com/apps/oss-protector/installations/new) · [Contributing](CONTRIBUTING.md)

</div>

---

## What it does

When you install the OSS Protector GitHub App on a repository, it:

1. **Watches PRs.** Every `pull_request`, `issue_comment`, and `pull_request_review_comment` event is sent to a shared webhook.
2. **Analyzes the PR.** Changed files, patch snippets, and metadata are inspected for known abuse patterns — fake bounty farming, duplicate low-effort PRs, AI-filler, credential phishing, malicious code, dependency-script abuse, obfuscation, and backdoor indicators.
3. **Scores the contributor.** A scoring engine combines signals from this PR, prior reports across all installed repos, reporter trust, and age decay. AI validation (via OpenRouter) sanity-checks the result; deterministic fallback runs when no API key is configured.
4. **Comments.** Strong evidence gets posted as a PR assessment. Weaker signals stay in a review queue. Maintainers can confirm, dismiss, allow, or reset with `@oss-protector` commands.
5. **Publishes.** Confirmed risky accounts show up on the public directory so other maintainers can review them before merging.

It's one GitHub App, one database, one feed — maintainers don't each have to run their own.

## Key features

- **Maintainer-first review lifecycle** — PR webhooks are tracked, external contributors are reviewed, maintainers can correct outcomes from PR comments, and public scores update from validated evidence.
- **Grounded abuse signals** — lifecycle-script execution, token exfiltration, obfuscation, privileged `pull_request_target` workflow patterns, duplicate cross-repo campaigns, and maintainer reports are handled separately.
- **False-positive guardrails** — repo insiders are skipped, non-maintainer reports stay in review until a maintainer confirms them, command-only reports are capped, and harmless docs about webhooks/secrets are not treated as credential phishing.
- **Repo-local policy** — projects can add `.github/oss-protector.json` to disable analysis, trust local automation accounts, ignore path-only changes, or raise the confidence threshold for likely-abuse results.
- **Auditable profiles** — public profile pages show recent public PRs, reports, and a decision timeline of the signals that affected the score while hiding private-repo source links.

## Stack

- **Frontend** — TanStack Start (file-based routing, SSR), React 19, shadcn/ui on Base UI primitives, Tailwind 4.
- **API + Worker** — TanStack Start server functions on Cloudflare Workers.
- **Data** — Drizzle ORM `1.0.0-beta.24` on Cloudflare D1.
- **Auth** — Better Auth (GitHub user sign-in) + `@octokit/auth-app` (App installation tokens).
- **AI** — OpenRouter chat completions, free-tier model chain with a paid fallback.
- **Lint/format** — Ultracite (oxlint + oxfmt), Biome.
- **Tests** — Vitest.

## Quick start

```bash
git clone https://github.com/lord007tn/oss-protector.git
cd oss-protector
pnpm install
cp .env.example .env
pnpm dev
```

Open <http://localhost:3000>. Most UI and scoring work can be done without D1 or a GitHub App. Database-backed directory data stays empty until D1 is configured or seeded.

For full Worker + D1 testing locally:

```bash
pnpm build
pnpm exec wrangler dev --local --port 8787
pnpm run db:migrate:local
pnpm run db:seed
```

> Requires Node 20+, [pnpm 10](https://pnpm.io/installation), and a Cloudflare account for the Worker preview.

## Configuration

Copy `.env.example` to `.env` and fill what you need. None of the GitHub or OpenRouter values are required to run `pnpm dev`.

| Variable | Required for | Description |
| --- | --- | --- |
| `VITE_APP_URL` | always | Public origin. Defaults to `http://localhost:3000`. |
| `VITE_ENABLE_GITHUB_AUTH` | UI sign-in | Set to `true` to enable the GitHub login button. |
| `VITE_ENABLE_DEVTOOLS` | local debugging | Set to `true` to enable TanStack, React Query, and React Scan devtools in development. |
| `ALLOW_UNSIGNED_GITHUB_WEBHOOKS` | local webhook testing | Keep `false` outside local development. Localhost can still run unsigned when no webhook secret is configured. |
| `CLOUDFLARE_ACCOUNT_ID` | deploy / D1 | Required by Wrangler when your Cloudflare login has access to more than one account. |
| `CLOUDFLARE_D1_DATABASE_NAME` | D1 | Defaults to `oss-protector`. |
| `CLOUDFLARE_D1_DATABASE_ID` | self-hosted D1 | Optional override for the committed hosted D1 UUID. |
| `CLOUDFLARE_D1_TOKEN` | Drizzle Kit | API token for `drizzle-kit push` against remote D1, if you use that workflow. |
| `VITE_GITHUB_STARS` | build | Optional override for the generated GitHub star count. |
| `VITE_GITHUB_REPO_SLUG` | build | Optional `owner/repo` override for the generated GitHub star count. |
| `BETTER_AUTH_SECRET` | sign-in | Required to enable Better Auth sessions. |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | sign-in | GitHub OAuth credentials for Better Auth. |
| `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` | webhooks | The GitHub App's identity, used for installation tokens. |
| `GITHUB_APP_SLUG` / `VITE_GITHUB_APP_SLUG` | server / UI | GitHub App slug. Set both for self-hosted installs so webhook code and browser install links point at the same app. |
| `GITHUB_MANIFEST_TOKEN` | GitHub App setup | Optional token used to exchange a GitHub App manifest code from `/install`. |
| `GITHUB_APP_CREATE_OWNER` | GitHub App setup | Optional owner slug for GitHub App manifest creation. |
| `GITHUB_WEBHOOK_SECRET` | webhooks | Verifies inbound webhook signatures. |
| `OPENROUTER_API_KEY` | AI scoring | If unset, the deterministic fallback runs. |
| `SMOKE_HEALTH_TOKEN` | deploy smoke | Bearer token required by the private post-deploy webhook health endpoint. |

## Public read endpoints

Other projects can query the directory through filterable JSON endpoints (see [`/api-docs`](https://oss-protector.raedbahri90.workers.dev/api-docs) for the full reference):

- `/api/accounts` — risky accounts with status / score / reason / search filters.
- `/api/protectors` — maintainers who submitted review signals.

Both endpoints are rate-limited per client IP (60 req/min) via the Cloudflare Rate Limiting binding configured in `wrangler.json`. Webhooks are not throttled.

## Database

```bash
pnpm run db:generate          # generate migrations after schema edits
pnpm run db:migrate:local     # apply locally
pnpm run db:seed              # seed locally
pnpm run db:migrate           # apply remotely
pnpm run db:seed:remote       # seed remotely
```

The seed imports [`Bounty-Hunters/clankers.json`](https://raw.githubusercontent.com/UnsafeLabs/Bounty-Hunters/main/clankers.json). The initial dataset and the original concept are credited to the [Clankers Leaderboard](https://clankers-leaderboard.pages.dev/) by [@heyandras](https://x.com/heyandras).

## GitHub App

OSS Protector is **one shared GitHub App**. Maintainers don't create their own — they install the shared app on the repos they own:

```text
https://github.com/apps/oss-protector/installations/new
```

If you're self-hosting your own instance, create a GitHub App with:

```text
Webhook URL:           https://<your-worker-host>/api/github/webhook
Repository permissions: Contents read, Issues write, Pull requests write
Subscribed events:     Issue comment, Pull request, Pull request review comment
Visibility:            Public
```

Then store the secrets in Cloudflare:

```bash
wrangler secret put GITHUB_APP_ID
wrangler secret put GITHUB_APP_PRIVATE_KEY
wrangler secret put GITHUB_WEBHOOK_SECRET
wrangler secret put BETTER_AUTH_SECRET
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put OPENROUTER_API_KEY
wrangler secret put SMOKE_HEALTH_TOKEN
```

Better Auth handles GitHub user sign-in at `/api/auth/*` once `BETTER_AUTH_SECRET`, `GITHUB_CLIENT_ID`, and `GITHUB_CLIENT_SECRET` are set. The webhook + installation-token flow still uses `@octokit/auth-app` — Better Auth does not replace GitHub App installation authentication.

The internal OpenRouter model chain only uses model IDs that end in `:free`, with a paid fallback when free-tier models hallucinate.

## Repository policy

Each repository can tune OSS Protector with an optional `.github/oss-protector.json` file. See [Repository policy](./docs/repository-policy.md) for the full lifecycle, examples, and field reference.

```json
{
  "enabled": true,
  "analyzePrivateRepositories": false,
  "minimumLikelyAbuseConfidence": 80,
  "trustedAuthors": ["dependabot[bot]", "renovate[bot]"],
  "ignoredPaths": ["docs/", "examples/"]
}
```

- `enabled: false` tracks PR metadata but skips automatic abuse review for that repo.
- `analyzePrivateRepositories: true` explicitly opts private repositories into third-party AI analysis. Private repos default to metadata tracking without OpenRouter review.
- `minimumLikelyAbuseConfidence` is clamped between `65` and `95`; lower-confidence likely-abuse findings become review-needed.
- `trustedAuthors` skips automatic review for known local automation accounts.
- `ignoredPaths` skips automatic review when every changed file starts with one of the configured prefixes.

## Maintainer commands

Anyone can mention the bot to file a report:

```text
@oss-protector review this user
@oss-protector flag this user reason: fake bounty
@oss-protector recommend block reason: malicious code
```

Repo owners, organization members, and collaborators (GitHub `author_association` of `OWNER`, `MEMBER`, or `COLLABORATOR`) can correct the system from any PR comment:

```text
@oss-protector dismiss     # mark all open reports on this PR's author as dismissed
@oss-protector confirm     # validate the most recent open report
@oss-protector allow       # allowlist the PR author (status = allow, score = 0)
@oss-protector reset       # clear a prior allowlist; score recomputes on the next webhook
```

The bot posts a confirmation comment for each correction. Non-maintainer comments using those verbs are ignored. Cross-target syntax (`@oss-protector allow @other-user`) is not supported — corrections always act on the PR author. The bot flags any cross-target attempt in its ack comment.

## Verification

```bash
pnpm check          # ultracite (oxlint + oxfmt)
pnpm run typecheck  # tsc --noEmit
pnpm test           # vitest
pnpm build          # vite build
```

CI runs the same chain on pushes to `master` and PRs targeting `master`.

## Deploy

The hosted Worker is bound to the `oss-protector` D1 database in `wrangler.json`. Self-hosted deploys must set `CLOUDFLARE_D1_DATABASE_ID`, update the Worker name and public URL in `wrangler.json`, and store their own GitHub App/OpenRouter secrets before deploying. The deploy script refuses to publish the hosted configuration unless `OSS_PROTECTOR_DEPLOY_TARGET=hosted` is set.

```bash
pnpm run deploy
```

Deploys are wired through Cloudflare's Git integration on the hosted instance — every push to `master` triggers a Cloudflare-managed build and deploy. Maintainers of the hosted instance can run `pnpm run deploy:hosted` locally only for out-of-cycle hotfixes.

## Contributing

PRs and bug reports are very welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and workflow, and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community expectations.

Found a security issue? Please follow [SECURITY.md](SECURITY.md) and do **not** open a public issue.

## License

[MIT](LICENSE) © OSS Protector contributors.
