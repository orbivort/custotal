// Unit tests for the UTC / date-only helpers (FR-CC-14). Pure unit tests: the
// only "mock" is Vitest's fake clock, used to freeze `new Date()` so the
// timezone-sensitive helpers (todayInTimezone / todayUtcDate) are deterministic.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dateOnlyString,
  iso,
  parseDateOnly,
  todayInTimezone,
  todayUtcDate,
} from '../../../src/lib/time.ts';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Freeze the system clock at an ISO instant for the duration of one test. */
function freezeAt(instant: string): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(instant));
}

afterEach(() => {
  vi.useRealTimers();
});

describe('iso', () => {
  it('serializes a Date as an ISO-8601 UTC instant', () => {
    expect(iso(new Date('2026-03-01T12:34:56.789Z'))).toBe('2026-03-01T12:34:56.789Z');
  });

  it('normalizes a non-UTC offset to Z', () => {
    expect(iso(new Date('2026-03-01T09:00:00+09:00'))).toBe('2026-03-01T00:00:00.000Z');
  });

  it('always includes milliseconds and the Z suffix', () => {
    const value = iso(new Date(Date.UTC(2026, 6, 4)));
    expect(value).toBe('2026-07-04T00:00:00.000Z');
    expect(value?.endsWith('Z')).toBe(true);
  });

  it('returns undefined for null and undefined', () => {
    expect(iso(null)).toBeUndefined();
    expect(iso(undefined)).toBeUndefined();
  });

  it('handles the unix epoch (a truthy Date, not treated as empty)', () => {
    expect(iso(new Date(0))).toBe('1970-01-01T00:00:00.000Z');
  });

  it('propagates the RangeError of an invalid Date instead of masking it', () => {
    expect(() => iso(new Date('not-a-date'))).toThrow(RangeError);
  });
});

describe('dateOnlyString', () => {
  it('formats a UTC-midnight Date as YYYY-MM-DD', () => {
    expect(dateOnlyString(new Date('2026-03-01T00:00:00.000Z'))).toBe('2026-03-01');
  });

  it('zero-pads single-digit months and days', () => {
    expect(dateOnlyString(new Date(Date.UTC(2026, 0, 5)))).toBe('2026-01-05');
  });

  it('uses UTC components and ignores the time portion', () => {
    expect(dateOnlyString(new Date('2026-12-31T23:59:59.999Z'))).toBe('2026-12-31');
    expect(dateOnlyString(new Date('2026-07-04T00:00:00.001Z'))).toBe('2026-07-04');
  });

  it('does not shift the day for a positive-offset input', () => {
    // 2026-03-02T08:00+09:00 is 2026-03-01T23:00Z -> still March 1 in UTC.
    expect(dateOnlyString(new Date('2026-03-02T08:00:00+09:00'))).toBe('2026-03-01');
  });

  it('returns undefined for null and undefined', () => {
    expect(dateOnlyString(null)).toBeUndefined();
    expect(dateOnlyString(undefined)).toBeUndefined();
  });

  it('formats the unix epoch as 1970-01-01', () => {
    expect(dateOnlyString(new Date(0))).toBe('1970-01-01');
  });

  it('always emits the YYYY-MM-DD shape for leap days and month ends', () => {
    for (const instant of ['2024-02-29T00:00:00.000Z', '2026-04-30T00:00:00.000Z']) {
      expect(dateOnlyString(new Date(instant))).toMatch(DATE_ONLY_RE);
    }
    expect(dateOnlyString(new Date('2024-02-29T00:00:00.000Z'))).toBe('2024-02-29');
  });
});

