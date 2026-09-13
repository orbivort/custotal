// Unit tests for the ApiError class and the `errors` factory set (FR-CC-10).
// Pure unit tests: no mocks, no database, no HTTP server. They pin the
// status / code / message / details triples that the error-handler middleware
// serializes into the JSON error envelope, so a change in wording or status
// cannot slip through unnoticed.
import { describe, expect, it } from 'vitest';
import { ApiError, errors, FIELD_MESSAGES, type FieldError } from '../../../src/lib/errors.ts';

const details: FieldError[] = [
  { field: 'email', message: 'Invalid email format.' },
  { field: 'phone', message: 'At least one of email or phone is required.' },
];

describe('ApiError', () => {
  it('exposes status, code, message and details', () => {
    const err = new ApiError(422, 'unprocessable', 'Nope.', details);
    expect(err.status).toBe(422);
    expect(err.code).toBe('unprocessable');
    expect(err.message).toBe('Nope.');
    expect(err.details).toEqual(details);
  });

  it('is a real Error subclass named ApiError', () => {
    const err = new ApiError(400, 'bad_request', 'Bad.');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.name).toBe('ApiError');
    expect(typeof err.stack).toBe('string');
  });

  it('leaves details undefined when omitted', () => {
    const err = new ApiError(500, 'internal', 'Boom.');
    expect(err.details).toBeUndefined();
  });

  it('keeps an explicitly empty details array (the handler drops it later)', () => {
    const err = new ApiError(400, 'validation', 'Bad.', []);
    expect(err.details).toEqual([]);
  });

  it('is throwable and catchable as an ApiError', () => {
    expect(() => {
      throw new ApiError(403, 'forbidden', 'No.');
    }).toThrow(ApiError);
  });
});

describe('errors.validation', () => {
  it('produces 400 validation with the default message and the given details', () => {
    const err = errors.validation(details);
    expect(err.status).toBe(400);
    expect(err.code).toBe('validation');
    expect(err.message).toBe('Please correct the highlighted fields.');
    expect(err.details).toEqual(details);
  });

  it('accepts a custom message', () => {
    expect(errors.validation(details, 'Custom.').message).toBe('Custom.');
  });

  it('accepts an empty details array', () => {
    const err = errors.validation([]);
    expect(err.status).toBe(400);
    expect(err.details).toEqual([]);
  });
});

describe('errors.badRequest', () => {
  it('uses the provided code and message', () => {
    const err = errors.badRequest('bad_json', 'Request body is not valid JSON.');
    expect(err.status).toBe(400);
    expect(err.code).toBe('bad_json');
    expect(err.message).toBe('Request body is not valid JSON.');
    expect(err.details).toBeUndefined();
  });

  it('falls back to the bad_request code when the code argument is undefined', () => {
    const err = errors.badRequest(undefined, 'Something is off.');
    expect(err.code).toBe('bad_request');
    expect(err.message).toBe('Something is off.');
  });
});

describe('errors — 401 family', () => {
  it('unauthorized defaults to the generic authentication message', () => {
    const err = errors.unauthorized();
    expect(err.status).toBe(401);
    expect(err.code).toBe('unauthorized');
    expect(err.message).toBe('Authentication required.');
  });

  it('unauthorized accepts a custom message', () => {
    expect(errors.unauthorized('Session expired.').message).toBe('Session expired.');
  });

  it('invalidCredentials never reveals which field was wrong', () => {
    const err = errors.invalidCredentials();
    expect(err.status).toBe(401);
    expect(err.code).toBe('invalid_credentials');
    expect(err.message).toBe('Invalid email or password.');
  });

  it('adminOnly reports 403 forbidden with the admin-only message', () => {
    const err = errors.adminOnly();
    expect(err.status).toBe(403);
    expect(err.code).toBe('forbidden');
    expect(err.message).toBe('Administrator access required.');
  });
});

