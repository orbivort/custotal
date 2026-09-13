// Backend UNIT tests: pure logic, no database, no HTTP server. Runs fully in
// parallel with no global setup, so fast feedback never depends on a reachable
// database (that requirement lives in vitest.integration.config.ts).
//
// Coverage is declared once in test/support/vitest-shared.ts and imported by
// every backend tier config — see that file for why it must be repeated.
import { defineConfig } from 'vitest/config';
import { backendCoverage } from './test/support/vitest-shared.ts';

export default defineConfig({
  test: {
    name: 'backend-unit',
    environment: 'node',
    // Scope discovery explicitly: since Vitest 4 the default excludes are only
    // node_modules and .git, so an unscoped include can sweep up build output.
    include: ['test/unit/**/*.test.ts'],
    coverage: backendCoverage,
  },
});
