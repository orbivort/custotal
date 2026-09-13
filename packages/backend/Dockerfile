# syntax=docker/dockerfile:1.7
#
# Custotal backend image — Express 5 + Prisma 7 + PostgreSQL.
#
# The backend runs its TypeScript sources directly on Node 24 (native type
# stripping; see packages/backend/tsconfig.json), so there is no compile step.
# The "build" stage only resolves dependencies, generates the Prisma Client and
# pre-fetches Prisma's migration (schema) engine.
#
# Build from the repository root:
#   docker build -f packages/backend/Dockerfile -t custotal-backend .
#   docker build -f packages/backend/Dockerfile --target tools -t custotal-backend:tools .
#
# Two targets ship, and they are deliberately different sizes:
#
#   runtime (default) — the API. It carries the production dependency tree only:
#     no Prisma CLI, no TypeScript/Vitest/ESLint/Prettier, no frontend bundler.
#     This is the image that runs continuously, so it is kept as small as the
#     dependency graph allows. It cannot apply migrations (docker-compose.yml
#     runs those in the `migrate` service; see docker-entrypoint.sh).
#
#   tools — the migration / operator toolchain. It carries the workspace dev
#     install, because that is what provides the Prisma CLI and the schema engine
#     `prisma migrate deploy` uses. docker-compose.yml builds it for the one-shot
#     `migrate` service, which runs for seconds per upgrade and never
#     continuously, so its size is not on the hot path.
#
# npm/pnpm packages are fetched from the registry selected by the NPM_REGISTRY
# build argument (default: the official registry). To build through a mirror
# when npmjs.org is slow or blocked:
#   docker build -f packages/backend/Dockerfile \
#     --build-arg NPM_REGISTRY=your-mirror-registry -t custotal-backend .
#
# Node version mirrors .nvmrc / package.json `engines` (^24.19.0). The exact
# release is pinned so image builds are reproducible and never resolve to a
# Node older than the workspace requires. Override with
# `--build-arg NODE_VERSION=<version>` when needed.
ARG NODE_VERSION=24.19.0

# --- base: Node + the pnpm version pinned in package.json --------------------
FROM node:${NODE_VERSION}-bookworm-slim AS base
# Registry for every npm/pnpm download in this build: Corepack fetching pnpm
# below and the `pnpm install` in the install stages. The default is the official
# registry, so omitting the build arg preserves the original behavior. The env
# vars are set here (both tools read the environment, not a config file), which
# keeps every later stage that inherits `base` in sync. Each tool reads a
# different name, so all of them are set:
#   COREPACK_NPM_REGISTRY  Corepack fetching the pnpm version pinned in
#                          package.json (`corepack enable` only writes shims;
#                          the download happens on the first `pnpm` call).
#   PNPM_CONFIG_REGISTRY   pnpm >= 10 no longer reads `npm_config_*`: it only
#                          honors the `pnpm_config_*` / `PNPM_CONFIG_*` prefix.
#                          Setting only `NPM_CONFIG_REGISTRY` silently leaves
#                          pnpm on https://registry.npmjs.org/.
#   npm_config_registry    kept for npm-based tooling invoked during the build.
ARG NPM_REGISTRY=https://registry.npmjs.org/
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    CI=true \
    PNPM_CONFIG_REGISTRY=${NPM_REGISTRY} \
    npm_config_registry=${NPM_REGISTRY} \
    COREPACK_NPM_REGISTRY=${NPM_REGISTRY}
# pnpm is intentionally NOT pinned here: Corepack resolves it from
# `packageManager` (pnpm@11.21.0) in the root package.json, so it can never
# drift from the workspace contract (`engines.pnpm: ^11.21.0`).
# NOTE: Corepack ships with Node <=24 and is removed in Node 25. Raising
# NODE_VERSION to >=25 requires replacing this bootstrap (e.g. `npm i -g pnpm`).
RUN corepack enable
WORKDIR /app

# --- os-deps: the OS packages Prisma's engines link against ------------------
# Debian slim ships neither `openssl` nor libssl (verified: `ldconfig -p` finds
# no libssl in node:*-bookworm-slim), and Prisma's schema/query engines fail
# their libssl detection without them. Installing the package in this single
# stage gives both shipping targets the same layer instead of duplicating the
# apt step (and its ~7 MB) in each.
FROM base AS os-deps
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*

# --- manifests: the files the frozen lockfile is validated against -----------
# Every workspace manifest is copied so `--frozen-lockfile` can prove the
# lockfile is in sync with the workspace; only the backend's dependency subtree
# is installed below.
FROM os-deps AS manifests
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/backend/package.json packages/backend/
COPY packages/frontend/package.json packages/frontend/

# --- prod-deps: the API's runtime dependency tree ----------------------------
# Two flags bound the tree, and both are needed:
#   --prod        drops the devDependencies of every project (Prisma CLI,
#                 TypeScript, Vitest, ESLint/Prettier, the frontend bundler).
#   --no-optional drops the optional dependency edges the lockfile resolved for a
#                 production package. The one that matters is `@prisma/client`,
#                 which declares `prisma` (the CLI) and `typescript` as *optional*
#                 peers; because the workspace lockfile pins that resolution, a
#                 `--prod`-only install still unpacks the CLI, Prisma Studio,
#                 `effect`, `pglite` and TypeScript into the virtual store
#                 (~200 MB) although nothing at run time imports them.
# Note that `--filter` does not bound the install on its own: it decides which
# projects get their own `node_modules` linked, but a plain filtered install
# still unpacks every package in the lockfile (~610, including the frontend's
# Vite/MSW toolchain and the root ESLint/Prettier stack) into the shared store.
FROM manifests AS prod-deps
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --no-optional --filter @custotal/backend

