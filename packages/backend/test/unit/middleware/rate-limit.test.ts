// Unit tests for the rate-limiting middleware (FR-CC-11). The limiters use the
// real express-rate-limit middleware with its in-memory store; only the env
// config is mocked (nodeEnv=test). Covers the test-environment skip, the
// per-IP / per-email / per-user keying, and the standard 429 error envelope
// with the Retry-After header.
import type { NextFunction, Request, Response } from 'express';
import type { Mock } from 'vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../../src/config.ts';
import {
  generalLimiter,
  loginLimiter,
  resetRequestLimiter,
} from '../../../src/middleware/rate-limit.ts';

vi.mock('../../../src/config.ts', () => ({
  env: { nodeEnv: 'test' },
}));

const RATE_LIMITED_MESSAGE = {
  login: 'Too many login attempts. Try again in a minute.',
  reset: 'Too many password reset requests. Try again later.',
  general: 'Too many requests. Slow down.',
} as const;

/** Request double with the fields the limiters and key generators touch. */
function limiterReq(overrides: Record<string, unknown> = {}): Request {
  return {
    ip: '203.0.113.5',
    method: 'POST',
    headers: {},
    // express-rate-limit runs trust-proxy validations against the app settings.
    app: { get: () => false },
    body: {},
    user: undefined,
    ...overrides,
  } as unknown as Request;
}

/** Response double with status/json/setHeader recording. */
function limiterRes(): Response & { headerMap: Map<string, string>; body: unknown } {
  const headerMap = new Map<string, string>();
  const res = {
    headerMap,
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
    setHeader(name: string, value: string) {
      headerMap.set(String(name).toLowerCase(), value);
      return res;
    },
    append(name: string, value: string) {
      headerMap.set(String(name).toLowerCase(), String(value));
      return res;
    },
  };
  return res as unknown as Response & { headerMap: Map<string, string>; body: unknown };
}

async function run(
  limiter: (req: Request, res: Response, next: NextFunction) => void,
  req: Request,
  next: Mock,
) {
  await limiter(req, limiterRes() as unknown as Response, next as unknown as NextFunction);
}

/**
 * Assert the last (limited) request produced the standard 429 envelope.
 * `allowedBefore` is the number of requests that passed before it — next must
 * not have been called again by the limited request.
 */
function expectLimited(
  next: Mock,
  res: Response & { headerMap: Map<string, string>; body: unknown; statusCode: number },
  retryAfter: string,
  message: string,
  allowedBefore: number,
) {
  expect(next).toHaveBeenCalledTimes(allowedBefore);
  expect(res.statusCode).toBe(429);
  expect(res.headerMap.get('retry-after')).toBe(retryAfter);
  expect(res.body).toEqual({ error: { code: 'rate_limited', message } });
}

afterEach(() => {
  delete process.env.VITEST_RATE_LIMIT;
});

describe('rate limiting — test-environment skip', () => {
  it('skips all limiters when VITEST_RATE_LIMIT is not opted in', async () => {
    expect(env.nodeEnv).toBe('test');

    const nextLogin = vi.fn() as unknown as Mock;
    await run(loginLimiter, limiterReq(), nextLogin);

    const nextReset = vi.fn() as unknown as Mock;
    await run(resetRequestLimiter(), limiterReq(), nextReset);

    const nextGeneral = vi.fn() as unknown as Mock;
    await run(generalLimiter, limiterReq(), nextGeneral);

    expect(nextLogin).toHaveBeenCalledTimes(1);
    expect(nextReset).toHaveBeenCalledTimes(1);
    expect(nextGeneral).toHaveBeenCalledTimes(1);
  });

  it('opting out of the skip via VITEST_RATE_LIMIT=1 enforces the limits again', async () => {
    process.env.VITEST_RATE_LIMIT = '1';
    const limiter = resetRequestLimiter();
    const next = vi.fn() as unknown as Mock;
    for (let i = 0; i < 3; i += 1) {
      await run(limiter, limiterReq({ body: { email: 'flood@example.com' } }), next);
    }
    expect(next).toHaveBeenCalledTimes(3);
    const res = limiterRes();
    await limiter(
      limiterReq({ body: { email: 'flood@example.com' } }),
      res as unknown as Response,
      next as unknown as NextFunction,
    );
    expectLimited(next, res, '3600', RATE_LIMITED_MESSAGE.reset, 3);
  });
});

