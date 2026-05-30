# Security Policy

## Supported versions

OSS Protector ships from `master` and is deployed continuously to the hosted instance. There are no LTS branches. Fixes are applied to `master` and rolled out on the next deploy.

| Version | Supported |
| ------- | --------- |
| `master` | yes      |
| Older tags | no    |

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Instead:

1. Use GitHub's [private vulnerability reporting](https://github.com/lord007tn/oss-protector/security/advisories/new) on this repository.
2. Or email the maintainer via the address on the [maintainer's GitHub profile](https://github.com/lord007tn).

Include:

- A description of the issue and its impact.
- Steps to reproduce (a minimal proof of concept is ideal).
- Affected commit SHA or deploy URL if relevant.
- Your suggested fix or mitigation, if you have one.

You should receive an acknowledgement within **3 business days**. We'll work with you on a fix and a disclosure timeline — typically a coordinated release within 30 days, sooner for actively exploited issues.

## Scope

In scope:

- The hosted instance at `https://oss-protector.raedbahri90.workers.dev`.
- The GitHub App webhook handler and any code path reachable from a webhook event.
- Public API endpoints (`/api/accounts`, `/api/protectors`).
- Authentication flows (Better Auth, GitHub App installation).

Out of scope:

- Rate-limit exhaustion against public endpoints (we already rate-limit; please don't try to bypass it).
- Findings that require physical access to a maintainer's machine.
- Social engineering of maintainers or users.
- Issues in upstream dependencies that have not been triaged by the upstream project — please report those upstream first.

## Disclosure

Once a fix is shipped and the hosted instance is updated, we'll publish a security advisory crediting the reporter (unless you prefer to remain anonymous).
