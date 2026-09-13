// Daily full PostgreSQL backup via pg_dump (FR-CC-04) with 30-day retention.
// Run on a schedule (e.g. cron / Task Scheduler):
//   node scripts/backup.ts
// Restore procedure: see docs/restore-procedure.md
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnvFile } from 'node:process';

try {
  loadEnvFile(join(process.cwd(), '.env'));
} catch {
  // rely on exported env
}

const DATABASE_URL = process.env.DATABASE_URL;
const BACKUP_DIR = process.env.BACKUP_DIR ?? './backups';
const RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS ?? 30);
const PG_DUMP = process.env.PG_DUMP_PATH ?? 'pg_dump';

if (!DATABASE_URL) {
  console.error('DATABASE_URL is required for backup.');
  process.exit(1);
}

/**
 * Translate a postgres:// connection URI into libpq PG* environment variables.
 * Passing credentials via the child environment keeps them out of argv, where
 * they would be visible to any local process listing (ps / Task Manager).
 */
function pgEnvFromUrl(connUrl: string): Record<string, string> {
  let parsed: URL;
  try {
    parsed = new URL(connUrl);
  } catch {
    console.error('DATABASE_URL must be a postgres:// connection URI.');
    process.exit(1);
  }
  const pgEnv: Record<string, string> = {};
  if (parsed.hostname) pgEnv.PGHOST = parsed.hostname;
  if (parsed.port) pgEnv.PGPORT = parsed.port;
  if (parsed.username) pgEnv.PGUSER = decodeURIComponent(parsed.username);
  if (parsed.password) pgEnv.PGPASSWORD = decodeURIComponent(parsed.password);
  const database = parsed.pathname.replace(/^\//, '');
  if (database) pgEnv.PGDATABASE = decodeURIComponent(database);
  const sslmode = parsed.searchParams.get('sslmode');
  if (sslmode) pgEnv.PGSSLMODE = sslmode;
  return pgEnv;
}

// All fs paths below derive from the single operator-configured BACKUP_DIR
// root, so the non-literal-filename warnings are expected here.
/* eslint-disable security/detect-non-literal-fs-filename -- every path derives from the operator-configured BACKUP_DIR root */
mkdirSync(BACKUP_DIR, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const filename = `custotal-${stamp}.dump`;
const target = join(BACKUP_DIR, filename);

// --format=custom gives a compressed dump that restores with pg_restore (see
// docs/restore-procedure.md). The connection is supplied through PG* env vars,
// never as a command-line argument.
execFileSync(PG_DUMP, ['--format=custom', '--no-owner', `--file=${target}`], {
  stdio: 'inherit',
  env: { ...process.env, ...pgEnvFromUrl(DATABASE_URL) },
});
console.log(`[backup] created ${target}`);

// Retention: remove custotal-*.dump older than RETENTION_DAYS days.
const cutoff = Date.now() - RETENTION_DAYS * 86_400_000;
for (const entry of readdirSync(BACKUP_DIR)) {
  if (!entry.startsWith('custotal-') || !entry.endsWith('.dump')) continue;
  const path = join(BACKUP_DIR, entry);
  const age = statSync(path).mtimeMs;
  if (age < cutoff) {
    unlinkSync(path);
    console.log(`[backup] pruned ${entry}`);
  }
}
