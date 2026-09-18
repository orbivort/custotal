// Frontend unit/component tests (jsdom + Testing Library).
//
// Kept in a dedicated vitest.config.ts so test concerns stay separate from the
// build config in vite.config.ts. Only the React plugin is needed here: CSS is
// stubbed (`css: false`), so the Tailwind plugin is unnecessary at test time.
//
// Coverage config lives here (in addition to the root vitest.config.ts) because
// Vitest 4 only honors `coverage.include` from the config of the project being
// run when a single project/package is selected — without it, running coverage
// from packages/frontend would report only files the tests happen to import.
import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    name: 'frontend',
    environment: 'jsdom',
    // Scope discovery explicitly: since Vitest 4 the default excludes are only
    // node_modules and .git, so an unscoped include can sweep up dist/ output.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Tests must exercise the documented defaults, not the developer's local
    // .env settings (e.g. VITE_DEFAULT_CURRENCY=EUR, VITE_ENABLE_MOCKS=true).
    // Empty values here keep resolveDefaultCurrency() on its USD fallback and
    // keep mocks — and therefore the login prefill — off, deterministically.
    env: { VITE_DEFAULT_CURRENCY: '', VITE_ENABLE_MOCKS: '' },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        ...(configDefaults.coverage.exclude ?? []),
        '**/*.d.ts',
        // Test bootstrap, not application code.
        '**/src/test/**',
        '**/src/mocks/**',
      ],
      // `lcov` produces coverage/lcov.info, the format Codecov ingests in CI
      // (see .github/workflows/ci.yml).
      reporter: ['text', 'html', 'lcov'],
      // Fail the run when coverage drops below the agreed floor.
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 85,
        statements: 85,
      },
    },
  },
});