describe('parseDateOnly', () => {
  it('parses YYYY-MM-DD into a UTC-midnight Date', () => {
    const parsed = parseDateOnly('2026-03-01');
    expect(parsed).toBeInstanceOf(Date);
    expect(parsed?.toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });

  it('parses a leap day', () => {
    expect(parseDateOnly('2024-02-29')?.toISOString()).toBe('2024-02-29T00:00:00.000Z');
  });

  it('round-trips with dateOnlyString', () => {
    expect(dateOnlyString(parseDateOnly('2026-07-04'))).toBe('2026-07-04');
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty string', ''],
  ])('returns null for %s', (_label, value) => {
    expect(parseDateOnly(value)).toBeNull();
  });

  it.each([
    '2026-3-1',
    '26-03-01',
    '2026/03/01',
    '2026-03-01T00:00:00Z',
    ' 2026-03-01',
    '2026-03-01 ',
    '2026-03-1',
    'abc',
    '20260301',
  ])('returns null for the malformed value %s', (value) => {
    expect(parseDateOnly(value)).toBeNull();
  });

  it('returns an Invalid Date for a well-formed but impossible date', () => {
    // The regex only checks the shape; Date construction decides validity.
    const parsed = parseDateOnly('2026-13-45');
    expect(parsed).toBeInstanceOf(Date);
    expect(Number.isNaN(parsed?.getTime())).toBe(true);
  });

  it('returns a distinct Date instance per call', () => {
    expect(parseDateOnly('2026-03-01')).not.toBe(parseDateOnly('2026-03-01'));
    expect(parseDateOnly('2026-03-01')?.getTime()).toBe(parseDateOnly('2026-03-01')?.getTime());
  });
});

describe('todayInTimezone', () => {
  it('returns the UTC date when the timezone is UTC', () => {
    freezeAt('2026-03-01T05:00:00.000Z');
    expect(todayInTimezone('UTC')).toBe('2026-03-01');
  });

  it('returns the previous day for a behind-UTC timezone near midnight UTC', () => {
    freezeAt('2026-03-01T05:00:00.000Z'); // 2026-02-28 21:00 in Los Angeles (PST)
    expect(todayInTimezone('America/Los_Angeles')).toBe('2026-02-28');
  });

  it('returns the next day for an ahead-of-UTC timezone late in the UTC day', () => {
    freezeAt('2026-03-01T23:30:00.000Z'); // 2026-03-02 08:30 in Tokyo
    expect(todayInTimezone('Asia/Tokyo')).toBe('2026-03-02');
  });

  it('gives different answers per timezone for the same instant', () => {
    freezeAt('2026-03-01T05:00:00.000Z');
    expect(todayInTimezone('Asia/Tokyo')).toBe('2026-03-01');
    expect(todayInTimezone('America/Los_Angeles')).toBe('2026-02-28');
  });

  it('always returns the YYYY-MM-DD shape (en-CA formatting)', () => {
    freezeAt('2026-01-05T12:00:00.000Z');
    for (const zone of ['UTC', 'Europe/Berlin', 'Asia/Tokyo', 'America/New_York']) {
      expect(todayInTimezone(zone)).toMatch(DATE_ONLY_RE);
    }
    expect(todayInTimezone('UTC')).toBe('2026-01-05');
  });

  it('throws a RangeError for an unknown timezone', () => {
    expect(() => todayInTimezone('Not/AZone')).toThrow(RangeError);
  });
});

describe('todayUtcDate', () => {
  it('returns today at UTC midnight', () => {
    freezeAt('2026-03-01T23:30:00.000Z');
    expect(todayUtcDate().toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });

  it('keeps the same day at the very start of the UTC day', () => {
    freezeAt('2026-03-01T00:00:00.000Z');
    expect(todayUtcDate().toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });

  it('keeps the same day at the very end of the UTC day', () => {
    freezeAt('2026-03-01T23:59:59.999Z');
    expect(todayUtcDate().toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });

  it('rolls over to the next day past midnight UTC', () => {
    freezeAt('2026-12-31T23:59:59.999Z');
    expect(dateOnlyString(todayUtcDate())).toBe('2026-12-31');
    vi.setSystemTime(new Date('2027-01-01T00:00:00.000Z'));
    expect(dateOnlyString(todayUtcDate())).toBe('2027-01-01');
  });

  it('has no time component, so it is safe for @db.Date columns', () => {
    freezeAt('2026-06-15T18:45:12.345Z');
    const today = todayUtcDate();
    expect(today.getUTCHours()).toBe(0);
    expect(today.getUTCMinutes()).toBe(0);
    expect(today.getUTCSeconds()).toBe(0);
    expect(today.getUTCMilliseconds()).toBe(0);
  });

  it('agrees with todayInTimezone("UTC")', () => {
    freezeAt('2026-06-15T18:45:12.345Z');
    expect(dateOnlyString(todayUtcDate())).toBe(todayInTimezone('UTC'));
  });
});
