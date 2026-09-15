# Security Policy

## Supported versions

Security fixes are provided for the latest release line and
the `main` branch.

| Version | Supported |
| ------- | --------- |
| 1.x     | ✅        |

## Reporting a vulnerability

**Please do not report security vulnerabilities through public issues, discussions, or pull
requests.**

Report privately using **[GitHub Security Advisories](https://github.com/orbivort/custotal/security/advisories/new)**
(the "Report a vulnerability" button on the Security tab).

Please include:

- A description of the vulnerability and its impact.
- Steps to reproduce, or a proof-of-concept.
- Affected version(s), commit, and configuration.
- Any suggested remediation, if you have one.

## What to expect

- **Acknowledgement** within 3 business days.
- **Assessment and severity triage** within 7 business days.
- **Fix and coordinated disclosure** as quickly as practical; we will agree on a disclosure timeline
  with you and credit you in the advisory unless you prefer to remain anonymous.

Please give us a reasonable opportunity to release a fix before public disclosure.

## Scope

In scope:

- The backend API in `packages/backend` (authentication, sessions, RBAC, rate limiting, CSRF,
  input handling, data exposure).
- The frontend SPA in `packages/frontend` (XSS, unsafe rendering, secret handling).
- The operational scripts in `packages/backend/scripts`.
- CI workflows and dependency/supply-chain configuration.

Out of scope:

- Vulnerabilities in third-party dependencies that already have an upstream advisory (report upstream;
  Dependabot and the weekly audit track these).
- Findings that require a pre-compromised host, physical access, or a malicious database
  administrator.
- Denial of service through unrealistic traffic volumes that the documented single-instance limits
  are not intended to absorb (see `packages/backend/docs/operations-notes.md`).

## Security design notes

Custotal is self-hosted and single-tenant. For operators, the relevant hardening guidance is
maintained in:

- [`packages/backend/docs/operations-notes.md`](packages/backend/docs/operations-notes.md) — security
  behavior, defaults, and single-instance limitations.
- [`docs/self-hosting.md`](docs/self-hosting.md) — production configuration checklist.

Key properties: opaque database-backed sessions (only the token digest is stored), HttpOnly/Secure
cookies, bcrypt password hashing, server-side RBAC, per-endpoint rate limiting, CSRF origin checks,
security headers, and no PII in production logs.

## Automated scanning

- **CodeQL** (security-extended) on every push and pull request, plus weekly. The
  evaluated alerts — fixed, and the few reviewed false positives suppressed in
  `.github/codeql/codeql-config.yml` — are recorded in
  `packages/backend/docs/operations-notes.md` (§9).
- **Dependency review** on pull requests — fails on high-severity advisories and GPL/AGPL-family
  licenses.
- **`pnpm audit`** weekly on the full lockfile.
- **Dependabot** for dependency updates.

## Safe harbor

We consider security research conducted in good faith, under this policy, to be authorized. We will
not pursue legal action against researchers who follow this policy, and we will work with you to
understand and resolve the issue.
