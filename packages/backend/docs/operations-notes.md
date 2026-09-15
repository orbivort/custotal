# Operations & Known Limitations

Decisions and deferred work recorded after the Node.js 24 best-practices review
(September 2026). Each item is intentional for the current single-instance MVP
stage; revisit when scaling or hardening further.

## 1. Single-instance constraints (deferred scale-out work)

The backend currently assumes **exactly one process instance**:

- **In-memory rate-limit stores** (`src/middleware/rate-limit.ts`). Counters are
  per-process. Running a second replica would multiply the effective limits by
  the replica count and desynchronize per-email brute-force protection.
  _Before the second replica_: swap `express-rate-limit` to a shared store
  (`rate-limiter-redis` + Redis) — the middleware API supports it without
  route changes.
- **Single-runner purge timer.** The daily soft-delete purge is an in-process
  timer armed once the server is listening, so two replicas would both run it.
  _Before the second replica_: move the purge to an external scheduler or guard
  it with a PostgreSQL advisory lock.
- **No APM / metrics agent**. Structured pino logs (stdout, request-id
  correlated) are the observability surface; a diagnostics/maintenance endpoint
  is not implemented. Revisit when event-loop lag and memory trend monitoring
  are needed.

Container images **do** exist: both packages ship a multi-stage Dockerfile
(`packages/backend/Dockerfile`, `packages/frontend/Dockerfile`) that runs as a
non-root user with a container health check, and the release pipeline publishes
them to GHCR with an SBOM and a provenance attestation. `docker-compose.yml` is
the supported deployment path. A from-source deployment still assumes
`NODE_ENV=production`, `COOKIE_SECURE` (default-on in production), and a process
supervisor (systemd / container runtime) to handle restarts — the app itself
drains in-flight requests on `SIGTERM` within a 10 s grace window
(`src/index.ts`).

## 2. Password hashing stays on bcryptjs

`bcryptjs` (pure JS, 10 rounds) is intentionally kept: it avoids a native
compilation dependency, and at current login volume the event-loop cost is
acceptable. If login traffic grows, migrate to native `bcrypt`/`argon2id` or
Node's built-in `crypto.scrypt` — that requires a rehash-on-login path to
convert existing hashes transparently.

## 3. PATCH cannot clear optional fields to empty

`updateContact` and similar updaters treat an empty/whitespace string as "no
change" (`optionalString(value) ?? existing.field`). There is currently **no
wire format to clear an optional field** (e.g. set `notes` back to null). If
that becomes a product requirement, adopt "explicit `null` clears the field"
in both the API and the frontend, since `undefined` already means "leave
unchanged".

## 4. Environment variables added in this hardening pass

