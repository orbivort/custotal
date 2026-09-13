// Typed environment configuration for the backend.
// `.env` is loaded lazily (when present) so the server, scripts, and tests all
// read the same values whether or not Node was started with --env-file.
import { createRequire } from 'node:module';
import { loadEnvFile } from 'node:process';
import { pathToFileURL } from 'node:url';

try {
  loadEnvFile(pathToFileURL(`${process.cwd()}/.env`));
} catch {
  // .env is optional when the environment already exports the variables.
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function int(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export type Environment = 'production' | 'staging' | 'development' | 'test';

const ENVIRONMENTS: readonly Environment[] = ['production', 'staging', 'development', 'test'];

function environment(name: string, value: string | undefined, fallback: Environment): Environment {
  const raw = (value ?? fallback).trim().toLowerCase();
  if (!ENVIRONMENTS.includes(raw as Environment)) {
    throw new Error(`Invalid ${name} "${value}". Expected one of: ${ENVIRONMENTS.join(', ')}.`);
  }
  return raw as Environment;
}

const NODE_ENV = environment('NODE_ENV', process.env.NODE_ENV, 'development');

/** Validate an enum-ish string env var against an allowlist, failing fast. */
function oneOf<T extends string>(
  name: string,
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = (value ?? fallback).trim().toLowerCase();
  if (!allowed.includes(raw as T)) {
    throw new Error(`Invalid ${name} "${value}". Expected one of: ${allowed.join(', ')}.`);
  }
  return raw as T;
}

/**
 * Express `trust proxy` setting: `false` (default, direct connections), a hop
 * count (number), or a comma-separated list of proxy IPs/subnets.
 */
function trustProxy(value: string | undefined): boolean | number | string[] {
  if (value === undefined || value.trim() === '') return false;
  const v = value.trim();
  if (v === 'true') return true;
  if (v === 'false') return false;
  const n = Number(v);
  if (Number.isInteger(n) && n >= 0 && v !== '') return n;
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const IS_PRODUCTION = NODE_ENV === 'production';

/** Public origin of the frontend, used to build invite/reset links in emails. */
const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL ?? 'http://localhost:5173';

const COOKIE_SECURE = bool(process.env.COOKIE_SECURE, IS_PRODUCTION);

const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Non-fatal deployment misconfigurations. Each is dangerous in production
 * (insecure cookies, reset links pointing at localhost, cross-origin browsers
 * blocked, rate limiting keyed to a proxy IP) but must not stop the server from
 * booting — they are collected here and logged once at startup by index.ts.
 */
const CONFIG_WARNINGS: string[] = [];
if (IS_PRODUCTION) {
  if (!COOKIE_SECURE) {
    CONFIG_WARNINGS.push(
      'COOKIE_SECURE is false in production — session cookies may be sent over plain HTTP.',
    );
  }
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(APP_PUBLIC_URL)) {
    CONFIG_WARNINGS.push(
      `APP_PUBLIC_URL is "${APP_PUBLIC_URL}" in production — invite and reset links will point at localhost.`,
    );
  }
  if (CORS_ORIGINS.length === 0) {
    CONFIG_WARNINGS.push(
      'CORS_ORIGINS is empty in production — cross-origin browser requests will be blocked.',
    );
  }
  if (process.env.TRUST_PROXY === undefined || process.env.TRUST_PROXY.trim() === '') {
    CONFIG_WARNINGS.push(
      'TRUST_PROXY is unset in production — behind a load balancer, rate limiting will key every client to the proxy IP.',
    );
  }
}

export const env = {
  nodeEnv: NODE_ENV,
  isDevelopment: NODE_ENV === 'development',
  isProduction: NODE_ENV === 'production',
  port: int(process.env.PORT, 4000),
  databaseUrl: process.env.DATABASE_URL ?? '',
  testDatabaseUrl: process.env.TEST_DATABASE_URL ?? '',
  sessionTtlHours: int(process.env.SESSION_TTL_HOURS, 8),
  cookieSecure: COOKIE_SECURE,
  cookieSameSite: oneOf(
    'COOKIE_SAMESITE',
    process.env.COOKIE_SAMESITE,
    ['lax', 'strict', 'none'] as const,
    'lax',
  ),
  // Trust level for the reverse proxy in front of the API. Required for
  // correct `req.ip` (and therefore correct rate-limit keying) behind an LB.
  trustProxy: trustProxy(process.env.TRUST_PROXY),
  corsOrigins: CORS_ORIGINS,
  resetTokenTtlMinutes: int(process.env.RESET_TOKEN_TTL_MINUTES, 60),
  // How long a temporary credential (issued when an invite email could not be
  // delivered) remains valid before login rejects it and forces a reset.
  tempPasswordTtlDays: int(process.env.TEMP_PASSWORD_TTL_DAYS, 7),
  // Public origin of the frontend, used to build invite/reset links in emails.
  appPublicUrl: APP_PUBLIC_URL,
  // SMTP delivery. When smtpHost is empty the mailer degrades to a logged
  // fallback instead of failing (the message body is only logged in
  // development — it embeds one-time set-password links).
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: int(process.env.SMTP_PORT, 587),
    secure: bool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? 'Custotal <no-reply@custotal.local>',
    // When true the mailer never opens a real connection and always falls
    // back to logging the message body. Defaults to true under NODE_ENV=test
    // so a stray SMTP_HOST in the environment can never cause real sends.
    testMode: bool(process.env.SMTP_TEST_MODE, NODE_ENV === 'test'),
  },
  tenantTimezone: process.env.TENANT_TIMEZONE ?? 'UTC',
  instance: {
    orgName: process.env.INSTANCE_ORG_NAME ?? 'Custotal',
    environment: environment('INSTANCE_ENVIRONMENT', process.env.INSTANCE_ENVIRONMENT, NODE_ENV),
    hostname: process.env.INSTANCE_HOSTNAME ?? 'localhost',
    // Whether the sign-in screen offers the password-reset flow (default on).
    allowPasswordReset: bool(process.env.INSTANCE_ALLOW_PASSWORD_RESET, true),
    // First-run setup banner flag surfaced by GET /api/health. There is no
    // self-serve setup flow (the first admin is provisioned with
    // `db:create-admin`), so it stays off unless an operator overrides it.
    setupRequired: bool(process.env.INSTANCE_SETUP_REQUIRED, false),
  },
  backupDir: process.env.BACKUP_DIR ?? './backups',
  backupRetentionDays: int(process.env.BACKUP_RETENTION_DAYS, 30),
  // In-process daily purge scheduler (ADR-0007). Enabled by default; disable it
  // when an external scheduler owns the purge (`scripts/purge.ts` / `pnpm purge`),
  // and automatically off under NODE_ENV=test so suites never arm a timer.
  maintenancePurgeEnabled: bool(process.env.MAINTENANCE_PURGE_ENABLED, NODE_ENV !== 'test'),
  // Daily time (server-local) at which the scheduled purge runs. Defaults to
  // 02:00; hour is clamped to 0-23 and minute to 0-59.
  maintenancePurgeHour: Math.min(23, Math.max(0, int(process.env.MAINTENANCE_PURGE_HOUR, 2))),
  maintenancePurgeMinute: Math.min(59, Math.max(0, int(process.env.MAINTENANCE_PURGE_MINUTE, 0))),
  appVersion: (createRequire(import.meta.url)('../package.json') as { version: string }).version,
  // Non-fatal deployment misconfigurations, logged once at startup by index.ts.
  warnings: CONFIG_WARNINGS,
} as const;
