// Shared Vitest option blocks for the backend tier configs
// (vitest.config.ts / vitest.integration.config.ts / vitest.e2e.config.ts).
//
// Coverage is a ROOT-ONLY option in Vitest 4: it is honored from the config
// of the project/package being run, so every tier config must carry it, and
// Vitest 4 only honors `coverage.include` when a single project/package is
// selected. The block lives here so the three copies cannot drift apart.
import { configDefaults } from 'vitest/config';
import type { CoverageOptions } from 'vitest/node';

export const backendCoverage: CoverageOptions = {
  provider: 'v8',
  include: ['src/**/*.ts'],
  exclude: [...(configDefaults.coverage.exclude ?? []), '**/*.d.ts'],
  reporter: ['text', 'html'],
  // Fail the run when coverage drops below the agreed floor. Applied per tier
  // config, so the aggregated run (all three tiers) is what must clear 85%.
  thresholds: {
    lines: 85,
    functions: 85,
    branches: 85,
    statements: 85,
  },
};