describe('loginLimiter', () => {
  it('allows 5 attempts per email+IP per minute and rate-limits the 6th with a 60s Retry-After', async () => {
    process.env.VITEST_RATE_LIMIT = '1';
    const next = vi.fn() as unknown as Mock;
    for (let i = 0; i < 5; i += 1) {
      await run(loginLimiter, limiterReq({ body: { email: 'brute@example.com' } }), next);
    }
    expect(next).toHaveBeenCalledTimes(5);

    const res = limiterRes();
    await loginLimiter(
      limiterReq({ body: { email: 'brute@example.com' } }),
      res as unknown as Response,
      next as unknown as NextFunction,
    );
    expectLimited(next, res, '60', RATE_LIMITED_MESSAGE.login, 5);
  });

  it('keys on the email+IP pair so a different account or address is unaffected', async () => {
    process.env.VITEST_RATE_LIMIT = '1';
    const next = vi.fn() as unknown as Mock;
    // Exhaust the bucket for one mailbox from one address...
    for (let i = 0; i < 5; i += 1) {
      await run(
        loginLimiter,
        limiterReq({ ip: '198.51.100.7', body: { email: 'target@example.com' } }),
        next,
      );
    }
    expect(next).toHaveBeenCalledTimes(5);

    // ...a different mailbox from the same IP still gets through...
    await run(
      loginLimiter,
      limiterReq({ ip: '198.51.100.7', body: { email: 'other@example.com' } }),
      next,
    );
    expect(next).toHaveBeenCalledTimes(6);

    // ...as does the same mailbox from a different address.
    await run(
      loginLimiter,
      limiterReq({ ip: '198.51.100.8', body: { email: 'target@example.com' } }),
      next,
    );
    expect(next).toHaveBeenCalledTimes(7);
  });

  it('normalizes the email (trim + lowercase) before keying', async () => {
    process.env.VITEST_RATE_LIMIT = '1';
    const next = vi.fn() as unknown as Mock;
    // Five spellings of the same mailbox share one bucket (unique email: the
    // in-memory store persists across tests in this file).
    await run(loginLimiter, limiterReq({ body: { email: 'Normalize@Example.COM' } }), next);
    await run(loginLimiter, limiterReq({ body: { email: '  normalize@example.com  ' } }), next);
    await run(loginLimiter, limiterReq({ body: { email: 'NORMALIZE@example.com' } }), next);
    await run(loginLimiter, limiterReq({ body: { email: ' normalize@example.com ' } }), next);
    await run(loginLimiter, limiterReq({ body: { email: 'normalize@EXAMPLE.com' } }), next);
    expect(next).toHaveBeenCalledTimes(5);

    const res = limiterRes();
    await loginLimiter(
      limiterReq({ body: { email: 'normalize@example.com' } }),
      res as unknown as Response,
      next as unknown as NextFunction,
    );
    expectLimited(next, res, '60', RATE_LIMITED_MESSAGE.login, 5);
  });

  it('shares one "unknown" bucket for requests without a body email at the same IP', async () => {
    process.env.VITEST_RATE_LIMIT = '1';
    const next = vi.fn() as unknown as Mock;
    for (let i = 0; i < 5; i += 1) {
      await run(loginLimiter, limiterReq({ body: {} }), next);
    }
    expect(next).toHaveBeenCalledTimes(5);

    const res = limiterRes();
    await loginLimiter(
      limiterReq({ body: {} }),
      res as unknown as Response,
      next as unknown as NextFunction,
    );
    expectLimited(next, res, '60', RATE_LIMITED_MESSAGE.login, 5);
  });
});

