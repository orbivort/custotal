import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Directory that holds the browser suite (packages/frontend/e2e). */
export const E2E_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** Directory holding the persisted authenticated storage states (git-ignored). */
export const AUTH_DIR = path.join(E2E_DIR, '.auth');

export const ADMIN_STATE = path.join(AUTH_DIR, 'admin.json');
export const REP_STATE = path.join(AUTH_DIR, 'rep.json');

/**
 * The demo workspace stores no per-user credentials: the mock auth handler
 * accepts this single shared password for every seeded account
 * (see packages/frontend/src/mocks/handlers/auth.ts).
 */
export const DEMO_PASSWORD = 'demo1234';

/** Seeded accounts the suite signs in as, mirroring src/mocks/db/seed.ts. */
export const DEMO_USERS = {
  admin: { email: 'admin@example.com', name: 'Admin Sample' },
  manager: { email: 'dana@example.com', name: 'Dana Sample' },
  rep: { email: 'alex@example.com', name: 'Alex Sample' },
  readonly: { email: 'riley@example.com', name: 'Riley Sample' },
} as const;

/** Creates the storage-state directory on first use (idempotent). */
export function ensureAuthDir(): void {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}
