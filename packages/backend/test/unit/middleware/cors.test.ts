// Unit tests for the allow-list CORS middleware. Pure unit tests: the allowed
// origins are mocked at the config module boundary. Covers the allowed-origin
// header set, the OPTIONS preflight short-circuit, and the pass-through for
// disallowed or absent origins.
import type { NextFunction, Request, Response } from 'express';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { corsAllowList } from '../../../src/middleware/cors.ts';

vi.mock('../../../src/config.ts', () => ({
  env: {
    corsOrigins: ['https://app.example.com', 'https://admin.example.com'],
  },
}));

const ALLOWED_ORIGIN = 'https://app.example.com';

/** Response double that records headers and sendStatus calls. */
function resWithHeaders(): Response & { headerMap: Map<string, string>; sendStatus: Mock } {
  const headerMap = new Map<string, string>();
  const res = {
    headerMap,
    statusCode: 0,
    setHeader(name: string, value: string) {
      headerMap.set(name, value);
    },
    sendStatus(code: number) {
      res.statusCode = code;
      return res;
    },
  };
  return res as unknown as Response & { headerMap: Map<string, string>; sendStatus: Mock };
}

function reqWith(origin?: string, method = 'GET'): Request {
  return { headers: origin === undefined ? {} : { origin }, method } as unknown as Request;
}

function assertAllowedHeaders(headerMap: Map<string, string>, origin: string): void {
  expect(headerMap.get('Access-Control-Allow-Origin')).toBe(origin);
  expect(headerMap.get('Vary')).toBe('Origin');
  expect(headerMap.get('Access-Control-Allow-Credentials')).toBe('true');
  expect(headerMap.get('Access-Control-Allow-Methods')).toBe('GET,POST,PATCH,DELETE,OPTIONS');
  expect(headerMap.get('Access-Control-Allow-Headers')).toBe('Content-Type');
}

let next: NextFunction & Mock;

beforeEach(() => {
  next = vi.fn() as unknown as NextFunction & Mock;
});

describe('corsAllowList — allowed origins', () => {
  it('sets the full CORS header set for a listed origin and continues the chain', () => {
    const res = resWithHeaders();
    corsAllowList(reqWith(ALLOWED_ORIGIN), res, next);
    assertAllowedHeaders(res.headerMap, ALLOWED_ORIGIN);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('works for every origin on the allow list', () => {
    const secondOrigin = 'https://admin.example.com';
    const res = resWithHeaders();
    corsAllowList(reqWith(secondOrigin), res, next);
    assertAllowedHeaders(res.headerMap, secondOrigin);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('short-circuits OPTIONS preflight requests with 204 without calling next', () => {
    const res = resWithHeaders();
    corsAllowList(reqWith(ALLOWED_ORIGIN, 'OPTIONS'), res, next);
    assertAllowedHeaders(res.headerMap, ALLOWED_ORIGIN);
    expect(res.statusCode).toBe(204);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('corsAllowList — non-allowed origins', () => {
  it('sets no CORS headers for an unlisted origin and continues the chain', () => {
    const res = resWithHeaders();
    corsAllowList(reqWith('https://evil.example.org'), res, next);
    expect(res.headerMap.size).toBe(0);
    expect(res.statusCode).toBe(0);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('passes through requests without an Origin header (same-origin)', () => {
    const res = resWithHeaders();
    corsAllowList(reqWith(), res, next);
    expect(res.headerMap.size).toBe(0);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('passes through OPTIONS requests from unlisted origins without a 204', () => {
    const res = resWithHeaders();
    corsAllowList(reqWith('https://evil.example.org', 'OPTIONS'), res, next);
    expect(res.headerMap.size).toBe(0);
    expect(res.statusCode).toBe(0);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
