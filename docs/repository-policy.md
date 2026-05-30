# Repository policy

OSS Protector supports two ways to set per-repo policy:

1. **Commit `.github/oss-protector.json` to the repository** (recommended for policy-as-code).
2. **Edit it from the dashboard** at `/dashboard` → "Repo policy" tab.

The committed file always takes precedence **per-field**: any field present in the file overrides the dashboard-saved value; fields absent from the file fall through to whatever the dashboard saved, or to the built-in default if neither has a value.

Create the committed file in the repository you want to protect:

```text
.github/oss-protector.json
```

Example:

```json
{
  "enabled": true,
  "analyzePrivateRepositories": false,
  "minimumLikelyAbuseConfidence": 85,
  "trustedAuthors": ["dependabot[bot]", "renovate[bot]"],
  "ignoredPaths": ["docs/", "examples/", ".github/ISSUE_TEMPLATE/"]
}
```

## Lifecycle

1. A pull request webhook reaches OSS Protector.
2. OSS Protector records the PR metadata and changed files.
3. OSS Protector tries to read `.github/oss-protector.json` from the target repository.
4. OSS Protector also reads the dashboard-saved `RepoPolicy` row, if any. The effective policy is the per-field merge: committed file > dashboard DB row > built-in default.
5. If the file is missing or invalid JSON, the dashboard-saved policy alone is used (or defaults if neither exists).
5. If the policy disables review, trusts the author, or ignores every changed path, automatic abuse analysis is skipped.
6. Private repositories skip third-party AI analysis unless `analyzePrivateRepositories` is explicitly set to `true`.
7. Otherwise, OSS Protector analyzes the PR.
8. If the model says `likely_abuse` but the confidence is below the repository threshold, the result is downgraded to review-needed instead of being treated as likely abuse.

## Fields

### `enabled`

Type: `boolean`

Default: `true`

Set this to `false` when a repository should keep basic PR tracking but skip automatic abuse review.

```json
{
  "enabled": false
}
```

### `minimumLikelyAbuseConfidence`

Type: `number`

Default: `70`

Allowed range: `65` to `95`

This controls how confident OSS Protector must be before a PR can be treated as likely abuse. Values outside the allowed range are clamped.

```json
{
  "minimumLikelyAbuseConfidence": 90
}
```

If analysis returns `likely_abuse` with `78` confidence and the repository threshold is `90`, OSS Protector downgrades the result to review-needed.

### `analyzePrivateRepositories`

Type: `boolean`

Default: `false`

Private repositories are tracked for webhook delivery and local maintainer correction commands, but their PR patches are not sent to OpenRouter unless this is explicitly enabled.

```json
{
  "analyzePrivateRepositories": true
}
```

Only enable this if the repository owner accepts that PR title, body, changed file names, and short patch excerpts may be sent to the configured OpenRouter models for abuse analysis.

### `trustedAuthors`

Type: `string[]`

Default: `[]`

These GitHub logins skip automatic abuse review. Matching is case-insensitive.

```json
{
  "trustedAuthors": ["dependabot[bot]", "renovate[bot]"]
}
```

Use this for local automation accounts that your maintainers already trust.

### `ignoredPaths`

Type: `string[]`

Default: `[]`

These are path prefixes. Automatic review is skipped only when every changed file starts with one of the configured prefixes.

```json
{
  "ignoredPaths": ["docs/", "examples/", ".github/ISSUE_TEMPLATE/"]
}
```

For example, a PR that only changes `docs/install.md` and `examples/basic.ts` is skipped. A PR that changes `docs/install.md` and `src/index.ts` is still reviewed.

## Suggested starting policy

For most projects, start conservative:

```json
{
  "enabled": true,
  "analyzePrivateRepositories": false,
  "minimumLikelyAbuseConfidence": 85,
  "trustedAuthors": ["dependabot[bot]", "renovate[bot]"],
  "ignoredPaths": ["docs/", "examples/"]
}
```

This keeps automatic review enabled, avoids noise from trusted dependency bots, skips docs-only/examples-only PRs, and requires stronger confidence before a result is treated as likely abuse.
