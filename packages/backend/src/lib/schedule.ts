// Pure scheduling math for the in-process maintenance timers. Kept free of
// config/db imports so it stays unit-testable without a database
// (test/unit/lib/schedule.test.ts).
//
// The daily maintenance job is anchored to a wall-clock time in the server's
// LOCAL timezone (MAINTENANCE_PURGE_HOUR : MAINTENANCE_PURGE_MINUTE). Every run
// recomputes the next occurrence, so the job stays at the same local time across
// daylight-saving transitions.

/**
 * Milliseconds from `now` until the next occurrence of `hour:minute` in the
 * server's local timezone. When that time has already passed today, the next
 * calendar day is used, so the result is always in the `(0, 24h]` range.
 */
export function msUntilNextTime(hour: number, minute: number, now: Date = new Date()): number {
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  // `setDate` moves to the same wall-clock time on the next local calendar day
  // (unlike `+ 24h`, which drifts by an hour across a DST transition).
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}
