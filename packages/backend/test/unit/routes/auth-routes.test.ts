// Unit tests for the authentication routes (FR-CC-01, FR-CC-11).
// Pure unit tests: the auth service and the rate limiters are mocked at the
// module boundary and Prisma is stubbed. Covers body coercion, the requireUser
// gate on /me and /change-password, status codes, and error propagation.
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/db.ts', () => ({
  prisma: { session: { findFirst: vi.fn(), update: vi.fn() } },
}));

vi.mock('../../../src/config.ts', () => ({
  env: {
    nodeEnv: 'test',
    isProduction: false,
    sessionTtlHours: 8,
    cookieSecure: false,
    cookieSameSite: 'lax',
  },
}));

vi.mock('../../../src/services/auth-service.ts', () => ({
  login: vi.fn(),
  logout: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
  acceptInvite: vi.fn(),
  changePassword: vi.fn(),
}));

// Rate limiters are exercised in test/unit/middleware/rate-limit.test.ts; here
// they only need to be identifiable pass-throughs in the handler chain.
vi.mock('../../../src/middleware/rate-limit.ts', () => {
  const passThrough = (_req: unknown, _res: unknown, next: () => void) => next();
  const resetLimiter = vi.fn(passThrough);
  const tokenActionLimiter = vi.fn(passThrough);
  return {
    loginLimiter: vi.fn(passThrough),
    // Returns the same instance on every call so the test can compare identity.
    resetRequestLimiter: vi.fn(() => resetLimiter),
    tokenActionLimiter,
    generalLimiter: vi.fn(passThrough),
  };
});

import { env } from '../../../src/config.ts';
import * as authService from '../../../src/services/auth-service.ts';
import {
  loginLimiter,
  resetRequestLimiter,
  tokenActionLimiter,
} from '../../../src/middleware/rate-limit.ts';
import { requireUser, SESSION_COOKIE } from '../../../src/middleware/auth.ts';
import { authRouter } from '../../../src/routes/auth-routes.ts';
import { call, findRoute, routeHandler } from '../../support/mocks/router.ts';
import type { User } from '../../../src/types/domain.ts';

const service = authService as unknown as Record<keyof typeof authService, Mock>;
const envMock = env as unknown as { isProduction: boolean };

const user: User = { id: 'u1', name: 'Ada', email: 'ada@example.com', role: 'admin' };

beforeEach(() => {
  vi.clearAllMocks();
  envMock.isProduction = false;
  service.login.mockResolvedValue({ user, sessionToken: 'raw-session-token' });
  service.logout.mockResolvedValue(undefined);
  service.requestPasswordReset.mockResolvedValue(undefined);
  service.resetPassword.mockResolvedValue(undefined);
  service.changePassword.mockResolvedValue(undefined);
});

afterEach(() => {
  envMock.isProduction = false;
});

describe('POST /api/auth/login', () => {
  it('logs in with the submitted credentials, sets the session cookie and returns the user', async () => {
    const { res, done } = call(authRouter, 'post', '/login', {
      body: { email: 'ada@example.com', password: 'secret1' },
    });
    await done;

    expect(service.login).toHaveBeenCalledTimes(1);
    expect(service.login).toHaveBeenCalledWith('ada@example.com', 'secret1');
    expect(res.body).toEqual({ user });
    // The route — not the service — owns the cookie: it receives the raw
    // session token returned by the service.
    expect(res.cookies).toEqual([
      { name: SESSION_COOKIE, value: 'raw-session-token', options: expect.anything() },
    ]);
  });

  it('coerces a missing body to empty credentials', async () => {
    const { done } = call(authRouter, 'post', '/login');
    await done;

    expect(service.login).toHaveBeenCalledWith('', '');
  });

  it('sits behind the login rate limiter', () => {
    expect(findRoute(authRouter, 'post', '/login').handlers[0]).toBe(loginLimiter);
  });

  it('propagates invalid-credential failures to the error handler', async () => {
    const failure = new Error('Invalid email or password.');
    service.login.mockRejectedValue(failure);
    const { res, done } = call(authRouter, 'post', '/login', {
      body: { email: 'a@b.c', password: 'x' },
    });

    await expect(done).rejects.toBe(failure);
    expect(res.body).toBeUndefined();
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the session cookie, revokes the session and acknowledges', async () => {
    const { res, done } = call(authRouter, 'post', '/logout', { sessionId: 'sess-1' });
    await done;

    expect(res.clearedCookies).toEqual([{ name: SESSION_COOKIE, options: expect.anything() }]);
    expect(service.logout).toHaveBeenCalledWith('sess-1');
    expect(res.body).toEqual({ ok: true });
  });

  it('still succeeds for an anonymous request with no session', async () => {
    const { done } = call(authRouter, 'post', '/logout', { user: null });
    await done;

    expect(service.logout).toHaveBeenCalledWith(undefined);
  });
});

