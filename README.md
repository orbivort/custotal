# Custotal

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://www.apache.org/licenses/LICENSE-2.0)

[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white&style=flat-square)](./package.json)
[![Node.js](https://img.shields.io/badge/Node.js-%5E24-339933?logo=nodedotjs&logoColor=white&style=flat-square)](./package.json)

An **open-source customer management workspace** for small sales teams.

Custotal is a self-hosted customer management tool that you run on your own
infrastructure against your own PostgreSQL database. It covers the working
surface of a small sales team — contacts and accounts, interaction history, a
configurable deal pipeline, tasks, and reporting — behind email/password
authentication with server-side role-based access control.

> **Status:** MVP. The core workflows are implemented and covered by automated
> tests. Operational hardening items and known limitations are tracked in
> [`packages/backend/docs/operations-notes.md`](packages/backend/docs/operations-notes.md).

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Docker](#docker)
- [Configuration](#configuration)
- [Commands](#commands)
- [Project structure](#project-structure)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [Security](#security)
- [Acknowledgements](#acknowledgements)
- [License](#license)

## Features

- **Customers** — contacts and accounts with soft delete, contact↔account
  links (primary + role), and full created/modified audit fields.
- **Interactions** — five interaction types with channel and direction,
  attached to contacts, accounts, and opportunities, rendered as shared
  reverse-chronological timelines.
- **Pipeline** — a configurable single pipeline with kanban drag-and-drop,
  stage history, automatic probability updates, and loss reasons.
- **Tasks** — my/all task views, filters and sorting, completion history,
  overdue highlighting, and a header badge.
- **Reports** — pipeline-by-stage and win/loss reports with charts and CSV
  export.
- **Search** — grouped global search across contacts, accounts, and
  opportunities.
- **CSV import** — an admin wizard with column mapping, duplicate handling,
  and a dry-run before commit.
- **Access control** — email/password auth with database-backed sessions,
  server-side RBAC (admin / manager / rep), and owner-scoped visibility.
- **Recovery** — 30-day soft-delete trash with admin restore and purge.
- **Operations** — structured logging, `/health` probes, rate limiting,
  backup/purge scripts, and a documented restore runbook.

## Tech stack

| Layer    | Stack                                                            |
| -------- | ---------------------------------------------------------------- |
| Backend  | Node 24 · Express 5 · Prisma 7 · PostgreSQL 18 · pino            |
| Frontend | React 19 · Vite 8 · React Router 8 · Tailwind CSS 4              |
| Tooling  | TypeScript 6 (strict) · Vitest 4 · ESLint · Prettier · Stylelint |
| Monorepo | pnpm workspaces with a shared dependency catalog                 |

## Requirements

**Supported platforms:** Linux, macOS, and Windows. The project is developed and
tested on Node 24 and runs identically across platforms; the Docker path works
anywhere Docker is available.

Running from source requires:

- **Node** `^24.19.0` and **pnpm** `^11.21.0` (enforced through `engines`).
- **PostgreSQL 18+** — all primary keys use the built-in `uuidv7()` default, so
  older majors will fail migrations.

For a production deployment you will also want an SMTP server (invitations and
password resets) and a TLS-terminating reverse proxy. The [Docker](#docker) path
needs only Docker with Compose v2.24 or newer.

## Quick start

```bash
git clone https://github.com/orbivort/custotal.git
cd custotal
pnpm install

# 1. Backend environment
cp packages/backend/.env.example packages/backend/.env   # Windows: copy <src> <dst>
#    Then set DATABASE_URL (and TEST_DATABASE_URL) in packages/backend/.env.
pnpm --filter @custotal/backend db:migrate:deploy

# 2. Create the first administrator (there is no registration flow)
ADMIN_EMAIL=you@example.com pnpm --filter @custotal/backend db:create-admin

# 3. Frontend environment (optional; only needed to enable dev mocks)
cp packages/frontend/.env.example packages/frontend/.env.local

# 4. Start both dev servers (frontend :5173, backend :4000)
pnpm dev
```

Open <http://localhost:5173> and sign in with the administrator account created
above.

To try the UI **without a database**, set `VITE_ENABLE_MOCKS=true` in
`packages/frontend/.env.local` and run `pnpm dev` — Mock Service Worker serves a
seeded demo workspace in development only.

For a production deployment, see [`docs/self-hosting.md`](docs/self-hosting.md).

## Docker

Container images and a Compose stack are provided for self-hosting, so Docker is
the only prerequisite — Node and pnpm are not needed on the host. If you do have
pnpm, the `docker:*` scripts in the root `package.json` wrap the Compose commands
so the `--env-file` flag is never typed by hand:

```bash
cp .env.docker.example .env.docker    # set POSTGRES_PASSWORD at minimum
pnpm docker:up                        # = docker compose --env-file .env.docker up -d --build
```

`.env.docker` is the single environment file the stack reads: Compose
substitutes from it, and the API container receives its application settings
from it (SMTP, locale, retention, purge schedule). A raw `docker compose` call
still needs `--env-file .env.docker` (`pnpm docker:down`, `pnpm docker:logs`,
`pnpm docker:migrate`, … are the wrapped equivalents), because Compose only
auto-loads a file named `.env`. The stack never reads the development file
`packages/backend/.env`.

The workspace is served from <http://localhost:8080>. A one-shot `migrate`
service applies pending database migrations before the API starts, so the first
run only needs the first administrator:

```bash
docker compose --env-file .env.docker exec -e ADMIN_EMAIL=you@example.com backend \
  node scripts/create-admin.ts
```

Both images are multi-stage and run as a non-root user with a container health
check. Tagged builds publish them to the GitHub Container Registry
(`ghcr.io/orbivort/custotal-backend`, `ghcr.io/orbivort/custotal-frontend`); set
`CUSTOTAL_TAG` in `.env.docker` to pull a released version instead of building
locally. The backend is published twice from one Dockerfile: the API image
(production dependencies only) and the matching `<tag>-tools` variant that the
one-shot `migrate` service uses — the only one shipping the Prisma CLI. The
Compose stack runs production-parity images; use `pnpm dev` for live-reload
development. See [Docker deployment](docs/self-hosting.md#docker) for
configuration, migrations, backups, and upgrades.

Both images resolve their npm/pnpm packages from `https://registry.npmjs.org/`
by default. To build through a mirror, set `NPM_REGISTRY` in `.env.docker` (used
by `docker compose`) or pass `--build-arg NPM_REGISTRY=<mirror-url>` to
`docker build`.

## Configuration

Custotal is configured entirely through environment variables, parsed and
validated eagerly at backend startup. The two supported setups differ only in
where the values live:

- **From source** — `packages/backend/.env` (copy from `.env.example`, which is
  the annotated master list), plus `packages/frontend/.env.local` for the SPA.
- **Docker** — a single `.env.docker` at the repository root (copy from
  `.env.docker.example`); the stack does not read `packages/backend/.env`.

The settings that most affect a deployment:

| Variable          | Purpose                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------- |
| `DATABASE_URL`    | PostgreSQL connection string.                                                           |
| `NODE_ENV`        | Set to `production` in a deployment.                                                    |
| `COOKIE_SECURE`   | Must be `true` behind HTTPS (defaults to `true` in production).                         |
| `CORS_ORIGINS`    | Exact frontend origin(s); used by CORS and the CSRF origin check.                       |
| `TRUST_PROXY`     | Set behind a reverse proxy so `req.ip` (and rate limiting) resolves to the real client. |
| `APP_PUBLIC_URL`  | Public frontend origin used to build invite/reset links.                                |
| `SMTP_*`          | Mail delivery. Left empty, the mailer logs instead of sending (development only).       |
| `TENANT_TIMEZONE` | IANA name used for date-only semantics and "overdue" calculation (default `UTC`).       |
| `BACKUP_*`        | Backup destination and retention window (defaults `./backups`, `30` days).              |
| `MAINTENANCE_*`   | In-process soft-delete purge schedule (default 02:00 server-local).                     |

Frontend variables are baked in at build time, so changing one requires a
rebuild. The most relevant are `VITE_API_BASE_URL` (leave empty for a
same-origin deployment) and `VITE_ENABLE_MOCKS` (must **not** be `true` in
production).

The backend logs production configuration warnings at startup for unsafe
combinations. See [Self-hosting → Configuration](docs/self-hosting.md#configuration)
for the full annotated reference and a production checklist.

## Commands

Run from the repository root:

| Task                         | Command                  |
| ---------------------------- | ------------------------ |
| Both dev servers             | `pnpm dev`               |
| Frontend production build    | `pnpm build`             |
| Typecheck (frontend+backend) | `pnpm typecheck`         |
| ESLint (whole workspace)     | `pnpm lint`              |
| Stylelint (frontend CSS)     | `pnpm lint:css`          |
| Prettier formatting check    | `pnpm format:check`      |
| All tests                    | `pnpm test`              |
| Frontend tests only          | `pnpm test:frontend`     |
| Backend unit tests only      | `pnpm test:backend:unit` |
| Apply database migrations    | `pnpm db:migrate`        |
| Create the first admin       | `pnpm db:create-admin`   |
| Dependency audit             | `pnpm audit`             |
| Docker: start or rebuild     | `pnpm docker:up`         |
| Docker: stop                 | `pnpm docker:down`       |
| Docker: follow logs          | `pnpm docker:logs`       |
| Docker: apply migrations     | `pnpm docker:migrate`    |

Run a single test file through its package, for example:

```bash
pnpm --filter @custotal/frontend exec vitest run src/lib/format.test.ts
```

## Project structure

```
custotal/
├─ packages/
│  ├─ backend/     Express API, Prisma schema + migrations, scripts, tests
│  │  ├─ src/      index → app → routes → services → db
│  │  ├─ prisma/   schema.prisma + migrations
│  │  ├─ scripts/  create-admin, backup, purge
│  │  ├─ Dockerfile
│  │  └─ docs/     operations notes, restore runbook
│  └─ frontend/    React SPA (routing, features/*, mocks, tests)
│     ├─ src/      features/*, components/*, lib/*, mocks/*, types/
│     ├─ docker/   nginx.conf used by the container image
│     ├─ Dockerfile
│     └─ docs/     API integration guide
├─ docker-compose.yml  self-hosted stack (PostgreSQL + API + nginx)
├─ docs/           architecture, self-hosting, API reference
└─ .github/        CI, security scanning, issue/PR templates
```

## Documentation

- [Architecture](docs/architecture.md) — how the backend and frontend fit together.
- [Self-hosting](docs/self-hosting.md) — configuration, deployment, backups, and upgrades.
- [API reference](docs/api.md) — REST endpoints and the error envelope.
- [Operations notes](packages/backend/docs/operations-notes.md) — known limitations and deferred work.
- [Restore procedure](packages/backend/docs/restore-procedure.md) — backup/restore runbook.
- [Frontend API integration](packages/frontend/docs/api-integration.md) — the service-layer contract.

## Contributing

Contributions are welcome — bug reports, documentation improvements, and pull
requests alike. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and the
[Code of Conduct](CODE_OF_CONDUCT.md) first.

In short:

- Open an issue before starting anything large so the approach can be agreed.
- Follow the quality gate CI runs: `pnpm typecheck`, `pnpm lint`,
  `pnpm lint:css`, `pnpm format:check`, and `pnpm test`.
- Use [Conventional Commits](https://www.conventionalcommits.org/) and sign off
  every commit (`git commit -s`).
- Changes that touch the API contract must update every layer together — see the
  contract-parity section in CONTRIBUTING.md.

## Security

Please **do not** open public issues for security problems. Report them privately
as described in [SECURITY.md](SECURITY.md). Key properties include opaque
database-backed sessions (only the token digest is stored), HttpOnly/Secure
cookies, bcrypt password hashing, server-side RBAC, per-endpoint rate limiting,
CSRF origin checks, and no PII in production logs.

## Acknowledgements

- Built on [Express](https://expressjs.com/), [Prisma](https://www.prisma.io/),
  [React](https://react.dev/), [Vite](https://vite.dev/),
  [React Router](https://reactrouter.com/), and
  [Tailwind CSS](https://tailwindcss.com/).
- Typography uses IBM Plex fonts, served via
  [@fontsource](https://fontsource.org/), under the SIL Open Font License 1.1.
- Thanks to the maintainers of every open-source dependency this project relies
  on — see [NOTICE](NOTICE) for attribution details.

## License

Licensed under the [Apache License 2.0](LICENSE). See [NOTICE](NOTICE) for
third-party attribution.
