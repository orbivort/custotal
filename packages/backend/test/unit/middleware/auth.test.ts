// Unit tests for the session-authentication middleware (FR-CC-01, FR-CC-09).
// Pure unit tests: the Prisma client and env config are mocked at the module
// boundary, so no database is required. Covers cookie set/clear helpers, the
// session loader (fresh vs stale activity sliding, unknown tokens, failures),
// and the requireUser / requireCanEdit / requireAdmin / authedUser guards.
import type { NextFunction, Request, Response } from 'express';
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../../src/db.ts';
import {
  SESSION_COOKIE,
  authedUser,
  clearSessionCookie,
  requireAdmin,
  requireCanEdit,
  requireUser,
  sessionLoader,
  setSessionCookie,
} from '../../../src/middleware/auth.ts';
import { ApiError, errors } from '../../../src/lib/errors.ts';
import { hashToken } from '../../../src/lib/tokens.ts';
import { mockReq, mockRes } from '../../support/mocks/express.ts';
import type { Role, User } from '../../../src/types/domain.ts';

vi.mock('../../../src/db.ts', () => ({
  prisma: {
    session: { findFirst: vi.fn(), update: vi.fn() },
  },
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

const { findFirst, update } = prisma.session as unknown as { findFirst: Mock; update: Mock };

const NOW = new Date('2026-01-15T10:00:00.000Z');
const MS_PER_HOUR = 3_600_000;
const SESSION_TTL_MS = 8 * MS_PER_HOUR;

const TOKEN = 'opaque-session-token';
const userRow = { id: 'u1', name: 'Ada', email: 'ada@example.com', role: 'admin' as Role };
const expectedUser: User = { ...userRow, mustChangePassword: false };

/** Response double with the cookie methods the auth middleware touches. */
function resWithCookies(): Response & { cookie: Mock; clearCookie: Mock } {
  const res = mockRes() as unknown as Response & { cookie: Mock; clearCookie: Mock };
  res.cookie = vi.fn();
  res.clearCookie = vi.fn();
  return res;
}

function reqWithCookies(cookies?: Record<string, string>): Request {
  return mockReq({ user: undefined, cookies } as unknown as Partial<Request>);
}

/** Session row as Prisma would return it from findFirst with the user include. */
function sessionRow(lastActiveAt: Date) {
  return { id: 's1', tokenHash: hashToken(TOKEN), lastActiveAt, user: userRow };
}

const expectedCookieOptions = expect.objectContaining({
  httpOnly: true,
  secure: false,
  sameSite: 'lax',
  path: '/',
  maxAge: SESSION_TTL_MS,
});
const expectedClearOptions = expect.objectContaining({
  httpOnly: true,
  secure: false,
  sameSite: 'lax',
  path: '/',
});

beforeEach(() => {
  vi.clearAllMocks();
  // Deterministic clock so sliding-window and expiry math can be asserted exactly.
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('cookie helpers', () => {
  it('setSessionCookie sets the session cookie with the 8h sliding options', () => {
    const res = resWithCookies();
    setSessionCookie(res, TOKEN);
    expect(res.cookie).toHaveBeenCalledTimes(1);
    expect(res.cookie).toHaveBeenCalledWith(SESSION_COOKIE, TOKEN, expectedCookieOptions);
    expect(res.cookie.mock.calls[0][0]).toBe('ct_session');
  });

  it('clearSessionCookie clears the session cookie with matching attributes', () => {
    const res = resWithCookies();
    clearSessionCookie(res);
    expect(res.clearCookie).toHaveBeenCalledTimes(1);
    expect(res.clearCookie).toHaveBeenCalledWith(SESSION_COOKIE, expectedClearOptions);
  });
});

describe('sessionLoader', () => {
  it('passes through when no session cookie is present', async () => {
    const req = reqWithCookies();
    const res = resWithCookies();
    const next = vi.fn() as unknown as NextFunction;

    await sessionLoader(req, res, next);

    expect(findFirst).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
    expect(res.clearCookie).not.toHaveBeenCalled();
    expect(req.user).toBeUndefined();
    expect(req.sessionId).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it('populates req.user and req.sessionId for a valid session without touching it when activity is recent', async () => {
    findFirst.mockResolvedValue(sessionRow(new Date(NOW.getTime() - 30_000))); // 30s ago (< 60s touch interval)
    const req = reqWithCookies({ [SESSION_COOKIE]: TOKEN });
    const res = resWithCookies();
    const next = vi.fn() as unknown as NextFunction;

    await sessionLoader(req, res, next);

    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tokenHash: hashToken(TOKEN),
          expiresAt: { gt: NOW },
        },
      }),
    );
    expect(req.user).toEqual(expectedUser);
    expect(req.sessionId).toBe('s1');
    expect(update).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
    expect(res.clearCookie).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it('slides the idle window and refreshes the cookie when the session was last touched more than a minute ago', async () => {
    findFirst.mockResolvedValue(sessionRow(new Date(NOW.getTime() - 61_000))); // 61s ago (> touch interval)
    update.mockResolvedValue(undefined);
    const req = reqWithCookies({ [SESSION_COOKIE]: TOKEN });
    const res = resWithCookies();
    const next = vi.fn() as unknown as NextFunction;

    await sessionLoader(req, res, next);

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: {
        lastActiveAt: NOW,
        expiresAt: new Date(NOW.getTime() + SESSION_TTL_MS),
      },
    });
    expect(res.cookie).toHaveBeenCalledTimes(1);
    expect(res.cookie).toHaveBeenCalledWith(SESSION_COOKIE, TOKEN, expectedCookieOptions);
    expect(res.clearCookie).not.toHaveBeenCalled();
    expect(req.user).toEqual(expectedUser);
    expect(next).toHaveBeenCalledWith();
  });

  it('clears the stale cookie silently when the token is unknown or expired', async () => {
    findFirst.mockResolvedValue(null);
    const req = reqWithCookies({ [SESSION_COOKIE]: 'revoked-or-expired' });
    const res = resWithCookies();
    const next = vi.fn() as unknown as NextFunction;

    await sessionLoader(req, res, next);

    expect(req.user).toBeUndefined();
    expect(req.sessionId).toBeUndefined();
    expect(update).not.toHaveBeenCalled();
    expect(res.clearCookie).toHaveBeenCalledTimes(1);
    expect(res.clearCookie).toHaveBeenCalledWith(SESSION_COOKIE, expectedClearOptions);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it('ignores requests whose cookie jar lacks the session cookie entry', async () => {
    findFirst.mockResolvedValue(null);
    const req = reqWithCookies({ other: 'cookie' });
    const res = resWithCookies();
    const next = vi.fn() as unknown as NextFunction;

    await sessionLoader(req, res, next);

    expect(findFirst).not.toHaveBeenCalled();
    expect(res.clearCookie).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('forwards persistence failures to the error handler', async () => {
    const failure = new Error('database unavailable');
    findFirst.mockRejectedValue(failure);
    const req = reqWithCookies({ [SESSION_COOKIE]: TOKEN });
    const res = resWithCookies();
    const next = vi.fn() as unknown as NextFunction;

    await sessionLoader(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(failure);
    expect(req.user).toBeUndefined();
  });
});

describe('requireUser', () => {
  it('calls next() for an authenticated request', () => {
    const next = vi.fn() as unknown as NextFunction;
    const req = { user: expectedUser } as unknown as Request;
    requireUser(req, mockRes() as unknown as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects an anonymous request with 401 unauthorized', () => {
    const next = vi.fn() as unknown as NextFunction;
    requireUser({ user: undefined } as unknown as Request, mockRes() as unknown as Response, next);
    const error = (next as unknown as Mock).mock.calls[0][0] as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(401);
    expect(error.code).toBe('unauthorized');
  });
});

describe('requireCanEdit', () => {
  it.each(['admin', 'manager', 'rep'] as const)('allows %s to edit', (role) => {
    const next = vi.fn() as unknown as NextFunction;
    requireCanEdit(
      { user: { ...expectedUser, role: role as Role } } as unknown as Request,
      mockRes() as unknown as Response,
      next,
    );
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects readonly users with 403 forbidden', () => {
    const next = vi.fn() as unknown as NextFunction;
    requireCanEdit(
      { user: { ...expectedUser, role: 'readonly' } } as unknown as Request,
      mockRes() as unknown as Response,
      next,
    );
    const error = (next as unknown as Mock).mock.calls[0][0] as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(403);
    expect(error.code).toBe('forbidden');
  });

  it('rejects anonymous requests with 401 unauthorized', () => {
    const next = vi.fn() as unknown as NextFunction;
    requireCanEdit(
      { user: undefined } as unknown as Request,
      mockRes() as unknown as Response,
      next,
    );
    const error = (next as unknown as Mock).mock.calls[0][0] as ApiError;
    expect(error.status).toBe(401);
    expect(error.code).toBe('unauthorized');
  });
});

describe('requireAdmin', () => {
  it('calls next() for an admin', () => {
    const next = vi.fn() as unknown as NextFunction;
    requireAdmin(
      { user: expectedUser } as unknown as Request,
      mockRes() as unknown as Response,
      next,
    );
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects non-admin users with 403 forbidden and the admin-only message', () => {
    const next = vi.fn() as unknown as NextFunction;
    requireAdmin(
      { user: { ...expectedUser, role: 'manager' } } as unknown as Request,
      mockRes() as unknown as Response,
      next,
    );
    const error = (next as unknown as Mock).mock.calls[0][0] as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(403);
    expect(error.code).toBe('forbidden');
    expect(error.message).toBe('Administrator access required.');
  });

  it('rejects anonymous requests with 401 unauthorized', () => {
    const next = vi.fn() as unknown as NextFunction;
    requireAdmin({ user: undefined } as unknown as Request, mockRes() as unknown as Response, next);
    const error = (next as unknown as Mock).mock.calls[0][0] as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(401);
    expect(error.code).toBe('unauthorized');
  });
});

describe('authedUser', () => {
  it('returns the typed user when present', () => {
    const req = { user: expectedUser } as unknown as Request;
    expect(authedUser(req)).toEqual(expectedUser);
  });

  it('throws 401 unauthorized when no user is attached', () => {
    expect(() => authedUser({ user: undefined } as unknown as Request)).toThrow(ApiError);
    expect(() => authedUser({ user: undefined } as unknown as Request)).toThrowError(
      errors.unauthorized(),
    );
  });
});
