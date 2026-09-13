// Shared field validation helpers. Messages mirror the frontend mock exactly.
import { errors } from './errors.ts';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
