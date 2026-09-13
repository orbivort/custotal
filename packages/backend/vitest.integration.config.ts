// Backend INTEGRATION tests: supertest against the real Express app and a
// dedicated PostgreSQL database (TEST_DATABASE_URL). Migrations are applied in
// test/support/global-setup.ts; each suite reseeds/resets so files stay
// independent. Files run sequentially — they share one database.
//
// Coverage is declared once in test/support/vitest-shared.ts and imported by
// every backend tier config — see that file for why it must be repeated.
import { defineConfig } from 'vitest/config';
// Importing the env module loads .env.test/.env from the package root
// (independent of cwd) before the value below is computed.
import { testDatabaseUrl } from './test/support/env.ts';
import { backendCoverage } from './test/support/vitest-shared.ts';

export default defineConfig({
  test: {
    name: 'backend-integration',
    environment: 'node',
    // Scope discovery explicitly: since Vitest 4 the default excludes are only
    // node_modules and .git, so an unscoped include can sweep up build output.
    include: ['test/integration/**/*.test.ts'],
    globalSetup: ['./test/support/global-setup.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl,
      COOKIE_SECURE: 'false',
    },
    // Tests share one database; run files sequentially to avoid cross-file interference.
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 20_000,
    coverage: backendCoverage,
  },
});