describe('errors.forbidden', () => {
  it('defaults to 403 with the standard permission message', () => {
    const err = errors.forbidden();
    expect(err.status).toBe(403);
    expect(err.code).toBe('forbidden');
    expect(err.message).toBe('You do not have permission to perform this action.');
  });

  it('accepts a custom message', () => {
    expect(errors.forbidden('Read-only users cannot edit.').message).toBe(
      'Read-only users cannot edit.',
    );
  });
});

describe('errors.notFound', () => {
  it('defaults to 404 not_found', () => {
    const err = errors.notFound();
    expect(err.status).toBe(404);
    expect(err.code).toBe('not_found');
    expect(err.message).toBe('Resource not found.');
  });

  it('accepts a resource-specific code and message', () => {
    const err = errors.notFound('contact_not_found', 'Contact not found.');
    expect(err.status).toBe(404);
    expect(err.code).toBe('contact_not_found');
    expect(err.message).toBe('Contact not found.');
  });

  it('keeps the default message when only the code is given', () => {
    expect(errors.notFound('stage_not_found').message).toBe('Resource not found.');
  });
});

describe('errors — 409 family', () => {
  it('conflict carries the optimistic-concurrency reload wording', () => {
    const err = errors.conflict();
    expect(err.status).toBe(409);
    expect(err.code).toBe('conflict');
    expect(err.message).toBe(FIELD_MESSAGES.conflictReload);
  });

  it('conflict accepts a custom message', () => {
    expect(errors.conflict('Email already in use.').message).toBe('Email already in use.');
  });

  it('inUse reports 409 in_use with the caller message', () => {
    const err = errors.inUse('Stage is used by 3 opportunities.');
    expect(err.status).toBe(409);
    expect(err.code).toBe('in_use');
    expect(err.message).toBe('Stage is used by 3 opportunities.');
  });
});

describe('errors.rateLimited', () => {
  it('reports 429 rate_limited with the caller message', () => {
    const err = errors.rateLimited('Too many attempts. Try again later.');
    expect(err.status).toBe(429);
    expect(err.code).toBe('rate_limited');
    expect(err.message).toBe('Too many attempts. Try again later.');
  });
});

describe('errors.internal', () => {
  it('defaults to 500 internal with a non-leaking message', () => {
    const err = errors.internal();
    expect(err.status).toBe(500);
    expect(err.code).toBe('internal');
    expect(err.message).toBe('An unexpected error occurred.');
  });

  it('accepts a custom message', () => {
    expect(errors.internal('Backup failed.').message).toBe('Backup failed.');
  });
});

describe('errors — cross-factory invariants', () => {
  it('every factory returns a fresh ApiError instance', () => {
    const produced = [
      errors.validation(details),
      errors.badRequest('bad_json', 'x'),
      errors.unauthorized(),
      errors.invalidCredentials(),
      errors.forbidden(),
      errors.adminOnly(),
      errors.notFound(),
      errors.conflict(),
      errors.inUse('x'),
      errors.rateLimited('x'),
      errors.internal(),
    ];
    for (const err of produced) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err.status).toBeGreaterThanOrEqual(400);
      expect(err.code.length).toBeGreaterThan(0);
      expect(err.message.length).toBeGreaterThan(0);
    }
    expect(errors.notFound()).not.toBe(errors.notFound());
  });

  it('only the validation factory attaches details', () => {
    expect(errors.validation(details).details).toEqual(details);
    for (const err of [
      errors.unauthorized(),
      errors.forbidden(),
      errors.conflict(),
      errors.internal(),
    ]) {
      expect(err.details).toBeUndefined();
    }
  });
});

describe('FIELD_MESSAGES', () => {
  it('pins the shared field wording used across resources', () => {
    expect(FIELD_MESSAGES).toEqual({
      invalidEmail: 'Invalid email format.',
      emailOrPhoneRequired: 'At least one of email or phone is required.',
      conflictReload: 'This record was modified by someone else. Reload and re-apply your changes.',
    });
  });
});