describe('generalLimiter', () => {
  it('allows 100 requests per user per minute and rate-limits the 101st with a 60s Retry-After', async () => {
    process.env.VITEST_RATE_LIMIT = '1';
    const next = vi.fn() as unknown as Mock;
    for (let i = 0; i < 100; i += 1) {
      await run(generalLimiter, limiterReq({ user: { id: 'u-flood' } }), next);
    }
    expect(next).toHaveBeenCalledTimes(100);

    const res = limiterRes();
    await generalLimiter(
      limiterReq({ user: { id: 'u-flood' } }),
      res as unknown as Response,
      next as unknown as NextFunction,
    );
    expectLimited(next, res, '60', RATE_LIMITED_MESSAGE.general, 100);
  });

  it('keys authenticated users by id, so an exhausted user does not affect another user or an anonymous IP', async () => {
    process.env.VITEST_RATE_LIMIT = '1';
    const next = vi.fn() as unknown as Mock;
    for (let i = 0; i < 100; i += 1) {
      await run(generalLimiter, limiterReq({ user: { id: 'u-crowded' } }), next);
    }
    expect(next).toHaveBeenCalledTimes(100);

    await run(generalLimiter, limiterReq({ user: { id: 'u-other' } }), next);
    expect(next).toHaveBeenCalledTimes(101);

    await run(generalLimiter, limiterReq({ user: undefined }), next);
    expect(next).toHaveBeenCalledTimes(102);
  });

  it('keys anonymous requests by IP', async () => {
    process.env.VITEST_RATE_LIMIT = '1';
    const next = vi.fn() as unknown as Mock;
    for (let i = 0; i < 100; i += 1) {
      await run(generalLimiter, limiterReq({ ip: '192.0.2.9', user: undefined }), next);
    }
    expect(next).toHaveBeenCalledTimes(100);

    const res = limiterRes();
    await generalLimiter(
      limiterReq({ ip: '192.0.2.9', user: undefined }),
      res as unknown as Response,
      next as unknown as NextFunction,
    );
    expectLimited(next, res, '60', RATE_LIMITED_MESSAGE.general, 100);

    await run(generalLimiter, limiterReq({ ip: '192.0.2.10', user: undefined }), next);
    expect(next).toHaveBeenCalledTimes(101);
  });
});

describe('resetRequestLimiter', () => {
  it('allows 3 requests per email per hour and rate-limits the 4th with a 3600s Retry-After', async () => {
    process.env.VITEST_RATE_LIMIT = '1';
    const limiter = resetRequestLimiter();
    const next = vi.fn() as unknown as Mock;
    for (let i = 0; i < 3; i += 1) {
      await run(limiter, limiterReq({ body: { email: 'reset@example.com' } }), next);
    }
    expect(next).toHaveBeenCalledTimes(3);

    const res = limiterRes();
    await limiter(
      limiterReq({ body: { email: 'reset@example.com' } }),
      res as unknown as Response,
      next as unknown as NextFunction,
    );
    expectLimited(next, res, '3600', RATE_LIMITED_MESSAGE.reset, 3);
  });

  it('normalizes the email (trim + lowercase) before keying', async () => {
    process.env.VITEST_RATE_LIMIT = '1';
    const limiter = resetRequestLimiter();
    const next = vi.fn() as unknown as Mock;
    // Three different spellings of the same mailbox all share one bucket...
    await run(limiter, limiterReq({ body: { email: 'Reset@Example.COM' } }), next);
    await run(limiter, limiterReq({ body: { email: '  reset@example.com  ' } }), next);
    await run(limiter, limiterReq({ body: { email: 'RESET@example.com' } }), next);
    expect(next).toHaveBeenCalledTimes(3);

    // ...so the 4th request for that mailbox is limited.
    const res = limiterRes();
    await limiter(
      limiterReq({ body: { email: 'reset@example.com' } }),
      res as unknown as Response,
      next as unknown as NextFunction,
    );
    expectLimited(next, res, '3600', RATE_LIMITED_MESSAGE.reset, 3);
  });

  it('keys different emails independently and falls back to "unknown" without an email', async () => {
    process.env.VITEST_RATE_LIMIT = '1';
    const limiter = resetRequestLimiter();
    const next = vi.fn() as unknown as Mock;
    for (let i = 0; i < 3; i += 1) {
      await run(limiter, limiterReq({ body: { email: 'first@example.com' } }), next);
    }
    expect(next).toHaveBeenCalledTimes(3);

    // A different mailbox on the same IP is not blocked by the first mailbox.
    await run(limiter, limiterReq({ body: { email: 'second@example.com' } }), next);
    expect(next).toHaveBeenCalledTimes(4);

    // Requests without a body email share the "unknown" bucket: 3 more allowed, then the 4th is limited.
    await run(limiter, limiterReq({ body: {} }), next);
    await run(limiter, limiterReq({ body: {} }), next);
    await run(limiter, limiterReq({ body: {} }), next);
    expect(next).toHaveBeenCalledTimes(7);

    const res = limiterRes();
    await limiter(
      limiterReq({ body: {} }),
      res as unknown as Response,
      next as unknown as NextFunction,
    );
    expectLimited(next, res, '3600', RATE_LIMITED_MESSAGE.reset, 7);
  });

  it('returns a fresh limiter instance on every factory call', () => {
    const a = resetRequestLimiter();
    const b = resetRequestLimiter();
    expect(a).not.toBe(b);
  });
});
