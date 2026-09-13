#!/bin/sh
#
# Container entrypoint for the Custotal backend.
#
# With RUN_MIGRATIONS=true it applies pending Prisma migrations before starting
# the server, which is convenient for a single-container self-hosted install.
# The default (false) keeps start-up deterministic: docker compose runs
# migrations in a dedicated one-shot service instead (see docker-compose.yml), and
# orchestrators can do the same with an init job.
#
# RUN_MIGRATIONS needs the Prisma CLI, which only the `tools` image ships — the
# API image is built production-only (packages/backend/Dockerfile). Fail fast
# with the command that does the job instead of starting an unmigrated server.
set -eu

prisma_cli=node_modules/prisma/build/index.js

if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  if [ ! -f "$prisma_cli" ]; then
    echo "[entrypoint] RUN_MIGRATIONS=true, but this image ships no Prisma CLI." >&2
    echo "[entrypoint] The API image is production-only (Dockerfile target: runtime)." >&2
    echo "[entrypoint] Apply migrations, then start the API:" >&2
    echo "[entrypoint]   pnpm docker:migrate" >&2
    echo "[entrypoint]   # docker compose --env-file .env.docker run --rm migrate" >&2
    exit 1
  fi
  echo "[entrypoint] applying database migrations (prisma migrate deploy)"
  node "$prisma_cli" migrate deploy
fi

exec "$@"
