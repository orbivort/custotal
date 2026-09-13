// UTC / date-only helpers (FR-CC-14).
// Instants are stored as UTC timestamps; due dates and expected close dates are
// date-only (YYYY-MM-DD) and serialized as such on the wire.

/** Serialize a Date as an ISO-8601 UTC instant string, or undefined. */
export function iso(d: Date | null | undefined): string | undefined {
  return d ? d.toISOString() : undefined;
}

/** Format a Date held at UTC-midnight (from a @db.Date column) as YYYY-MM-DD. */
export function dateOnlyString(d: Date | null | undefined): string | undefined {
  if (!d) return undefined;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse a YYYY-MM-DD string into a UTC-midnight Date, or null when empty. */
export function parseDateOnly(s: string | null | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return new Date(`${s}T00:00:00.000Z`);
}

/**
 * Today's date (YYYY-MM-DD) in the configured tenant timezone. Used for the
 * "overdue at 00:00 user-local the day after due" semantics: a task due today is
 * not overdue, one due yesterday is.
 */
export function todayInTimezone(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}

/** Today at UTC midnight as a Date — the canonical value for date-only defaults. */
export function todayUtcDate(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
