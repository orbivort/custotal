// Backend E2E tests: black-box HTTP against the REAL server process
// (src/index.ts), booted by test/e2e/setup/global-setup.ts on a free port with
// the dedicated test database (migrations applied by test/support/global-setup.ts).
//
// Coverage is declared once in test/support/vitest-shared.ts and imported by
// every backend tier config — see that file for why it must be repeated.
import { defineConfig } from 'vitest/config';
import { backendCoverage } from './test/support/vitest-shared.ts';

export default defineConfig({
  test: {
    name: 'backend-e2e',
    environment: 'node',
    include: ['test/e2e/**/*.test.ts'],
    globalSetup: ['./test/e2e/setup/global-setup.ts'],
    env: {
      NODE_ENV: 'test',
      COOKIE_SECURE: 'false',
    },
    // All e2e files share the one booted server; keep ordering deterministic.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: backendCoverage,
  },
});
