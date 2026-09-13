// Docker-aware PostgreSQL backup for the self-hosted Compose stack (FR-CC-04).
//
// The backend image deliberately does not ship pg_dump (see docs/self-hosting.md),
// so the dump is produced inside the `db` service and copied out to the host. This
// wrapper is shell-agnostic — it works from PowerShell, cmd, bash and zsh alike,
// unlike the `... > backups/custotal-$(date +%F).dump` one-liner in the docs.
//
//   pnpm docker:backup                                  # -> backups/custotal-<timestamp>.dump
//   BACKUP_RETENTION_DAYS=7 pnpm docker:backup          # override the 30-day window
//   BACKUP_DIR=./temp/dumps pnpm docker:backup          # override the destination
//
// Restore procedure: packages/backend/docs/restore-procedure.md
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMPOSE = ['compose', '--env-file', '.env.docker'];
const SERVICE = 'db';

const BACKUP_DIR = resolve(ROOT, process.env.BACKUP_DIR ?? 'backups');
const RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS ?? 30);

const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const FILENAME = `custotal-${STAMP}.dump`;
// Staged inside the container, then copied out; the host shell never sees a
// binary stream, so no redirect quoting or buffer limits are involved.
const CONTAINER_TMP = `/tmp/${FILENAME}`;
const TARGET = join(BACKUP_DIR, FILENAME);

function compose(args: string[]): void {
  execFileSync('docker', [...COMPOSE, ...args], { cwd: ROOT, stdio: 'inherit' });
}

if (!existsSync(join(ROOT, '.env.docker'))) {
  console.error(
    '[docker:backup] .env.docker not found. Copy .env.docker.example and set POSTGRES_PASSWORD.',
  );
  process.exit(1);
}

// Every fs path below derives from the single operator-configured BACKUP_DIR root.
mkdirSync(BACKUP_DIR, { recursive: true });

try {
  // 1. Dump inside the container. POSTGRES_USER / POSTGRES_DB are already in the
  //    db service's environment, so no credentials are parsed, echoed, or passed
  //    through argv (where any local process could read them).
  compose([
    'exec',
    '-T',
    SERVICE,
    'sh',
    '-c',
    `pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --file=${CONTAINER_TMP}`,
  ]);

  // 2. Copy the dump out to the host, then always drop the in-container copy.
  try {
    compose(['cp', `${SERVICE}:${CONTAINER_TMP}`, TARGET]);
  } finally {
    compose(['exec', '-T', SERVICE, 'rm', '-f', CONTAINER_TMP]);
  }
} catch {
  console.error('[docker:backup] backup failed — is the stack running? Try `pnpm docker:up`.');
  process.exit(1);
}

console.log(`[docker:backup] created ${TARGET}`);

// 3. Retention: remove custotal-*.dump older than RETENTION_DAYS days.
const cutoff = Date.now() - RETENTION_DAYS * 86_400_000;
for (const entry of readdirSync(BACKUP_DIR)) {
  if (!entry.startsWith('custotal-') || !entry.endsWith('.dump')) continue;
  const path = join(BACKUP_DIR, entry);
  if (statSync(path).mtimeMs < cutoff) {
    unlinkSync(path);
    console.log(`[docker:backup] pruned ${entry}`);
  }
}
