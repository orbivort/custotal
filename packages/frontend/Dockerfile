# syntax=docker/dockerfile:1.7
#
# Custotal frontend image — the Vite-built SPA served by nginx, which also
# reverse-proxies /api and /health to the backend so the SPA and the API share
# one origin (the session cookie then needs no CORS/SameSite relaxations).
#
# Build from the repository root:
#   docker build -f packages/frontend/Dockerfile -t custotal-frontend .
#
# Build-time configuration (Vite inlines VITE_* variables into the bundle):
#   --build-arg VITE_DEFAULT_CURRENCY=EUR
#
# npm/pnpm packages are fetched from the registry selected by the NPM_REGISTRY
# build argument (default: the official registry). To build through a mirror
# when npmjs.org is slow or blocked:
#   docker build -f packages/frontend/Dockerfile \
#     --build-arg NPM_REGISTRY=your-mirror-registry -t custotal-frontend .
# Node version mirrors .nvmrc / package.json `engines` (^24.19.0). The exact
# release is pinned so image builds are reproducible and never resolve to a
# Node older than the workspace requires. Override with
# `--build-arg NODE_VERSION=<version>` when needed.
ARG NODE_VERSION=24.19.0

# --- base: Node + the pnpm version pinned in package.json --------------------
FROM node:${NODE_VERSION}-bookworm-slim AS base
# Registry for every npm/pnpm download in this build: Corepack fetching pnpm
# below and the `pnpm install` in the deps stage. The default is the official
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

# --- deps: install only the frontend's dependency subtree --------------------
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/backend/package.json packages/backend/
COPY packages/frontend/package.json packages/frontend/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @custotal/frontend...

# --- build: typecheck and bundle the SPA ------------------------------------
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/frontend/index.html packages/frontend/
COPY packages/frontend/vite.config.ts packages/frontend/
COPY packages/frontend/tsconfig.json packages/frontend/
COPY packages/frontend/public packages/frontend/public
COPY packages/frontend/src packages/frontend/src
# Explicitly off: mocks are a development-only transport (see src/config/env.ts)
# and must never be baked into a deployed bundle.
ENV VITE_ENABLE_MOCKS=false
ARG VITE_DEFAULT_CURRENCY=
ENV VITE_DEFAULT_CURRENCY=${VITE_DEFAULT_CURRENCY}
RUN pnpm --filter @custotal/frontend build

# --- runtime: unprivileged nginx serving static files + proxying the API -----
FROM nginx:stable-alpine AS runtime
COPY packages/frontend/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/packages/frontend/dist /usr/share/nginx/html
# Apache-2.0 §4 requires the license and NOTICE to accompany distributed builds.
# Kept out of the nginx web root so they are never served as site content.
COPY LICENSE NOTICE /usr/share/licenses/custotal/
# The configuration above relocates every writable path under /tmp, because the
# worker runs as the unprivileged `nginx` user (uid 101). nginx creates only the
# leaf directory of a temp path, never its parents, so `/tmp/nginx` must already
# exist and be writable by uid 101 — otherwise the master process aborts with
# `mkdir() "/tmp/nginx/client_body" failed (2: No such file or directory)` and
# the container restart-loops.
RUN mkdir -p /tmp/nginx \
 && chown nginx:nginx /tmp/nginx
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
# The nginx image already provides the unprivileged `nginx` user (uid 101) and
# the configuration above binds port 8080, so no root privileges are required.
# The stock entrypoint scripts are bypassed: they assume write access to
# /etc/nginx, and this image ships a complete nginx.conf.
USER nginx
ENTRYPOINT ["nginx", "-g", "daemon off;"]
