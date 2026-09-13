// Shared test environment bootstrap for all backend Vitest projects (unit,
// integration, e2e) and the helper modules they import.
//
// Loads `.env.test` first, then `.env`, both from the backend package root —
// NOT process.cwd(): when a suite is launched via the root vitest.config.ts
// `projects` glob, cwd is the workspace root. Existing environment variables
// (e.g. TEST_DATABASE_URL exported by CI) always win over file values because
// loadEnvFile never overrides variables that are already set.
import { join, resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

/** Absolute path of the backend package, independent of process.cwd(). */
export const backendRoot = resolve(import.meta.dirname, '..', '..');

for (const fileName of ['.env.test', '.env']) {
  try {
    loadEnvFile(join(backendRoot, fileName));
  } catch {
    // File missing or unreadable — fall back to the next candidate / exported env.
  }
}

/**
 * Dedicated test database connection string. Integration and e2e suites fail
 * fast (test/support/global-setup.ts) when this is missing; unit tests never
 * touch the database and therefore never require it.
 */
export const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