| Variable        | Default                                 | Purpose                                                                                                                                                                                                       |
| --------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TRUST_PROXY`   | unset (no proxy trust)                  | Express `trust proxy` setting: hop count (e.g. `1`) or comma-separated proxy IPs/subnets. **Required behind a reverse proxy/LB** so `req.ip` — and therefore rate-limit keying — resolves to the real client. |
| `COOKIE_SECURE` | `true` in production, `false` otherwise | Session-cookie `Secure` flag. Previously defaulted to `false` everywhere.                                                                                                                                     |

Invalid `NODE_ENV`, `INSTANCE_ENVIRONMENT`, or `COOKIE_SAMESITE` values now
fail startup with a descriptive error instead of being silently cast.

`package.json` scripts use `node --env-file-if-exists=.env` so a missing `.env`
file is no longer an error when the environment already exports the variables.

## 5. Security behavior changes in this hardening pass

- Temporary passwords and password-reset links are **never written to logs**;
  the mailer's SMTP-unconfigured fallback prints the message body only in
  development.
- Login rate limiting keys on **email+IP** (5/min), capping brute force per
  account rather than per source address.
- Client-supplied `X-Request-Id` is honored only if it matches
  `^[A-Za-z0-9_-]{1,64}$`; anything else is replaced by a UUID.
- Every response carries `X-Content-Type-Options: nosniff` and
  `X-Frame-Options: DENY`; HSTS is sent when secure cookies are enabled.
- JSON body limit is **1 MB globally**; only `/api/import/*` accepts up to
  12 MB.
- `scripts/backup.ts` passes pg_dump credentials through `PG*` environment
  variables instead of the command line.
- ESLint runs `eslint-plugin-security` over `packages/backend/src` and
  `scripts/`; `@typescript-eslint/no-explicit-any` is enforced there (tests
  excluded).

## 6. Security behavior changes in the MVP remediation pass

- **`GET /api/meta` now requires authentication.** It previously returned the
  full user roster and account index anonymously. `GET /api/health` stays public
  (the sign-in screen depends on it).
- **Admin-only failures return `403 forbidden`** for signed-in non-admins
  (`requireAdmin`); anonymous callers receive `401 unauthorized` so the client
  can re-authenticate.
- **CSRF origin check** (`src/middleware/csrf.ts`) rejects state-changing
  requests (`POST/PATCH/PUT/DELETE`) whose `Origin`/`Referer` is neither the
  request host nor a `CORS_ORIGINS` entry. Requests with no such header
  (server-to-server, curl, tests) pass through. `SameSite=Lax` is retained.
  _Constraint_: if `COOKIE_SAMESITE=none` is ever set, the origin allow-list
  becomes the only CSRF defence — keep `CORS_ORIGINS` minimal and correct.
- **Instance UX flags are environment-driven**:
  `INSTANCE_ALLOW_PASSWORD_RESET` (default `true`) and `INSTANCE_SETUP_REQUIRED`
  (default `false`).
- **Production config warnings** are collected (`env.warnings`) and logged once
  at startup: `COOKIE_SECURE=false`, `APP_PUBLIC_URL` pointing at localhost,
  empty `CORS_ORIGINS`, and unset `TRUST_PROXY`.
- **No recipient email addresses in production logs** — `admin-service` and
  `mailer` keep them only in development diagnostics.

## 7. Deployment runbook (manual gates before launch)

These are operator steps, not code. They are **launch-blocking** where noted.

### 7.1 SMTP delivery for password reset / invitations (launch-blocking)

The mailer (`src/services/mailer.ts`) already uses `nodemailer`; with the
shipped `.env` (`SMTP_HOST=` empty) it degrades to logging and **no email is
delivered**. To enable delivery:

1. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and a
   valid `SMTP_FROM` in `packages/backend/.env`.
2. Ensure `SMTP_TEST_MODE` is **not** `true` in the target environment.
3. Set `APP_PUBLIC_URL` to the public frontend origin (invite/reset links are
   built from it).
4. Verify: request a reset from the sign-in screen and confirm the email
   arrives; confirm the link opens `/reset-password?token=…`.
5. If delivery is unavailable, the invitation flow still works: the admin
   receives a one-time temporary password in the create-user response and the
   user is forced to rotate it on first login.

### 7.2 Log retention & error tracking (FR-CC-12 completion)

- Ship stdout logs to the platform's log store and configure **30-day
  retention**.
- Provision an error tracker (e.g. Sentry) and forward `level>=50` events; the
  handler already logs full error objects for 5xx.
- Confirm no PII is indexed: recipient emails are withheld outside development.

### 7.3 Backup & purge scheduling (FR-CC-04, launch-blocking)

**Purge is automatic and in-process.** Once the server is listening it arms a
daily timer that purges soft-deleted records older than 30 days at
`MAINTENANCE_PURGE_HOUR:MAINTENANCE_PURGE_MINUTE` (server-local, default 02:00).
Set `MAINTENANCE_PURGE_ENABLED=false` to disable it when an external scheduler
runs `pnpm purge` instead.

**Backup stays external.** Schedule `pnpm backup` from the OS (details in
`docs/restore-procedure.md`) so it keeps running when the app is down:

- Windows Task Scheduler: daily `pnpm backup` in `packages/backend`.
- cron: `0 2 * * * cd /srv/custotal/packages/backend && pnpm backup`.

**ADR-0007 — auto purge runs in-process; backup stays external:**

- The purge is bounded, idempotent, off-peak, and I/O-bound (it awaits the Prisma
  pool — it does not block the event loop), and the backend is explicitly
  single-instance (§1), so scheduling it in-process removes the manual scheduler
  gate without a real performance cost. Guards: single-flight (ticks never
  overlap), error-contained (a failure is logged and never reaches the process
  crash handlers), and cancelled on `SIGTERM`.
- Expired candidates are still drained in bounded batches
  (`DEFAULT_PURGE_BATCH_SIZE = 500`) via keyset pagination on the primary key, so
  a large backlog cannot become one long transaction, an unbounded
  `WHERE id IN (...)` list, or a memory spike.
- Backup is deliberately NOT in-process: an independent process keeps backups
  running when the app is down, and keeps `pg_dump`/filesystem concerns out of the
  request-serving process.
- Revisit if the backend scales to multiple replicas: the in-process timer would
  then fire once per replica (the purge is idempotent, so it is safe, but move the
  trigger to a single leader / external scheduler).

### 7.4 Restore test (FR-CC-04, launch-blocking)

Execute the signed-off restore test in `docs/restore-procedure.md` against
staging before launch; record the date, operator, and evidence.

### 7.5 Reverse proxy / load balancer

- Behind a proxy, set `TRUST_PROXY` (hop count or proxy IPs) so `req.ip`
  resolves to the real client; otherwise rate limiting keys every client to the
  proxy address.
- Keep `CORS_ORIGINS` to the exact frontend origin(s); the CSRF check uses it.
- Single-instance rate limiting is per-process — see §1 before adding replicas.

### 7.6 Performance verification (FR-CC-03, FR-CC-06)

The trigram GIN indexes now exist (migration `20260904121340_init`),
so `ILIKE '%term%'` searches are index-backed. Still required before launch:
benchmark global search against a 100k-contact / 500k-interaction dataset to
confirm the < 2 s budget, and record p95 latency for the core endpoints.

## 8. First-administrator bootstrap (`db:create-admin`, launch-blocking)

User creation is admin-guarded (`POST /api/admin/users`, `requireAdmin`) and there
is no registration flow, so a freshly migrated database has no way to sign in —
no setup wizard (`INSTANCE_SETUP_REQUIRED` is a display flag with no flow behind
it). `scripts/create-admin.ts`, exposed as `db:create-admin`, closes that gap.

`scripts/create-admin.ts`, exposed as `db:create-admin`, closes that gap:

```bash
# from the repo root, with packages/backend/.env loaded
ADMIN_EMAIL=you@example.com pnpm db:create-admin
```

- **Required env**: `ADMIN_EMAIL`. **Optional**: `ADMIN_NAME` (defaults to the
  email local-part) and `ADMIN_PASSWORD`.
- **Non-destructive and idempotent**, keyed on `ADMIN_EMAIL`: it creates the
  admin only if that email is unknown, no-ops if it is already an admin, and
  promotes to admin (without touching the password) if the email exists under a
  different role. It never deletes or rewrites other rows.
- **Single-administrator policy**: before creating or promoting, the script
  checks whether an administrator already exists. If a different administrator
  is present, it refuses to create or promote a second one and exits non-zero
  with a message stating that only one admin user is permitted. Re-running for
  the existing administrator's own email remains a no-op.
- **Credential handling**: when `ADMIN_PASSWORD` is omitted the script generates
  a 12-character temporary password, prints it once, and sets
  `mustChangePassword = true` so the account must rotate it at first sign-in
  (`RequireAuth` redirects to `/change-password`). A supplied `ADMIN_PASSWORD`
  must be at least 8 characters and is treated as the user's own password.
- **Bcrypt cost** matches `auth-service.ts` (`BCRYPT_ROUNDS = 10`) so the written
  hash verifies identically at sign-in.

Launch sequence: `db:migrate:deploy` → `db:create-admin` → sign in → rotate the
password. There is no database seed: demo/mock data lives with the frontend mock
dataset (`packages/frontend/src/mocks`, enabled via `VITE_ENABLE_MOCKS`), while
the backend integration/e2e suites build their own fixture
(`packages/backend/test/fixtures/demo-workspace.ts`).
