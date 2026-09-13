// Unit tests for the shared validation helpers and enum constants. Pure unit
// tests with no mocks: the only collaborator is the real `errors` factory, whose
// ApiError is asserted on directly (status / code / message) so the
// optimistic-concurrency contract of FR-CC-13 is pinned end to end.
import { describe, expect, it } from 'vitest';
import { ApiError, FIELD_MESSAGES } from '../../../src/lib/errors.ts';
import {
  ACCOUNT_IMPORT_FIELDS,
  assertNoConflict,
  CONTACT_IMPORT_FIELDS,
  CONTACT_STATUSES,
  EMAIL_RE,
  INTERACTION_DIRECTIONS,
  INTERACTION_TYPES,
  optionalString,
  optionalStringOrNull,
  STAGE_CLASSIFICATIONS,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '../../../src/lib/validation.ts';

describe('EMAIL_RE', () => {
  it.each([
    'user@test.example',
    'first.last+tag@sub.domain.co',
    'UPPER@EXAMPLE.IO',
    'a@b.c',
    "o'brien@example.com",
  ])('accepts %s', (email) => {
    expect(EMAIL_RE.test(email)).toBe(true);
  });

  it.each([
    '',
    'plain',
    'a@b',
    'a@b.',
    '@example.com',
    'user@',
    'user@@example.com',
    'user name@example.com',
    'user@exa mple.com',
    'user@example.com ',
    'user\t@example.com',
  ])('rejects %s', (email) => {
    expect(EMAIL_RE.test(email)).toBe(false);
  });

  it('is stateless (no /g flag, so repeated tests agree)', () => {
    expect(EMAIL_RE.global).toBe(false);
    expect(EMAIL_RE.test('user@test.example')).toBe(true);
    expect(EMAIL_RE.test('user@test.example')).toBe(true);
  });
});

describe('enum constants', () => {
  it('pins the wire values shared with the frontend contract', () => {
    expect(CONTACT_STATUSES).toEqual(['active', 'inactive']);
    expect(INTERACTION_TYPES).toEqual(['email', 'call', 'meeting', 'note', 'other']);
    expect(INTERACTION_DIRECTIONS).toEqual(['inbound', 'outbound']);
    expect(TASK_PRIORITIES).toEqual(['high', 'medium', 'low']);
    expect(TASK_STATUSES).toEqual(['open', 'completed']);
    expect(STAGE_CLASSIFICATIONS).toEqual(['open', 'won', 'lost']);
  });

  it('contains no duplicate members', () => {
    const lists = [
      CONTACT_STATUSES,
      INTERACTION_TYPES,
      INTERACTION_DIRECTIONS,
      TASK_PRIORITIES,
      TASK_STATUSES,
      STAGE_CLASSIFICATIONS,
      CONTACT_IMPORT_FIELDS,
      ACCOUNT_IMPORT_FIELDS,
    ];
    for (const list of lists) {
      expect(new Set(list).size).toBe(list.length);
    }
  });
});

describe('import field lists', () => {
  it('lists every mappable contact column', () => {
    expect(CONTACT_IMPORT_FIELDS).toEqual([
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
    ]);
  });

  it('lists every mappable account column', () => {
    expect(ACCOUNT_IMPORT_FIELDS).toEqual([
      'name',
      'industry',
      'website',
      'phone',
      'billingAddress',
      'notes',
      'ownerEmail',
    ]);
  });

  it('shares the phone, notes and ownerEmail columns between both entities', () => {
    for (const field of ['phone', 'notes', 'ownerEmail'] as const) {
      expect(CONTACT_IMPORT_FIELDS).toContain(field);
      expect(ACCOUNT_IMPORT_FIELDS).toContain(field);
    }
  });
});

describe('optionalString', () => {
  it('returns the trimmed value for a padded string', () => {
    expect(optionalString('  Acme Corp  ')).toBe('Acme Corp');
  });

  it('keeps inner whitespace intact', () => {
    expect(optionalString(' two  words ')).toBe('two  words');
  });

  it('returns undefined for an empty string', () => {
    expect(optionalString('')).toBeUndefined();
  });

  it.each([' ', '   ', '\t', '\n', ' \t\n '])(
    'returns undefined for whitespace-only %j',
    (value) => {
      expect(optionalString(value)).toBeUndefined();
    },
  );

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['number', 42],
    ['zero', 0],
    ['boolean', false],
    ['object', { name: 'Acme' }],
    ['array', ['Acme']],
  ])('returns undefined for a %s value (strings only)', (_label, value) => {
    expect(optionalString(value)).toBeUndefined();
  });

  it('preserves a value that is only meaningful after trimming, such as "0"', () => {
    expect(optionalString(' 0 ')).toBe('0');
  });
});

describe('optionalStringOrNull', () => {
  it('returns the trimmed value when present', () => {
    expect(optionalStringOrNull('  note  ')).toBe('note');
  });

  it.each([
    ['empty string', ''],
    ['whitespace only', '   '],
    ['undefined', undefined],
    ['null', null],
    ['number', 42],
    ['object', {}],
  ])('returns null for %s (explicit SQL NULL)', (_label, value) => {
    expect(optionalStringOrNull(value)).toBeNull();
  });

  it('never returns undefined, so Prisma clears the column instead of skipping it', () => {
    for (const value of ['', '  ', undefined, null, 1]) {
      expect(optionalStringOrNull(value)).not.toBeUndefined();
    }
  });
});

describe('assertNoConflict', () => {
  const current = new Date('2026-03-01T12:00:00.000Z');

  it('passes when the sent token equals the current updatedAt', () => {
    expect(() => assertNoConflict(current.toISOString(), current)).not.toThrow();
  });

  it('throws a 409 conflict ApiError when the token is stale', () => {
    let thrown: unknown;
    try {
      assertNoConflict('2026-02-28T12:00:00.000Z', current);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(ApiError);
    const apiError = thrown as ApiError;
    expect(apiError.status).toBe(409);
    expect(apiError.code).toBe('conflict');
    expect(apiError.message).toBe(FIELD_MESSAGES.conflictReload);
    expect(apiError.details).toBeUndefined();
  });

  it('throws when the token differs by a single millisecond', () => {
    expect(() => assertNoConflict('2026-03-01T12:00:00.001Z', current)).toThrow(ApiError);
  });

  it('throws for an equivalent instant written in a different ISO form (strict string compare)', () => {
    expect(() => assertNoConflict('2026-03-01T12:00:00Z', current)).toThrow(ApiError);
    expect(() => assertNoConflict('2026-03-01T13:00:00.000+01:00', current)).toThrow(ApiError);
  });

  it('throws for an empty string, which can never match an ISO timestamp', () => {
    expect(() => assertNoConflict('', current)).toThrow(ApiError);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['number', 1772366400000],
    ['Date instance', new Date('2020-01-01T00:00:00.000Z')],
    ['object', { updatedAt: '2026-03-01T12:00:00.000Z' }],
    ['array', ['2026-03-01T12:00:00.000Z']],
  ])('skips the check when the client sends a %s (legacy callers)', (_label, sent) => {
    expect(() => assertNoConflict(sent, current)).not.toThrow();
  });

  it('returns undefined on success', () => {
    expect(assertNoConflict(undefined, current)).toBeUndefined();
    expect(assertNoConflict(current.toISOString(), current)).toBeUndefined();
  });
});
