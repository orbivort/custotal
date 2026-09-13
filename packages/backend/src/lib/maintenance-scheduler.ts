// In-process daily scheduler for the 30-day soft-delete purge (FR-CC-05, ADR-0007).
//
// Why in-process: the purge is bounded, idempotent, off-peak, and I/O-bound (it
// awaits the Prisma pool), and the backend is explicitly single-instance — so
// owning the schedule here removes the manual scheduler gate without a real
// performance cost. `scripts/purge.ts` remains for deployments that prefer an
// external scheduler or run multiple replicas.
//
// Guards: single-flight (a tick never overlaps a running purge), error-contained
// (a failure is logged and never reaches the process-level crash handlers in
// index.ts), and cancelled on graceful shutdown.
import { env } from '../config.ts';
import { prisma } from '../db.ts';
import { logger } from '../logger.ts';
import { purgeExpiredRecords } from '../services/purge-service.ts';
import { msUntilNextTime } from './schedule.ts';

let timer: NodeJS.Timeout | undefined;
let inFlight = false;

async function runOnce(): Promise<void> {
  if (inFlight) {
    logger.warn({ action: 'maintenance.purge' }, 'Skipped: previous purge is still running');
    return;
  }
  inFlight = true;
  const startedAt = Date.now();
  try {
    const purged = await purgeExpiredRecords(prisma);
    logger.info(
      { action: 'maintenance.purge', purged, durationMs: Date.now() - startedAt },
      'Scheduled soft-delete purge completed',
    );
  } catch (err: unknown) {
    logger.error({ err, action: 'maintenance.purge' }, 'Scheduled soft-delete purge failed');
  } finally {
    inFlight = false;
  }
}

/** Arm the daily purge timer. No-op when disabled by configuration. */
export function startMaintenanceScheduler(): void {
  if (!env.maintenancePurgeEnabled) {
    logger.info({ action: 'maintenance.purge' }, 'In-process purge scheduler disabled');
    return;
  }
  const at = `${String(env.maintenancePurgeHour).padStart(2, '0')}:${String(
    env.maintenancePurgeMinute,
  ).padStart(2, '0')}`;
  // Re-arm after every run (`.finally`) so the purge fires daily at the same
  // server-local wall-clock time; a run that fails is still rescheduled.
  const scheduleNext = (): void => {
    timer = setTimeout(
      () => void runOnce().finally(scheduleNext),
      msUntilNextTime(env.maintenancePurgeHour, env.maintenancePurgeMinute),
    );
    timer.unref();
  };
  scheduleNext();
  logger.info(
    { action: 'maintenance.purge', at, timezone: 'server-local' },
    'In-process purge scheduler armed (daily)',
  );
}

/** Cancel the pending timer (graceful shutdown). */
export function stopMaintenanceScheduler(): void {
  if (timer) clearTimeout(timer);
  timer = undefined;
}
