// Unit tests for the Origin/Referer CSRF middleware. Pure unit tests: the CORS
// allow-list is mocked at the config module boundary. Covers safe-method
// pass-through, absent-provenance pass-through, same-origin and allow-listed
// origins, and rejection of cross-origin / unparseable provenance.
import type { NextFunction, Request, Response } from 'express';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../src/lib/errors.ts';
import { csrfProtection } from '../../../src/middleware/csrf.ts';
import { mockRes } from '../../support/mocks/express.ts';

vi.mock('../../../src/config.ts', () => ({
  env: { corsOrigins: ['https://app.example.com'] },
}));

function reqWith(headers: Record<string, string | undefined>, method = 'POST'): Request {
  return { headers, method } as unknown as Request;
}

/** Express Response double — the CSRF middleware never touches the response. */
function resDouble(): Response {
  return mockRes() as unknown as Response;
}

let next: NextFunction & Mock;

/** The ApiError the middleware forwarded to next(). */
function forwardedError(): ApiError {
  return next.mock.calls[0][0] as ApiError;
}

beforeEach(() => {
  next = vi.fn() as unknown as NextFunction & Mock;
});

describe('csrfProtection — safe methods', () => {
  it.each(['GET', 'HEAD', 'OPTIONS'])('passes %s through regardless of Origin', (method) => {
    csrfProtection(reqWith({ origin: 'https://evil.example.org' }, method), resDouble(), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });
});

describe('csrfProtection — no browser provenance', () => {
  it('allows a mutating request with neither Origin nor Referer', () => {
    csrfProtection(reqWith({}), resDouble(), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });
});

describe('csrfProtection — allowed provenance', () => {
  it('allows an allow-listed Origin', () => {
    csrfProtection(reqWith({ origin: 'https://app.example.com' }), resDouble(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('allows a same-origin request whose Origin host matches the request Host', () => {
    csrfProtection(
      reqWith({ origin: 'https://crm.example.com', host: 'crm.example.com' }),
      resDouble(),
      next,
    );
    expect(next).toHaveBeenCalledWith();
  });

  it('falls back to Referer when Origin is absent and allows an allow-listed one', () => {
    csrfProtection(reqWith({ referer: 'https://app.example.com/deals' }), resDouble(), next);
    expect(next).toHaveBeenCalledWith();
  });
});

describe('csrfProtection — rejected provenance', () => {
  it('rejects a cross-origin mutating request that is not allow-listed', () => {
    csrfProtection(reqWith({ origin: 'https://evil.example.org' }), resDouble(), next);

    const error = forwardedError();
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(403);
    expect(error.code).toBe('forbidden');
  });

  it('rejects a cross-origin Referer when Origin is absent', () => {
    csrfProtection(reqWith({ referer: 'https://evil.example.org/attack' }), resDouble(), next);
    expect(forwardedError().status).toBe(403);
  });

  it('rejects an unparseable Origin (e.g. the sandboxed "null")', () => {
    csrfProtection(reqWith({ origin: 'null' }), resDouble(), next);
    expect(forwardedError().status).toBe(403);
  });
});
