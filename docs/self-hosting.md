# Self-hosting Custotal

This guide covers configuring and running Custotal in production. Custotal is single-tenant and
self-hosted: you run one backend process and serve the built frontend, backed by your own PostgreSQL
database.

> **Single-instance constraint:** the current backend assumes exactly one process (in-memory rate
> limiting and an in-process purge timer). See
> [operations notes](../packages/backend/docs/operations-notes.md) before scaling out.

## Prerequisites

- Node `^24.19.0` and pnpm `^11.21.0`.
- PostgreSQL `18+` (the schema uses the built-in `uuidv7()` default).
- For production email delivery: an SMTP server for invitations and password resets.
- A reverse proxy (nginx, Caddy, …) that terminates TLS and serves the SPA and API from one origin.

Only Docker is required for the [Docker path](#docker) below; the Node/pnpm prerequisites apply to a
from-source install. The `pnpm docker:*` wrappers used there are optional convenience — every one of
them is a thin wrapper around a `docker compose --env-file .env.docker <command>`, so the Docker path
works without Node and pnpm.

## Docker

Multi-stage images for the API and the SPA, plus a Compose stack that wires them to PostgreSQL 18,
are the fastest supported way to self-host Custotal. Docker with Compose v2.24 or newer is the only
prerequisite.

```bash
cp .env.docker.example .env.docker    # set POSTGRES_PASSWORD at minimum
pnpm docker:up                        # builds both images and starts the stack
```

Without Node and pnpm, that second line is `docker compose --env-file .env.docker up -d --build`.

`.env.docker` is the single environment file the stack reads — database credentials, public origin,
image tag, and the application settings (SMTP, locale, retention). The root `package.json` `docker:*`
scripts pass `--env-file .env.docker` for you; a raw `docker compose` call still needs it, because
Compose only auto-loads a file named `.env`. See [Configuration](#configuration).

The workspace is then served from <http://localhost:8080>; PostgreSQL and the API stay on the
internal Compose network. Compose starts four services:

| Service   | Role                                                                     |
| --------- | ------------------------------------------------------------------------ |
| `db`      | PostgreSQL 18 with the data directory on a named volume.                 |
| `migrate` | One-shot `prisma migrate deploy` from the backend `tools` image (below). |
| `backend` | Express API on port 4000, non-root, with a `/health` database probe.     |
| `web`     | nginx serving the SPA and proxying `/api` and `/health` to the API.      |

### Configuration

One file configures the whole stack: **`.env.docker`** at the repository root, created from
`.env.docker.example`. It holds both halves of the configuration:

- the values Compose substitutes — database credentials, published ports, image tag, registry, and
  the public origin (`APP_PUBLIC_URL`, `CORS_ORIGINS`, `COOKIE_SECURE`, `INSTANCE_HOSTNAME`); and
- the application settings injected into the `backend` container — SMTP, tenant locale, backup
  retention, purge schedule.

Because Compose reads that one file twice (for `$…` substitution and as the API's `env_file`), a value
can no longer be set in one place and silently read from another. Precedence for the API container is
built-in defaults (`packages/backend/src/config.ts`) → `.env.docker` → the Compose `environment`
blocks, which own `NODE_ENV`, `PORT`, `DATABASE_URL`, `TRUST_PROXY`, and `INSTANCE_ENVIRONMENT`. Any
key the file omits keeps its built-in default.

Every `docker compose` command needs `--env-file .env.docker`, because Compose only auto-loads a file
named `.env`. The root `package.json` wraps the recurring commands so the flag is never typed by hand,
and they behave the same in PowerShell, `cmd.exe`, bash and CI:

- `pnpm docker:build`, `pnpm docker:up`, `pnpm docker:down` — build, start/rebuild, stop.
- `pnpm docker:ps`, `pnpm docker:logs` — status and follow logs.
- `pnpm docker:pull` — fetch the pinned images for an upgrade.
- `pnpm docker:migrate` — run the one-shot migration job manually.
- `pnpm docker:dev` — the `docker-compose.dev.yml` override stack.

Commands without a wrapper (backups, `exec`, the first administrator) still pass the flag:

```bash
docker compose --env-file .env.docker ps
```

To drop the flag entirely for a shell session — not portable to `cmd.exe` or CI — export it:

```bash
export COMPOSE_ENV_FILES=.env.docker    # PowerShell: $env:COMPOSE_ENV_FILES = '.env.docker'
```

> **The Docker stack deliberately does not read `packages/backend/.env`.** That file belongs to the
> from-source / `pnpm dev` setup: it points at a localhost database and carries development origins
> and identity (`NODE_ENV=development`, `INSTANCE_ENVIRONMENT=development`,
> `APP_PUBLIC_URL=http://localhost:5173`). Reading it in a deployment would silently blend a
> development environment — and its credentials — into production. Deployment settings previously
> kept in `packages/backend/.env.docker` (or in a root `.env`) now belong in the root `.env.docker`.

`COOKIE_SECURE` must be `true` once TLS terminates in front of `web`, and `APP_PUBLIC_URL` /
`CORS_ORIGINS` must be the exact public origin — invite/reset links and the CSRF origin check depend
on them. Set `CUSTOTAL_TAG` to a released version to pull prebuilt images from the GitHub Container
Registry instead of building locally. Keep the `v` (`CUSTOTAL_TAG=v1.0.0`): the pipeline tags images
with the release ref as-is. Only released tags are published — there is no `latest` — so an upgrade
is always an explicit version bump in `.env.docker` followed by `pnpm docker:pull`.

### Package registry mirror

Both images download their npm/pnpm packages during `docker build` from the registry named by the
`NPM_REGISTRY` build argument. It defaults to the official `https://registry.npmjs.org/`, so builds
behave exactly as before when it is omitted. When npmjs.org is slow or unreachable, point it at a
mirror (used for Corepack fetching pnpm and for every `pnpm install`):

```bash
docker build -f packages/backend/Dockerfile \
  --build-arg NPM_REGISTRY=your-mirror-registry \
  -t custotal-backend .
```

The Compose stack forwards the same value to both images, so set it once in `.env.docker`;
`pnpm docker:build` and `pnpm docker:up` both pick it up:

```dotenv
NPM_REGISTRY=your-mirror-registry
```

The argument only governs the npm registry; Prisma's database engines are fetched from Prisma's own
binary host, not npm.

### First administrator

There is no registration flow, so provision the first administrator once the stack is up:

```bash
docker compose --env-file .env.docker exec -e ADMIN_EMAIL=you@example.com backend \
  node scripts/create-admin.ts
```

The script prints a temporary password when `ADMIN_PASSWORD` is omitted, and the account must rotate
it at first sign-in.

### Migrations

The `migrate` service applies pending migrations before `backend` starts, which waits for it to exit
successfully (`service_completed_successfully`). Keeping migrations out of the API container makes
start-up deterministic and avoids races. To run them manually:

```bash
pnpm docker:migrate
```

The backend Dockerfile builds two targets and Compose uses both:

| Image                          | Target    | Role                                                                                                      |
| ------------------------------ | --------- | --------------------------------------------------------------------------------------------------------- |
| `custotal-backend:<tag>`       | `runtime` | The API. Production dependencies only: no Prisma CLI, no TypeScript/Vitest/ESLint, no frontend toolchain. |
| `custotal-backend:<tag>-tools` | `tools`   | The `migrate` job (and any CLI work). Adds the Prisma CLI and the engines `prisma migrate deploy` uses.   |

Only the `runtime` image runs continuously, so only it is size-optimised; `tools` is pulled, used for a
few seconds per upgrade, and can be dropped again with `docker image rm custotal-backend:<tag>-tools`.
Released versions publish every image under the same tag — `custotal-backend:v1.0.0`,
`custotal-backend:v1.0.0-tools` and `custotal-frontend:v1.0.0` — so one `CUSTOTAL_TAG` pins the whole
stack. Shorter aliases (`1.0.0`, `1.0`) are published too, but prefer the full release tag. There is
deliberately no `latest`: the `-tools` variant is derived as `${CUSTOTAL_TAG}-tools`, so a floating
tag could never resolve the `migrate` job's image.

Because the API image ships no Prisma CLI, `RUN_MIGRATIONS=true` works on the `tools` image only: the
API entrypoint detects the missing CLI, says so, and exits instead of serving an unmigrated database.
To still fold migrations into API start-up — a single-container install — run the API from that image
by pointing the `backend` service at it in a Compose override (`services.backend.build.target: tools`
plus the matching `-tools` image), then set `RUN_MIGRATIONS=true` in `.env.docker`.

### TLS

`web` serves plain HTTP on port 8080 and is meant to sit behind a TLS-terminating reverse proxy or
load balancer. Forward the original `Host`, `X-Forwarded-For`, and `X-Forwarded-Proto` headers and
keep `TRUST_PROXY` set (the Compose default is `1`) so `req.ip` — and therefore rate limiting —
resolves to the real client.

### Backups

The backend image does not ship `pg_dump`, so run backups against the database container and keep
the dump on the host. The wrapper script does this end to end (dump inside `db`, copy the file out,
prune dumps older than `BACKUP_RETENTION_DAYS`) and works from any shell — including PowerShell:

```bash
pnpm docker:backup
```

It reads `.env.docker` for the Compose environment, writes to `backups/` (override with `BACKUP_DIR`)
as `custotal-<timestamp>.dump`, and applies the retention window (override with `BACKUP_RETENTION_DAYS`).
Schedule it from cron / Task Scheduler, then follow the
[restore procedure](../packages/backend/docs/restore-procedure.md) to verify a restore.

To do it by hand on a POSIX shell instead:

```bash
docker compose --env-file .env.docker exec -T db pg_dump -U custotal -d custotal --format=custom --no-owner \
  > backups/custotal-$(date +%F).dump
```

### Upgrades

```bash
pnpm docker:pull    # or: git pull && pnpm docker:build
pnpm docker:up      # the migrate service applies new migrations first
```

### Constraints and image verification

The backend is deliberately single-instance: rate limiting is in-process and the purge scheduler is
an in-process timer, so do not scale `backend` beyond one replica. Released images are published with
an SBOM and a provenance attestation (inspect them with `docker buildx imagetools inspect`); scan a
pinned tag with your preferred scanner and refresh it as part of routine patching.

## Build and migrate

```bash
pnpm install --frozen-lockfile

# Frontend production bundle → packages/frontend/dist
pnpm build

# Backend: configure packages/backend/.env first (see below), then:
pnpm --filter @custotal/backend db:migrate:deploy
```

## Configuration

For a from-source install, backend settings live in `packages/backend/.env` (see `.env.example` for
the annotated master list); the Docker stack configures the same settings through its single
`.env.docker` file (see above). The variables that most affect a production deployment:

| Variable                              | Notes                                                                                           |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `NODE_ENV`                            | Set to `production`.                                                                            |
| `PORT`                                | Backend listen port (default `4000`).                                                           |
| `DATABASE_URL`                        | PostgreSQL connection string.                                                                   |
| `COOKIE_SECURE`                       | Must be `true` behind HTTPS (it defaults to `true` in production).                              |
| `COOKIE_SAMESITE`                     | Keep `lax`; the CSRF origin check relies on it and `CORS_ORIGINS`.                              |
| `CORS_ORIGINS`                        | Exact frontend origin(s). Required for cross-origin deployments and used by the CSRF check.     |
| `TRUST_PROXY`                         | Set when behind a reverse proxy/LB so `req.ip` (and rate limiting) resolves to the real client. |
| `APP_PUBLIC_URL`                      | Public frontend origin used to build invite/reset links.                                        |
| `SMTP_*`                              | Mail delivery. Left empty, the mailer logs instead of sending (development only).               |
| `TENANT_TIMEZONE`                     | IANA name used for date-only semantics and "overdue" calculation (default `UTC`).               |
| `BACKUP_DIR`, `BACKUP_RETENTION_DAYS` | Backup destination and retention (defaults `./backups`, `30`).                                  |
| `MAINTENANCE_PURGE_*`                 | In-process purge schedule (default 02:00 server-local).                                         |

The backend logs a set of **production configuration warnings** at startup for unsafe combinations
(`COOKIE_SECURE=false`, localhost `APP_PUBLIC_URL`, empty `CORS_ORIGINS`, unset `TRUST_PROXY`).

Frontend build-time variables (`packages/frontend/.env.local` or your CI environment):

| Variable                | Notes                                                                   |
| ----------------------- | ----------------------------------------------------------------------- |
| `VITE_API_BASE_URL`     | Leave empty for a same-origin deployment (recommended).                 |
| `VITE_ENABLE_MOCKS`     | Must **not** be `true` in production. Never set it for deployed builds. |
| `VITE_DEFAULT_CURRENCY` | ISO 4217 default currency (falls back to `USD`).                        |

Frontend variables are baked in at build time, so changing one requires a rebuild.

## First administrator

There is no registration flow and user creation is admin-guarded, so a freshly migrated database has
no way to sign in. Provision the first administrator with:

```bash
ADMIN_EMAIL=you@example.com pnpm --filter @custotal/backend db:create-admin
```

The script is idempotent and enforces a single-administrator policy. If `ADMIN_PASSWORD` is omitted it
generates a temporary password (printed once) and forces a rotation at first sign-in.

## Serving the SPA

Serve `packages/frontend/dist` as static files and reverse-proxy `/api` and `/health` to the backend
process. Keep the SPA and API on **one origin** so the `ct_session` cookie flows without CORS or
`SameSite` edge cases. If you must split origins, set `VITE_API_BASE_URL` and add the API origin to
`CORS_ORIGINS`.

## Backups

Schedule the backup externally so it keeps running when the app is down:

```bash
# cron — every day at 02:00
0 2 * * * cd /srv/custotal/packages/backend && pnpm backup
```

```powershell
# Windows Task Scheduler — daily
pnpm --filter @custotal/backend backup
```

`pg_dump` must be on `PATH` (or set `PG_DUMP_PATH`). Dumps accumulate in `BACKUP_DIR` and older than
`BACKUP_RETENTION_DAYS` are pruned. Execute and record the restore test in
[restore-procedure.md](../packages/backend/docs/restore-procedure.md) before going live.

Soft-deleted records are purged after 30 days. The backend schedules this in-process; to use an
external scheduler instead, set `MAINTENANCE_PURGE_ENABLED=false` and run `pnpm purge` on a timer.

## Upgrades

1. Back up the database.
2. Pull the new revision and `pnpm install --frozen-lockfile`.
3. `pnpm --filter @custotal/backend db:migrate:deploy`.
4. `pnpm build`, then restart the backend and refresh the served SPA.

The backend drains in-flight requests on `SIGTERM` within a 10-second grace window.

## Observability

Structured pino logs go to stdout with request-id correlation. Ship them to your log store and set a
retention window (30 days is the product requirement). Forward `level >= 50` events to an error
tracker. Do not index PII — recipient email addresses are withheld from production logs by design.

## Production checklist

- [ ] `NODE_ENV=production`, `COOKIE_SECURE=true`, TLS terminated at the proxy.
- [ ] `CORS_ORIGINS` and `TRUST_PROXY` set correctly for your topology.
- [ ] SMTP configured and a password-reset email verified end to end.
- [ ] First administrator created and its temporary password rotated.
- [ ] Daily backup scheduled; restore test executed and recorded.
- [ ] Log shipping and 30-day retention configured; error tracker wired up.
- [ ] `pnpm audit` clean; CodeQL and Dependabot alerts reviewed.
- [ ] `VITE_ENABLE_MOCKS` unset in the production frontend build.
- [ ] (Docker) images pinned to a released tag — never `latest` — and scanned; `db-data` and
      `backups` volumes persisted outside the containers.
