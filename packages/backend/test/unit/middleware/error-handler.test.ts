// Unit tests for the central error handling middleware (FR-CC-10).
// These tests are pure unit tests: req/res are mocked objects (shared doubles
// from test/support/mocks/), no database or HTTP server is required. They
// verify error translation (ApiError, body-parse, payload-too-large, Prisma
// codes), the response envelope, and the request-log branch selection.
import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../../src/config.ts';
import { logger } from '../../../src/logger.ts';
import { ApiError, errors, type FieldError } from '../../../src/lib/errors.ts';
import { errorHandler, notFoundHandler } from '../../../src/middleware/error-handler.ts';
import { mockReq, mockRes, noop } from '../../support/mocks/express.ts';
import { prismaKnownError } from '../../support/mocks/prisma.ts';

const details: FieldError[] = [{ field: 'email', message: 'Invalid email format.' }];

describe('notFoundHandler', () => {
  it('responds with the standard 404 envelope', () => {
    const res = mockRes();
    notFoundHandler({} as Request, res as unknown as Response);
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: { code: 'not_found', message: 'Route not found.' } });
  });
});

describe('errorHandler — ApiError passthrough', () => {
  it('reuses the thrown ApiError status, code and message', () => {
    const res = mockRes();
    errorHandler(errors.forbidden(), mockReq(), res as unknown as Response, noop);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({
      error: { code: 'forbidden', message: 'You do not have permission to perform this action.' },
    });
  });

  it('includes details on the envelope when present', () => {
    const res = mockRes();
    errorHandler(errors.validation(details), mockReq(), res as unknown as Response, noop);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: {
        code: 'validation',
        message: 'Please correct the highlighted fields.',
        details,
      },
    });
  });

  it('omits details when the ApiError has none', () => {
    const res = mockRes();
    errorHandler(errors.notFound(), mockReq(), res as unknown as Response, noop);
    expect(res.statusCode).toBe(404);
    expect((res.body as { error: { details?: unknown } }).error).not.toHaveProperty('details');
  });

  it('omits details when the details array is empty', () => {
    const res = mockRes();
    errorHandler(
      new ApiError(400, 'validation', 'msg', []),
      mockReq(),
      res as unknown as Response,
      noop,
    );
    expect((res.body as { error: { details?: unknown } }).error).not.toHaveProperty('details');
  });
});

describe('errorHandler — transport-level errors', () => {
  it('translates a JSON body-parse SyntaxError to 400 bad_json', () => {
    const res = mockRes();
    const err = Object.assign(new SyntaxError('Unexpected token'), {
      status: 400,
      type: 'entity.parse.failed',
    });
    errorHandler(err, mockReq(), res as unknown as Response, noop);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: { code: 'bad_json', message: 'Request body is not valid JSON.' },
    });
  });

  it('treats a plain SyntaxError (no body-parser type) as internal', () => {
    const res = mockRes();
    errorHandler(new SyntaxError('Unexpected token'), mockReq(), res as unknown as Response, noop);
    expect(res.statusCode).toBe(500);
    expect((res.body as { error: { code: string } }).error.code).toBe('internal');
  });

  it('treats a body-parse error with non-400 status as internal', () => {
    const res = mockRes();
    const err = Object.assign(new SyntaxError('Unexpected token'), {
      status: 499,
      type: 'entity.parse.failed',
    });
    errorHandler(err, mockReq(), res as unknown as Response, noop);
    expect(res.statusCode).toBe(500);
    expect((res.body as { error: { code: string } }).error.code).toBe('internal');
  });

  it('translates entity.too.large to 400 payload_too_large', () => {
    const res = mockRes();
    const err = Object.assign(new Error('request entity too large'), {
      type: 'entity.too.large',
      status: 413,
    });
    errorHandler(err, mockReq(), res as unknown as Response, noop);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: { code: 'payload_too_large', message: 'Request body is too large.' },
    });
  });
});

describe('errorHandler — Prisma error translation', () => {
  it.each([
    ['P2002', 409, 'conflict'],
    ['P2025', 404, 'not_found'],
    ['P2003', 409, 'in_use'],
  ] as const)('maps %s to %s %s', (code, status, expectedCode) => {
    const res = mockRes();
    errorHandler(prismaKnownError(code), mockReq(), res as unknown as Response, noop);
    expect(res.statusCode).toBe(status);
    expect((res.body as { error: { code: string } }).error.code).toBe(expectedCode);
  });

  it('maps unhandled Prisma codes to 500 internal', () => {
    const res = mockRes();
    errorHandler(prismaKnownError('P9999'), mockReq(), res as unknown as Response, noop);
    expect(res.statusCode).toBe(500);
    expect((res.body as { error: { code: string } }).error.code).toBe('internal');
  });
});

describe('errorHandler — unknown errors', () => {
  it('turns any unknown error into a 500 internal envelope without leaking internals', () => {
    const res = mockRes();
    errorHandler(new Error('db password is hunter2'), mockReq(), res as unknown as Response, noop);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'internal', message: 'An unexpected error occurred.' },
    });
  });

  it('handles null and primitive thrown values as internal errors', () => {
    for (const value of [null, undefined, 'boom', 42]) {
      const res = mockRes();
      errorHandler(value, mockReq(), res as unknown as Response, noop);
      expect(res.statusCode).toBe(500);
      expect((res.body as { error: { code: string } }).error.code).toBe('internal');
    }
  });
});

