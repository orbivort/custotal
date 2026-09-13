// Workspace-wide Vitest 4 configuration.
//
// Root-only concerns live here (they are NOT allowed in project configs):
//   - `projects`: Vitest 4's monorepo mechanism (the former `workspace`
//     option was removed). Each folder under packages/ is discovered as a
//     project via its own vitest.config.ts, so `vitest run` at the root
//     executes every package's suite with per-package settings preserved.
//   - `coverage`: applied once for the whole process and reported across all
//     projects. Since Vitest 4 removed `coverage.all`, `include` must be
//     explicit — it is what brings untested source files into the report.
//
// NOTE: Vitest 4 only honors `coverage.include` when a single project is run
// from its own directory, so each package's tier configs also carry a
// coverage block scoped to their `src/`. The backend tiers import one shared
// block (test/support/vitest-shared.ts) so the copies cannot drift apart.
//
// Run subsets with `--project backend-unit` / `--project frontend` (glob and
// negation patterns are supported).
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Match every package's Vitest config file(s). Packages may carry several
    // configs — backend splits unit / integration / e2e into one config per
    // tier because the tiers need mutually exclusive globalSetup / env /
    // parallelism settings — hence the `vitest*` pattern rather than a bare
    // directory glob. (Vitest 4.1.x does not resolve inline `projects`
    // declared inside a glob-discovered config file, so per-tier files are
    // the supported shape here.)
    projects: ['packages/*/vitest*.config.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.{ts,tsx}'],
      exclude: [
        ...(configDefaults.coverage.exclude ?? []),
        '**/*.d.ts',
        // Frontend test bootstrap, not application code.
        '**/src/test/**',
      ],
      reporter: ['text', 'html'],
      // Whole-workspace floor, applied when running coverage across every
      // project (e.g. `pnpm test:coverage`). Package-scoped runs enforce the
      // same thresholds via their own configs.
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 85,
        statements: 85,
      },
    },
  },
});
