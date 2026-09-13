// Server bootstrap: build the app, start listening, and shut down cleanly.
// SIGINT/SIGTERM stop new connections, drop idle keep-alive sockets, drain
// in-flight requests, and close the Prisma pool within a bounded grace window.
import type { Server } from 'node:http';
import { createApp } from './app.ts';
import { env } from './config.ts';
import { prisma } from './db.ts';
import { logger } from './logger.ts';
import {
  startMaintenanceScheduler,
  stopMaintenanceScheduler,
} from './lib/maintenance-scheduler.ts';

const GRACE_TIMEOUT_MS = 10_000;

// Surface non-fatal deployment misconfigurations once, before serving traffic.
for (const warning of env.warnings) {
  logger.warn({ action: 'config.warning' }, warning);
}

const server: Server = createApp().listen(env.port, () => {
  logger.info({ port: env.port }, `[backend] listening on http://localhost:${env.port}`);
  startMaintenanceScheduler();
});

server.on('error', (err: unknown) => {
  logger.error({ err }, 'Fatal server error (e.g. port already in use)');
  process.exit(1);
});

let shuttingDown = false;

async function shutdown(signal: string, exitCode: number): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down: closing server and database pool');
  stopMaintenanceScheduler();
  // Stop accepting new connections and drop idle keep-alive sockets so only
  // in-flight requests remain; a force-exit timer guarantees the orchestrator
  // can restart the container even if a connection hangs.
  server.closeIdleConnections();
  server.close();
  const forceExit = setTimeout(() => {
    logger.error({ graceTimeoutMs: GRACE_TIMEOUT_MS }, 'Grace period expired — forcing exit');
    process.exit(1);
  }, GRACE_TIMEOUT_MS);
  forceExit.unref();
  try {
    await prisma.$disconnect();
    logger.info('Shutdown complete');
    process.exit(exitCode);
  } catch (err: unknown) {
    logger.error({ err }, 'Error while disconnecting during shutdown');
    process.exit(1);
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void shutdown(signal, 0));
}

// Catastrophic process-level failures: log through pino first so the
// orchestrator restarts on a complete story, then exit(1) — preserving Node's
// default crash semantics for unhandled rejections and uncaught exceptions.
process.on('unhandledRejection', (reason: unknown) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
  process.exit(1);
});

process.on('uncaughtException', (err: unknown) => {
  logger.error({ err }, 'Uncaught exception');
  process.exit(1);
});