describe('errorHandler — request logging', () => {
  it('logs a warn (not error) with the code for 4xx via the request log', () => {
    const req = mockReq();
    const res = mockRes();
    errorHandler(errors.badRequest('bad_json', 'nope'), req, res as unknown as Response, noop);
    const log = req.log as unknown as {
      warn: ReturnType<typeof vi.fn>;
      error: ReturnType<typeof vi.fn>;
    };
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.error).not.toHaveBeenCalled();
    const [meta, msg] = log.warn.mock.calls[0];
    expect(meta).toEqual({
      err: undefined,
      requestId: 'req-1',
      userId: 7,
      action: 'POST /api/things',
      code: 'bad_json',
    });
    expect(msg).toBe('request rejected');
  });

  it('logs an error with the raw error for 5xx via the request log', () => {
    const req = mockReq();
    const res = mockRes();
    const raw = new Error('boom');
    errorHandler(raw, req, res as unknown as Response, noop);
    const log = req.log as unknown as {
      error: ReturnType<typeof vi.fn>;
      warn: ReturnType<typeof vi.fn>;
    };
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.warn).not.toHaveBeenCalled();
    const [meta, msg] = log.error.mock.calls[0];
    expect(meta).toMatchObject({
      err: raw,
      requestId: 'req-1',
      userId: 7,
      action: 'POST /api/things',
    });
    expect(msg).toBe('request failed');
  });

  it('falls back to the global logger when the request has no log', () => {
    const errorSpy = vi.spyOn(logger, 'error');
    const warnSpy = vi.spyOn(logger, 'warn');
    try {
      const res = mockRes();
      const req = mockReq({ log: undefined });
      errorHandler(new Error('boom'), req, res as unknown as Response, noop);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy.mock.calls[0][1]).toBe('request failed');

      const res2 = mockRes();
      errorHandler(
        errors.rateLimited('slow down'),
        mockReq({ log: undefined }),
        res2 as unknown as Response,
        noop,
      );
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][1]).toBe('request rejected');
    } finally {
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it('logs warn for a 4xx on the global logger with the code in meta', () => {
    const warnSpy = vi.spyOn(logger, 'warn');
    try {
      const res = mockRes();
      errorHandler(
        errors.notFound(),
        mockReq({ log: undefined }),
        res as unknown as Response,
        noop,
      );
      const [meta, msg] = warnSpy.mock.calls[0];
      expect(meta).toMatchObject({ requestId: 'req-1', code: 'not_found', err: undefined });
      expect(msg).toBe('request rejected');
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe('errorHandler — envelope safety', () => {
  it('never exposes raw error messages in the response, even in production', () => {
    const res = mockRes();
    errorHandler(new Error('secret internal detail'), mockReq(), res as unknown as Response, noop);
    expect(JSON.stringify(res.body)).not.toContain('secret internal detail');
  });

  it('emits the envelope shape { error: { code, message } } for every branch', () => {
    const cases: unknown[] = [
      errors.unauthorized(),
      Object.assign(new SyntaxError('x'), { status: 400, type: 'entity.parse.failed' }),
      Object.assign(new Error('x'), { type: 'entity.too.large' }),
      prismaKnownError('P2002'),
      new Error('x'),
    ];
    for (const err of cases) {
      const res = mockRes();
      errorHandler(err, mockReq(), res as unknown as Response, noop);
      const body = res.body as { error: { code: string; message: string } };
      expect(typeof body.error.code).toBe('string');
      expect(typeof body.error.message).toBe('string');
      expect(body.error.code.length).toBeGreaterThan(0);
    }
  });

  it('works when env.isProduction is true (production guard executes without effect)', () => {
    const res = mockRes();
    const isProduction = env.isProduction;
    // The handler reads env at call time via the module export; restore after.
    try {
      Object.defineProperty(env, 'isProduction', { value: true, configurable: true });
      errorHandler(new Error('boom'), mockReq(), res as unknown as Response, noop);
    } finally {
      Object.defineProperty(env, 'isProduction', { value: isProduction, configurable: true });
    }
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'internal', message: 'An unexpected error occurred.' },
    });
  });
});

describe('errorHandler — request context edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tolerates a request without user or id', () => {
    const warnSpy = vi.spyOn(logger, 'warn');
    try {
      const req = { method: 'GET', originalUrl: '/api/x' } as unknown as Request;
      const res = mockRes();
      errorHandler(errors.notFound(), req, res as unknown as Response, noop);
      const [meta] = warnSpy.mock.calls[0];
      expect(meta).toMatchObject({ requestId: undefined, userId: undefined, action: 'GET /api/x' });
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('uses the original URL (including query string) in the action meta', () => {
    const warnSpy = vi.spyOn(logger, 'warn');
    try {
      const req = mockReq({
        log: undefined,
        method: 'GET',
        originalUrl: '/api/things?page=2&sort=name',
      });
      const res = mockRes();
      errorHandler(errors.notFound(), req, res as unknown as Response, noop);
      const [meta] = warnSpy.mock.calls[0];
      expect((meta as unknown as { action: string }).action).toBe(
        'GET /api/things?page=2&sort=name',
      );
    } finally {
      warnSpy.mockRestore();
    }
  });
});
