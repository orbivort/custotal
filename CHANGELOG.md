# Changelog

All notable changes to Custotal are documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Releases are listed newest first, each
under a `## [<version>] - <date>` heading, and the entries within a release are grouped under the
applicable change types — `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, and `Security`. A
change type is omitted for releases that have no changes of that kind. Entries describe the effect
on people who run and use Custotal, not the internal commit history.

## [1.0.3] - 2026-11-03

### Security

- Remediate **30** dependency vulnerabilities (**8 high**, **19 moderate**, **3 low** severity):
  - `undici` 8.10.2 → 8.12.3 (dev-only, via `jsdom`) — fixes a denial of service through unhandled
    errors on excessive content-encodings
    ([GHSA-xjj6-f33q-929c](https://github.com/advisories/GHSA-xjj6-f33q-929c)), cache poisoning and
    cross-user disclosure via cross-origin redirects
    ([GHSA-4w7w-5xrc-9h26](https://github.com/advisories/GHSA-4w7w-5xrc-9h26)), a TLS certificate
    validation bypass from dropped `tls` options in `Agent`
    ([GHSA-2m5v-pch6-74hx](https://github.com/advisories/GHSA-2m5v-pch6-74hx)), a denial of service
    through TLS 1.2 certificate-changing renegotiation
    ([GHSA-qrxm-fqhp-jwvm](https://github.com/advisories/GHSA-qrxm-fqhp-jwvm)), unbounded memory in
    the EventSource parser
    ([GHSA-4qv8-2p9j-2685](https://github.com/advisories/GHSA-4qv8-2p9j-2685)), a Subresource
    Integrity bypass via non-lowercase algorithm tokens
    ([GHSA-f72v-6w45-q472](https://github.com/advisories/GHSA-f72v-6w45-q472)), unbounded automatic
    PONG buffering in the WebSocket client
    ([GHSA-9fm3-97px-rjf6](https://github.com/advisories/GHSA-9fm3-97px-rjf6)), and an unhandled
    exception in the decompress interceptor
    ([GHSA-55wc-3pg8-jfw6](https://github.com/advisories/GHSA-55wc-3pg8-jfw6))
  - `vite` 8.3.1 → 8.3.5 — fixes a bypassable `fs.existsSync()` check in `launch-editor` on Windows
    ([GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm)), omitted `%` escaping
    in `escapeCmdArgs()` on Windows
    ([GHSA-698v-4r3x-3vcv](https://github.com/advisories/GHSA-698v-4r3x-3vcv)), editor CLI flag
    misinterpretation causing arbitrary command execution
    ([GHSA-r825-w8mm-5pxw](https://github.com/advisories/GHSA-r825-w8mm-5pxw)), serving files outside
    `server.fs.allow` when project paths match system paths
    ([GHSA-rq7h-c2jc-7f22](https://github.com/advisories/GHSA-rq7h-c2jc-7f22)), exposure of the first
    four bytes of files outside `server.fs` via `?vite-wasm-instance`
    ([GHSA-vfpm-58rq-9qcg](https://github.com/advisories/GHSA-vfpm-58rq-9qcg)), and cross-origin
    script execution through Vite custom middleware
    ([GHSA-9jrq-w75r-8gcw](https://github.com/advisories/GHSA-9jrq-w75r-8gcw))
  - `zod` 4.5.4 → 4.6.7 — fixes memory exhaustion while validating oversized constrained collections
    ([GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5))
  - `body-parser` 2.3.0 → 2.4.0 — fixes a denial of service via trailing bytes after a compressed
    request body ([GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828))
  - `source-map-js` 1.2.1 → 1.2.2 — fixes an event-loop denial of service through indexed source-map
    section offsets
    ([GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q))
  - `nodemailer` 10.1.0 → 10.3.1 — fixes an `addressparser` weakness where a nested comment ends early
    and releases the rest of the comment as a recipient
    ([GHSA-8c8m-p3m8-cjg8](https://github.com/advisories/GHSA-8c8m-p3m8-cjg8)), a `;` inside a quoted
    string or comment ending an address group early and turning display text into a recipient
    ([GHSA-m943-m63m-w62w](https://github.com/advisories/GHSA-m943-m63m-w62w)), and a `>` inside a
    quoted local part ending an angle-addr early and delivering to a domain the header does not name
    ([GHSA-85x2-q946-cp5h](https://github.com/advisories/GHSA-85x2-q946-cp5h))
  - `@vitest/mocker` 4.1.11 → 4.1.12 (dev-only, via `vitest`) — fixes code injection via
    unauthenticated manual mock registration
    ([GHSA-qxg6-89mg-rqv8](https://github.com/advisories/GHSA-qxg6-89mg-rqv8)) and a Windows backslash
    traversal that bypasses the redirect allowlist
    ([GHSA-xp26-3454-mjgp](https://github.com/advisories/GHSA-xp26-3454-mjgp))
  - `fast-uri` 3.1.8 → 3.1.9 — fixes URI scheme spoofing via percent-encoded scheme decoding
    ([GHSA-w74x-v6f9-j3xg](https://github.com/advisories/GHSA-w74x-v6f9-j3xg)), host confusion via
    unchecked WHATWG host canonicalization
    ([GHSA-wjr9-j795-jxcr](https://github.com/advisories/GHSA-wjr9-j795-jxcr)), improper path
    equivalence in relative reference normalization
    ([GHSA-xhq7-xmqj-769h](https://github.com/advisories/GHSA-xhq7-xmqj-769h)), and scheme injection
    via an unescaped first-segment colon in suffix references
    ([GHSA-333x-w4r6-6crp](https://github.com/advisories/GHSA-333x-w4r6-6crp))
  - `ip-address` 10.7.2 → 10.7.5 — fixes `Address6` matching a zone identifier in quadratic time
    ahead of its length limit, allowing a single long string to stall the process
    ([GHSA-rxp7-6hxx-x8q5](https://github.com/advisories/GHSA-rxp7-6hxx-x8q5))
  - `postcss-selector-parser` 7.1.5 → 7.1.7 — fixes quadratic complexity in flat selector parsing
    that allows CPU exhaustion
    ([GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf))
  - `qs` 6.16.0 → 6.16.2 — fixes `qs.stringify` with `arrayFormat: 'comma'` throwing an uncaught
    `TypeError` on array elements carrying a non-callable own `toString`
    ([GHSA-6pq8-jhm2-2vcw](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw))
  - `minimatch` 10.2.6 → 11.0.4 — fixes a potential denial of service via globparts amplification
    ([GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249))

### Changed

- Merge branch 'main' of https://github.com/orbivort/custotal

### Fixed

- fix: security vulnerability remediation

### Maintenance

- chore(deps): bump nodemailer from 10.0.13 to 10.1.0
- chore(deps): bump express from 5.2.1 to 5.3.0
- chore(deps): bump nodemailer from 10.0.10 to 10.0.13
- ci: update release prepare workflow

## [1.0.2] - 2026-09-30

### Security

- Remediate **5** dependency vulnerabilities (**2 high**, **3 moderate** severity):
  - `ip-address` 10.7.0 → 10.7.2 — fixes `isInSubnet()` and `isHostInSubnet()` comparing addresses of
    different families as though they shared one address space, which lets an allowlist check admit an
    address outside its range
    ([GHSA-j6r3-76f7-8jcv](https://github.com/advisories/GHSA-j6r3-76f7-8jcv)), and an `Address6` parse
    diagnostic that grows with the input with no length bound, allowing a single long string to stall
    the process
    ([GHSA-h3mg-xc3c-68pw](https://github.com/advisories/GHSA-h3mg-xc3c-68pw))
  - `fast-uri` 3.1.6 → 3.1.8 — fixes malformed URI authority handling: an unvalidated port in
    `serialize` that enables authority injection
    ([GHSA-qw65-cvwx-89v3](https://github.com/advisories/GHSA-qw65-cvwx-89v3)), an unclosed bracket in
    the URI authority that causes host confusion
    ([GHSA-58mr-gqgx-xq4g](https://github.com/advisories/GHSA-58mr-gqgx-xq4g)), and percent-encoded
    octets that evade host case normalization
    ([GHSA-hrr3-gc8f-f4qj](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj))

## [1.0.1] - 2026-09-15

### Security

- **Email validation hardening** — an email address is now checked with a linear-time validator that
  caps the field at the RFC 5321 maximum (254 characters) before any matching, instead of a pattern
  that backtracked.

### Documentation

- docs: update changelog

### Maintenance

- chore: update release workflow
- chore: add github pages
- chore: fix codeql reported issues
- chore(deps-dev): bump the root-dev-dependencies group across 1 directory with 4 updates
- chore: update readme
- chore(deps): bump the github-actions group across 1 directory with 4 updates
- chore(deps): bump nodemailer from 10.0.3 to 10.0.8

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

[1.0.3]: https://github.com/orbivort/custotal/releases/tag/v1.0.3
[1.0.2]: https://github.com/orbivort/custotal/releases/tag/v1.0.2
[1.0.1]: https://github.com/orbivort/custotal/releases/tag/v1.0.1
[1.0.0]: https://github.com/orbivort/custotal/releases/tag/v1.0.0
