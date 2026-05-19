# Maintainer Dashboard Business Gap

## Product Understanding

OSS Protector is currently a shared GitHub App and public review directory for suspicious open-source pull request activity. It watches repository events, analyzes external pull requests, scores risky accounts, accepts maintainer correction commands in GitHub comments, and publishes validated risk profiles through the public site and API.

The product promise is strongest for maintainers who want early warning before they spend review time on bounty farming, AI spam, duplicate low-effort PRs, credential phishing, malicious code, or other abuse patterns.

## Business Gap

The current product has a strong detection and public-intelligence layer, but it does not yet give maintainers an owned control plane for the repositories they protect.

Today, most maintainer actions are split across:

- GitHub App installation settings.
- Repo-local `.github/oss-protector.json` policy files.
- PR comment commands such as `@oss-protector dismiss`, `confirm`, `allow`, and `reset`.
- Public directory pages and API endpoints.
- Server-side environment configuration for OpenRouter.

That works for an early technical audience, but it creates a business gap: maintainers can receive value from OSS Protector, yet they do not have a central place to manage, audit, and trust that value.

## Why This Matters

A maintainer dashboard would make OSS Protector feel less like a public feed plus bot commands and more like infrastructure maintainers can operate.

This matters because the likely paying or high-retention user is not only browsing a directory. They need to:

- Know which repos are protected.
- See what the app did recently.
- Tune behavior without editing JSON files.
- Review uncertain reports before public impact.
- Block, allow, or reset users with confidence.
- Understand why OpenRouter or deterministic scoring made a decision.
- Manage private-repo safety and AI opt-in deliberately.
- Prove to other maintainers that actions were audited and reversible.

Without this, the product may be useful but hard to adopt for teams, organizations, and serious OSS projects.

## Dashboard Opportunity

The dashboard should become the maintainer operating surface for each GitHub installation and repository.

Initial dashboard areas:

- Repository list: installed repos, active/inactive state, private/public status, latest webhook activity.
- Repo behavior settings: enabled, private AI analysis opt-in, confidence threshold, trusted authors, ignored paths.
- Review queue: pending and needs-review reports, AI findings, duplicate campaign signals, and false-positive candidates.
- Clanker management: repo-scoped view of risky accounts, evidence, status, PR history, and latest actions.
- Moderation actions: confirm, dismiss, allow, reset, and later block/unblock recommendations.
- Block/unblock controls: repo-level blocked or allowed users, with clear distinction from shared public directory status.
- OpenRouter key management: hosted/global key status first, then possibly organization-owned keys later.
- Audit log: who changed settings, who acted on a report, what changed, when, and why.

## Important Product Distinctions

The dashboard should separate these concepts clearly:

- Shared risk profile: the public OSS Protector score/status for a GitHub account.
- Repo-local decision: whether a specific repo blocks, allows, ignores, or reviews that account.
- Maintainer correction: evidence that changes shared scoring or clears a false positive.
- Repository policy: behavior settings that control automatic review.
- Provider configuration: OpenRouter/API settings that affect analysis quality and cost.

This separation matters because OSS Protector should remain a review aid, not an unreviewable universal ban system.

## MVP Scope

A strong first version can stay small:

1. Authenticated maintainer dashboard route.
2. Repositories connected to the signed-in maintainer's GitHub identity.
3. Per-repo settings editor that mirrors `.github/oss-protector.json`.
4. Pending review queue for reports and AI findings.
5. Actions for confirm, dismiss, allow, and reset.
6. Audit log for dashboard actions.

This would already remove the biggest adoption friction: maintainers would not need to remember comment commands or edit JSON by hand to control basic behavior.

## Later Scope

Useful follow-up areas:

- Repo-local block/unblock list with GitHub integration options.
- Organization/team permissions for multiple maintainers.
- OpenRouter key ownership per installation or organization.
- Usage and cost visibility for AI analysis.
- Notification settings for high-risk findings.
- Bulk review flows for active attacks.
- Exportable audit reports.
- Suggested policy templates for strict, balanced, and quiet modes.

## Data And Architecture Gaps

Likely missing or incomplete data concepts:

- Maintainer identity to GitHub installation/repository access mapping.
- Dashboard action audit table.
- Repo-local user decisions separate from global `RiskProfile`.
- Stored repository policy state if the dashboard becomes the source of truth.
- Optional encrypted provider credentials if maintainers can bring their own OpenRouter key.
- Permission checks that verify the signed-in user still has repo or org access before allowing actions.

## Business Risks To Handle

- False positives: dashboard actions must be reversible and auditable.
- Privacy: private repo code should not be sent to AI unless explicitly opted in.
- Trust: users need to see evidence and provenance, not just a score.
- Liability: language should keep the product framed as review assistance.
- Cost: OpenRouter usage needs guardrails before allowing per-org keys or paid model usage.
- Abuse: a bad maintainer should not be able to poison the shared directory without validation and trust controls.

## Success Metrics

Potential metrics for this feature:

- Repos with dashboard-configured policy.
- Maintainers who take at least one dashboard action.
- Time from report creation to maintainer decision.
- False-positive dismissal rate.
- Repeat usage by installed repositories.
- Reduction in unresolved `needs_review` reports.
- Number of repos using trusted authors, ignored paths, or custom thresholds.

## Product Positioning

The maintainer dashboard is not just an admin page. It is the missing product layer between shared abuse intelligence and day-to-day repository operations.

If built well, OSS Protector becomes:

- A public directory for ecosystem awareness.
- A GitHub App for automatic PR review.
- A maintainer dashboard for control, review, audit, and trust.

That combination is much stronger than any one part alone.
