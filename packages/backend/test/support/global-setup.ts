// Apply Prisma migrations to the dedicated test database once, before any
// integration/e2e suite runs. Unit tests never enter here (their Vitest
// project has no globalSetup).
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { backendRoot, testDatabaseUrl } from './env.ts';

if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL (or DATABASE_URL) is required for integration tests.');
}

export default function globalSetup(): void {
  const prismaCli = join(backendRoot, 'node_modules', 'prisma', 'build', 'index.js');
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: backendRoot,
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
    stdio: 'pipe',
  });
}
