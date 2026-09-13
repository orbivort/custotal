import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import { ADMIN_STATE } from './e2e/support/constants';

// Browser end-to-end suite for the Custotal SPA.
//
// The suite drives the Vite dev server with the MSW-backed demo workspace
// (`VITE_ENABLE_MOCKS=true`) so every journey is hermetic: no PostgreSQL, no
// production data, no outbound network. MSW only ever runs under the Vite dev
// server, which is why the web server boots `vite` and not `vite preview`.
//
// Point the suite at an already-running instance (e.g. the real backend) by
// setting PLAYWRIGHT_BASE_URL; the managed web server is then skipped.

const configDir = path.dirname(fileURLToPath(import.meta.url));

const port = Number(process.env.E2E_PORT ?? 5174);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${port}`;
const isCI = Boolean(process.env.CI);

/** `process.env` with undefined values dropped, to satisfy the `env` type. */
function stringEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) result[key] = value;
  }
  return result;
}

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: true,
  // A stray `test.only` must never silently narrow a CI run.
  forbidOnly: isCI,
  // The mock API runs on a Service Worker, which belongs to the browser rather
  // than to a test's context: a test can inherit a worker that is still being
  // torn down, and the app then never mounts — an infrastructure flake rather
  // than a behaviour one. A retry hands the test a fresh context.
  retries: isCI ? 2 : 1,
  // One worker in CI keeps the three engines from competing for CPU/ports.
  workers: isCI ? 1 : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: isCI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    // Signs in once per demo account and persists the storage states the
    // browser projects reuse (see e2e/setup/auth.setup.ts).
    {
      name: 'setup',
      testDir: './e2e/setup',
      testMatch: /.*\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium',
      testIgnore: /.*\.setup\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: ADMIN_STATE },
      dependencies: ['setup'],
    },
    {
      name: 'firefox',
      testIgnore: /.*\.setup\.ts/,
      use: { ...devices['Desktop Firefox'], storageState: ADMIN_STATE },
      dependencies: ['setup'],
    },
    {
      name: 'webkit',
      testIgnore: /.*\.setup\.ts/,
      use: { ...devices['Desktop Safari'], storageState: ADMIN_STATE },
      dependencies: ['setup'],
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `pnpm exec vite --port ${port} --strictPort`,
        cwd: configDir,
        url: `${baseURL}/login`,
        reuseExistingServer: !isCI,
        timeout: 120_000,
        env: {
          ...stringEnv(process.env),
          // Interview the demo workspace instead of the real backend, and pin
          // the currency so assertions never depend on a developer's .env.
          VITE_ENABLE_MOCKS: 'true',
          VITE_DEFAULT_CURRENCY: 'USD',
        },
      },
});