describe('GET /api/auth/me', () => {
  it('returns the authenticated user', async () => {
    const { res, done } = call(authRouter, 'get', '/me', { user });
    await done;

    expect(res.body).toEqual({ user });
  });

  it('is guarded by requireUser', () => {
    expect(findRoute(authRouter, 'get', '/me').handlers[0]).toBe(requireUser);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const { res, done } = call(authRouter, 'get', '/me', { user: null });
    const error = (await done.then(
      () => undefined,
      (reason: unknown) => reason,
    )) as { status: number; code: string };

    expect(error.status).toBe(401);
    expect(error.code).toBe('unauthorized');
    expect(res.body).toBeUndefined();
  });
});

describe('POST /api/auth/password-reset/request', () => {
  it('requests a reset for the submitted email and answers 202 to avoid enumeration', async () => {
    const { res, done } = call(authRouter, 'post', '/password-reset/request', {
      body: { email: 'ada@example.com' },
    });
    await done;

    expect(service.requestPasswordReset).toHaveBeenCalledWith('ada@example.com');
    expect(res.statusCode).toBe(202);
    expect(res.body).toEqual({ ok: true });
  });

  it('coerces a missing or non-string email to an empty string', async () => {
    await call(authRouter, 'post', '/password-reset/request').done;
    expect(service.requestPasswordReset).toHaveBeenLastCalledWith('');

    await call(authRouter, 'post', '/password-reset/request', { body: { email: 42 } }).done;
    expect(service.requestPasswordReset).toHaveBeenLastCalledWith('');
  });

  it('is rate limited per email', () => {
    const chain = findRoute(authRouter, 'post', '/password-reset/request');
    expect(chain.handlers[0]).toBe(resetRequestLimiter());
  });

  it('propagates service failures', async () => {
    const failure = new Error('mail transport down');
    service.requestPasswordReset.mockRejectedValue(failure);
    const { done } = call(authRouter, 'post', '/password-reset/request', {
      body: { email: 'a@b.c' },
    });

    await expect(done).rejects.toBe(failure);
  });
});

describe('POST /api/auth/password-reset/confirm', () => {
  it('resets the password with the token from the body', async () => {
    const { res, done } = call(authRouter, 'post', '/password-reset/confirm', {
      body: { token: 'tok-1', password: 'newpass1' },
    });
    await done;

    expect(service.resetPassword).toHaveBeenCalledWith('tok-1', 'newpass1');
    expect(res.body).toEqual({ ok: true });
  });

  it('coerces a missing body to empty values', async () => {
    const { done } = call(authRouter, 'post', '/password-reset/confirm');
    await done;

    expect(service.resetPassword).toHaveBeenCalledWith('', '');
  });
});

describe('POST /api/auth/invite/accept', () => {
  it('accepts the invitation with the token and password from the body', async () => {
    const { res, done } = call(authRouter, 'post', '/invite/accept', {
      body: { token: 'inv-1', password: 'firstpass1' },
    });
    await done;

    expect(service.acceptInvite).toHaveBeenCalledWith('inv-1', 'firstpass1');
    expect(res.body).toEqual({ ok: true });
  });

  it('coerces a missing body to empty values', async () => {
    const { done } = call(authRouter, 'post', '/invite/accept');
    await done;

    expect(service.acceptInvite).toHaveBeenCalledWith('', '');
  });

  it('is rate limited like the other one-time token actions', () => {
    expect(findRoute(authRouter, 'post', '/invite/accept').handlers[0]).toBe(tokenActionLimiter);
  });

  it('propagates invalid-token failures', async () => {
    const failure = new Error('invalid or expired');
    service.acceptInvite.mockRejectedValue(failure);
    const { done } = call(authRouter, 'post', '/invite/accept', {
      body: { token: 'bad', password: 'x' },
    });

    await expect(done).rejects.toBe(failure);
  });
});

describe('POST /api/auth/change-password', () => {
  it('changes the password for the authenticated user', async () => {
    const { res, done } = call(authRouter, 'post', '/change-password', {
      user,
      body: { currentPassword: 'old1', newPassword: 'newpass1' },
    });
    await done;

    expect(service.changePassword).toHaveBeenCalledWith(user, 'old1', 'newpass1');
    expect(res.body).toEqual({ ok: true });
  });

  it('coerces a missing body to empty passwords', async () => {
    const { done } = call(authRouter, 'post', '/change-password', { user });
    await done;

    expect(service.changePassword).toHaveBeenCalledWith(user, '', '');
  });

  it('is guarded by requireUser', () => {
    expect(findRoute(authRouter, 'post', '/change-password').handlers[0]).toBe(requireUser);
  });

  it('rejects an unauthenticated request with 401 before calling the service', async () => {
    const { done } = call(authRouter, 'post', '/change-password', { user: null });

    await expect(done).rejects.toMatchObject({ status: 401, code: 'unauthorized' });
    expect(service.changePassword).not.toHaveBeenCalled();
  });
});

describe('route registration', () => {
  it('registers the documented auth endpoints', () => {
    const expected: [string, string][] = [
      ['post', '/login'],
      ['post', '/logout'],
      ['get', '/me'],
      ['post', '/password-reset/request'],
      ['post', '/password-reset/confirm'],
      ['post', '/invite/accept'],
      ['post', '/change-password'],
    ];
    for (const [method, path] of expected) {
      expect(typeof routeHandler(authRouter, method, path)).toBe('function');
    }
  });
});
