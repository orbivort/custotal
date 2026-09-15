# Changelog

All notable changes to Custotal are documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Releases are listed newest first, each
under a `## [<version>] - <date>` heading, and the entries within a release are grouped under the
applicable change types — `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, and `Security`. A
change type is omitted for releases that have no changes of that kind. Entries describe the effect
on people who run and use Custotal, not the internal commit history.

## [1.0.0] - 2026-09-13

Initial public release — Custotal is a self-hosted CRM that keeps your customer data in your
custody: one API process, one PostgreSQL database, one Compose file. It covers the working surface of
a small sales team, from customer records and interaction history to a configurable deal pipeline,
tasks, and reporting, behind email/password authentication with server-side role-based access
control.

### Added

- **Customer data** — contact and account CRUD with soft delete, primary and role links between
  contacts and accounts, server-side filtering, sorting, and pagination, and full created/modified
  audit fields.
- **Interactions** — five interaction types with channel and direction, attachable to contacts,
  accounts, and opportunities, and shown on shared reverse-chronological timelines.
- **Pipeline** — a configurable single sales pipeline with kanban drag-and-drop, stage history,
  automatic probability updates, loss reasons, and owner and stage filters.
- **Tasks** — task CRUD with complete and reopen, completion history, my/all views, filters and
  sorting, overdue highlighting, and a header badge.
- **Reports** — pipeline-by-stage and win/loss reports with summary tables, charts, and CSV export.
- **Search** — grouped global search across contacts, accounts, and opportunities.
- **CSV import** — an administrator wizard with column mapping, duplicate handling, and a dry run
  before committing.
- **Authentication and access control** — email/password sign-in, database-backed sessions with an
  eight-hour idle timeout, self-service password reset, and invitation-based onboarding. Access is
  enforced server-side through roles (admin, manager, rep) and owner-scoped visibility.
- **Recovery** — a 30-day soft-delete trash with administrator restore and purge.
- **Operations** — structured logging, `/health` probes, a documented backup and purge workflow with
  a restore runbook, and startup warnings for unsafe production configuration.
- **Self-hosting** — multi-stage, non-root Docker images for the API and the SPA, and a Compose
  stack (PostgreSQL 18, API, and nginx) with a one-shot migration service. The stack is configured
  through a single `.env.docker` file at the repository root (copy from `.env.docker.example`), and
  the root `docker:*` scripts wrap the common Compose commands with the matching `--env-file`. The
  API image ships production dependencies only, while a matching `<version>-tools` image supplies
  the Prisma CLI that migrations require. Release images are published to the GitHub Container
  Registry with SBOM and provenance attestations.
- **Development tooling** — a pnpm monorepo with a shared dependency catalog, strict TypeScript,
  Vitest test tiers (unit, integration, end-to-end, and frontend), ESLint, Prettier, and Stylelint,
  plus continuous integration with CodeQL, dependency review, and a weekly dependency audit.

### Security

- **Session handling** — sessions are database-backed and opaque: only the SHA-256 digest of the
  token is stored, while the token itself is held in an HttpOnly, SameSite cookie that is Secure in
  production, and expires after eight hours of inactivity.
- **Authentication hardening** — passwords are hashed with bcrypt, sign-in and other sensitive
  endpoints are rate limited, state-changing requests are validated against the configured origin,
  security headers are set on every response, and production logs exclude personally identifiable
  information.
- **Supply chain** — released container images are published with an SBOM and a provenance
  attestation, and the dependency-review workflow blocks newly introduced high-severity advisories
  and copyleft licenses.

[1.0.0]: https://github.com/orbivort/custotal/releases/tag/v1.0.0
