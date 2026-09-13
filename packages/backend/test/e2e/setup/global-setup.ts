// E2E harness: apply migrations, seed the demo workspace, boot the REAL server
// process (src/index.ts) on a free port with the test database, wait for
// /health, and tear the process down after the suite. The base URL is shared
// with the tests via a small handoff file in the workspace temp/ folder
// (global setup and test workers may run in separate processes).
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { seedDemoWorkspace } from '../../fixtures/demo-workspace.ts';
import { backendRoot, testDatabaseUrl } from '../../support/env.ts';
import applyMigrations from '../../support/global-setup.ts';

const workspaceRoot = resolve(backendRoot, '..', '..');
export const serverInfoPath = join(workspaceRoot, 'temp', 'e2e-server.json');

type ServerProcess = ReturnType<typeof spawn>;

let server: ServerProcess | undefined;

/** Grab a free loopback port by letting the OS assign one, then release it. */
function findFreePort(): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    const probe = createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (address && typeof address === 'object') {
        const port = address.port;
        probe.close(() => resolvePromise(port));
      } else {
        probe.close(() => reject(new Error('Failed to acquire a free port.')));
      }
    });
  });
}

async function waitForHealth(port: number, child: ServerProcess): Promise<void> {
  const deadline = Date.now() + 30_000;
  for (;;) {
    if (child.exitCode !== null) {
      throw new Error(`Backend server exited early with code ${child.exitCode}.`);
    }
    if (Date.now() > deadline) {
      throw new Error('Backend server did not become healthy within 30s.');
    }
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      // Consume the body so undici releases the keep-alive socket.
      await res.text();
      if (res.ok) return;
    } catch {
      // Not listening yet — retry below.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  if (!testDatabaseUrl) {
    throw new Error('TEST_DATABASE_URL (or DATABASE_URL) is required for e2e tests.');
  }
  applyMigrations();
  // The smoke suite logs in as a demo user, so the workspace fixture is required.
  await seedDemoWorkspace();

  const port = await findFreePort();
  const child = spawn(process.execPath, ['src/index.ts'], {
    cwd: backendRoot,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl,
      PORT: String(port),
      COOKIE_SECURE: 'false',
    },
    stdio: 'inherit',
  });
  await waitForHealth(port, child);
  server = child;

  mkdirSync(join(workspaceRoot, 'temp'), { recursive: true });
  writeFileSync(
    serverInfoPath,
    JSON.stringify({ baseUrl: `http://127.0.0.1:${port}`, pid: child.pid }),
  );

  // Vitest 4 invokes the teardown function RETURNED from globalSetup (a named
  // `teardown` export is not honored). The spawned child keeps the Vitest
  // process alive, so it must be terminated before the run can exit cleanly.
  return async () => {
    rmSync(serverInfoPath, { force: true });
    const running = server;
    server = undefined;
    if (!running || running.exitCode !== null) return;
    // The server installs SIGTERM/SIGINT handlers that close the Prisma pool.
    running.kill('SIGTERM');
    await new Promise<void>((resolvePromise) => {
      const forceKill = setTimeout(() => {
        running.kill('SIGKILL');
        resolvePromise();
      }, 5_000);
      running.once('exit', () => {
        clearTimeout(forceKill);
        resolvePromise();
      });
    });
  };
}
