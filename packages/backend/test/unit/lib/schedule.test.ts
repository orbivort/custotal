// Unit tests for the pure maintenance scheduling math. No database, no mocks:
// `msUntilNextTime` only manipulates a Date. January 15 is used as the anchor so
// no daylight-saving transition can shift the expected wall-clock time anywhere.
import { describe, expect, it } from 'vitest';
import { msUntilNextTime } from '../../../src/lib/schedule.ts';

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const local = (hour: number, minute = 0) => new Date(2026, 0, 15, hour, minute, 0, 0);

describe('msUntilNextTime', () => {
  it('schedules later the same day when the target time is still ahead', () => {
    expect(msUntilNextTime(3, 0, local(1))).toBe(2 * HOUR_MS);
  });

  it('respects the configured minute', () => {
    expect(msUntilNextTime(2, 30, local(2, 0))).toBe(30 * MINUTE_MS);
  });

  it('rolls to the next day once the target time has passed', () => {
    expect(msUntilNextTime(3, 0, local(5))).toBe(22 * HOUR_MS);
  });

  it('rolls to the next day when now is exactly the target time', () => {
    expect(msUntilNextTime(3, 0, local(3, 0))).toBe(24 * HOUR_MS);
  });

  it('anchors the documented default of 02:00 to the next day once past', () => {
    expect(msUntilNextTime(2, 0, local(2, 1))).toBe(23 * HOUR_MS + 59 * MINUTE_MS);
  });

  it('always returns a positive delay within 24h', () => {
    for (const hour of [0, 6, 12, 23]) {
      const delay = msUntilNextTime(2, 0, local(hour));
      expect(delay).toBeGreaterThan(0);
      expect(delay).toBeLessThanOrEqual(24 * HOUR_MS);
    }
  });
});
