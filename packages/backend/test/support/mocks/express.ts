// Shared express test doubles for unit tests of middleware and handlers.
// Request/Response are hand-rolled minimal objects instead of a library mock so
// each test asserts on exactly what the middleware touches.
import type { NextFunction, Request } from 'express';
import { vi } from 'vitest';

/** NextFunction stand-in: the middleware under test never calls it here. */
export const noop = undefined as unknown as NextFunction;

/** Minimal mutable mock of the express Response object. */
export function mockRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    cookies: [] as { name: string; value: string; options?: unknown }[],
    clearedCookies: [] as { name: string; options?: unknown }[],
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
    cookie(name: string, value: string, options?: unknown) {
      res.cookies.push({ name, value, options });
      return res;
    },
    clearCookie(name: string, options?: unknown) {
      res.clearedCookies.push({ name, options });
      return res;
    },
  };
  return res;
}

/** Minimal mock of the express Request object. */
export function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    id: 'req-1',
    user: { id: 7 } as unknown as Request['user'],
    method: 'POST',
    originalUrl: '/api/things',
    log: { error: vi.fn(), warn: vi.fn() },
    ...overrides,
  } as unknown as Request;
}