# --- deps: the full (dev) install, for building and for the tools target -----
# `prisma generate` (build stage) and `prisma migrate deploy` (tools target) both
# need the CLI, which is a devDependency, so these two need the complete subtree
# rather than the `--prod` one.
FROM manifests AS deps
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @custotal/backend...

# --- build: generate the Prisma Client --------------------------------------
# `prisma generate` and `prisma migrate diff` never connect to a database, but
# the Prisma 7 config file reads DATABASE_URL. The placeholder is passed to the
# two commands that need it instead of through `ENV`, so it can never leak into
# the runtime/tools images as a real-looking (and wrong) setting.
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/backend/tsconfig.json packages/backend/
COPY packages/backend/prisma.config.ts packages/backend/
COPY packages/backend/prisma packages/backend/prisma
COPY packages/backend/src packages/backend/src
COPY packages/backend/scripts packages/backend/scripts
# `db:generate` emits the client into the package's own source tree
# (packages/backend/src/generated/prisma, which is gitignored and copied above),
# so it is resolved as ordinary project code rather than out of one specific
# variant of the pnpm virtual store.
# The `migrate diff` call downloads the platform schema engine used by
# `migrate deploy`, so the `tools` container never has to fetch it at run time.
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build \
      pnpm --filter @custotal/backend db:generate \
 && DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build \
      pnpm --filter @custotal/backend exec prisma migrate diff \
        --from-empty --to-schema prisma/schema.prisma --script > /dev/null

# --- runtime: the API --------------------------------------------------------
FROM os-deps AS runtime
ENV NODE_ENV=production \
    PORT=4000 \
    HOME=/home/node
# Only the production dependency tree and the code the server executes are
# copied: `src` (with the generated Prisma Client), the operator scripts
# (create-admin / backup / purge) and the backend manifest. The manifest is not
# optional — it is what declares `"type": "module"`; without it Node would treat
# the .ts sources as CommonJS and the app would not start.
# The schema, migrations and `prisma.config.ts` are deliberately absent: they are
# inputs to the CLI (the `tools` image has them), and no runtime code reads them.
# `node_modules` must keep its workspace shape — `/app/node_modules/.pnpm` plus
# the package's own links under `/app/packages/backend/node_modules` — for pnpm's
# relative symlinks to resolve, so both are copied to the exact paths they were
# installed at.
# Ownership is applied while the layers are written. Do NOT replace the
# `--chown`s with a `chown -R node:node /app` in a later step: that forces
# overlayfs to copy every file up into a new layer (node_modules alone is tens of
# thousands of files), which dominated the whole build (≈14 min on Docker
# Desktop/WSL2).
COPY --from=prod-deps --chown=node:node /app/node_modules /app/node_modules
COPY --from=prod-deps --chown=node:node /app/packages/backend/node_modules /app/packages/backend/node_modules
COPY --from=build --chown=node:node /app/packages/backend/src /app/packages/backend/src
COPY --from=build --chown=node:node /app/packages/backend/scripts /app/packages/backend/scripts
COPY --from=build --chown=node:node /app/packages/backend/package.json /app/packages/backend/package.json
# `--chmod` replaces `RUN chmod +x …` (the file is not executable in the repo).
COPY --chmod=755 packages/backend/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
# Apache-2.0 §4 requires the license and NOTICE to accompany distributed builds.
# They are kept outside the app tree so app-level cleanup cannot drop them.
COPY --chown=node:node LICENSE NOTICE /usr/share/licenses/custotal/
# The backup directory is mounted as a named volume (docker-compose.yml) and is
# written to when the in-process purge/backup scripts run: Docker seeds a fresh
# volume with this directory's ownership, so it must belong to `node`. Only these
# two paths are chowned, never recursively — their contents came from the
# `--chown` copies above.
RUN mkdir -p /app/packages/backend/backups \
 && chown node:node /app /app/packages/backend/backups
# Run as the unprivileged `node` user that ships with the base image.
USER node
WORKDIR /app/packages/backend
EXPOSE 4000
# /health is a real database probe (src/app.ts), not just process liveness.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "src/index.ts"]

# --- tools: migrations and one-off operator tasks ---------------------------
# The full workspace tree — i.e. everything the previous single-image design
# shipped to the API: the Prisma CLI, its pre-fetched schema engine, the
# generated client, the schema and the migrations. `pnpm docker:migrate`
# (`docker compose run --rm migrate`) and `node scripts/create-admin.ts` work
# here exactly as documented in docs/self-hosting.md.
# The tree is copied from `build` rather than inherited, because the ownership
# has to change: `prisma migrate deploy` writes into
# node_modules/.pnpm/@prisma+engines@… at run time and the engine download is not
# pre-satisfiable, so the unprivileged user needs to own it. `--chown` applies
# that while the layer is written (never a later recursive `chown`).
FROM os-deps AS tools
ENV NODE_ENV=production \
    HOME=/home/node
COPY --from=build --chown=node:node /app /app
# Apache-2.0 §4 requires the license and NOTICE to accompany distributed builds.
COPY --chown=node:node LICENSE NOTICE /usr/share/licenses/custotal/
USER node
WORKDIR /app/packages/backend
