// Shared field validation helpers. Messages mirror the frontend mock exactly.
import { errors } from './errors.ts';

/** RFC 5321 §4.5.3.1.3 mailbox limit (local-part + "@" + domain). */
export const EMAIL_MAX_LENGTH = 254;

/** Local part: non-empty and free of whitespace (the "@" was already split off). */
const EMAIL_LOCAL_RE = /^\S+$/;

/** One domain label: non-empty, and neither whitespace nor the "." separator. */
const EMAIL_LABEL_RE = /^[^\s@.]+$/;

/**
 * Shape and length check for an email address. Callers pass the value they will
 * persist (already trimmed; callers normalize case where relevant).
 *
 * The rules are expressed as a length cap plus a split on "." rather than as one
 * pattern, because "at least one dot in the domain" can only be written as a
 * repeated group (`(?:label\.)+label`) — which both CodeQL (`js/polynomial-redos`,
 * the alert this replaced) and ESLint's `security/detect-unsafe-regex` have to
 * treat as ambiguous quantifiers, and which really was quadratic here: the old
 * `^[^\s@]+@[^\s@]+\.[^\s@]+$` overlapped the literal dot with `[^\s@]`, costing
 * ~1.4 s on a craftable value through the 12 MB CSV import body. This version is
 * strictly linear in the input, and the cap runs before any matching or
 * splitting.
 */
export function isValidEmail(value: string): boolean {
  if (value.length === 0 || value.length > EMAIL_MAX_LENGTH) return false;
  const at = value.indexOf('@');
  // Exactly one "@", and something before it.
  if (at <= 0 || at !== value.lastIndexOf('@')) return false;
  if (!EMAIL_LOCAL_RE.test(value.slice(0, at))) return false;
  const labels = value.slice(at + 1).split('.');
  // A domain needs at least two labels, and none of them may be empty.
  return labels.length > 1 && labels.every((label) => EMAIL_LABEL_RE.test(label));
}

export const CONTACT_STATUSES = ['active', 'inactive'] as const;
export const INTERACTION_TYPES = ['email', 'call', 'meeting', 'note', 'other'] as const;
export const INTERACTION_DIRECTIONS = ['inbound', 'outbound'] as const;
export const TASK_PRIORITIES = ['high', 'medium', 'low'] as const;
export const TASK_STATUSES = ['open', 'completed'] as const;
export const STAGE_CLASSIFICATIONS = ['open', 'won', 'lost'] as const;

export const CONTACT_IMPORT_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'jobTitle',
  'company',
  'address',
  'notes',
  'status',
  'ownerEmail',
] as const;

export const ACCOUNT_IMPORT_FIELDS = [
  'name',
  'industry',
  'website',
  'phone',
  'billingAddress',
  'notes',
  'ownerEmail',
] as const;

export function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function optionalStringOrNull(value: unknown): string | null {
  return optionalString(value) ?? null;
}

/**
 * Optimistic-concurrency guard (FR-CC-13): when the client sends the updatedAt token
 * it last saw, a mismatch means another writer changed the record -> 409. When the
 * client omits the token the check is skipped (some legacy callers do not send it).
 */
export function assertNoConflict(sentUpdatedAt: unknown, current: Date): void {
  if (typeof sentUpdatedAt === 'string' && sentUpdatedAt !== current.toISOString()) {
    throw errors.conflict();
  }
}
