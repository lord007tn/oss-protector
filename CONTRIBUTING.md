# Contributing to OSS Protector

Thanks for your interest in helping protect open source from bounty-farming, AI-spam, and malicious PR campaigns. This guide gets you from a fresh clone to a green PR.

## Code of Conduct

By participating, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md). Be kind. We're here to make maintainers' lives easier, not harder.

## How you can help

Good first contributions, in rough order of impact:

- **Bug reports** — file an [issue](https://github.com/lord007tn/oss-protector/issues/new/choose) with reproduction steps. Webhook payload samples are helpful, but redact secrets, private repository names, private patch contents, auth headers, cookies, and Wrangler logs before posting publicly.
- **New abuse signals** — propose a new pattern the scoring engine should detect (e.g. a fresh flavour of bounty farming). See `src/lib/scoring.ts` and `src/integrations/openrouter/prompts.ts`.
- **False positive fixes** — if the bot flagged a legitimate PR, open an issue with the PR URL and the comment the bot posted.
- **Reason-code improvements** — `src/constants/reason-codes.ts` and the corresponding UI copy.
- **UI polish** — the landing/directory pages live under `src/components/landing` and `src/routes`.
- **Tests** — scoring is regression-tested under `src/lib/scoring.test.ts`; new signals should ship with tests.
- **Docs** — README clarifications, examples, screenshots.

## Development setup

Prereqs: Node 20+, [pnpm 10](https://pnpm.io/installation), and a [Cloudflare account](https://dash.cloudflare.com/sign-up) if you want to test against real D1.

```bash
git clone https://github.com/lord007tn/oss-protector.git
cd oss-protector
pnpm install
cp .env.example .env
pnpm dev
```

The app runs at <http://localhost:3000>. Most UI/scoring work doesn't need D1; database-backed directory data stays empty until D1 is configured or seeded.

For full Worker/D1 testing:

```bash
pnpm build
pnpm exec wrangler dev --local --port 8787
pnpm run db:migrate:local
pnpm run db:seed
```

See the [README](README.md#configuration) for the full env-var matrix and GitHub App setup.

## Project layout

```
src/
  routes/           TanStack Start file-based routes (pages + API endpoints)
  components/       UI — landing pages, shadcn primitives, SEO helpers
  actions/          Server actions called from routes
  data-access/      Drizzle queries
  db/               Schema, relations, seed
  helpers/          Webhook + filter utilities
  integrations/
    github/         Octokit webhook handling, comment posting
    openrouter/     AI validation chain (model selection, prompts, tests)
  lib/              Scoring engine, time helpers, JSON utils
  constants/        Reason codes, report statuses, risk statuses
```

## Workflow

1. **Fork & branch** — branch from `master`, name it after the change (`fix/scoring-decay-overflow`, `feat/discord-webhook`).
2. **Code with the linter on** — `pnpm check` (ultracite/oxlint/oxfmt). The pre-commit hook also runs tests.
3. **Add tests** for anything in `lib/scoring.ts`, `helpers/`, or `integrations/openrouter/`.
4. **Verify locally** before opening a PR:
   ```bash
   pnpm check
   pnpm run typecheck
   pnpm test
   pnpm build
   ```
5. **Open the PR** against `master`. The PR template will ask you to describe what changed and how to test it.

## Commit & PR style

- Conventional-ish commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `test:`. Look at `git log` for examples.
- Keep PRs focused. A scoring tweak and a UI refactor should be two PRs.
- Reference the issue if there is one: `Fixes #42`.
- The bot's behaviour is user-facing — if you change a comment template, attach a before/after screenshot or quote.

## Reporting security issues

**Don't** open a public issue for security problems. See [SECURITY.md](SECURITY.md).

## Questions

Open a [discussion](https://github.com/lord007tn/oss-protector/discussions) or comment on an existing issue. Drive-by contributions welcome.
