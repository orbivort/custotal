// Unit tests for the correlation-id middleware. Pure unit tests with no mocks:
// covers reuse of a client-provided X-Request-Id, UUID generation when absent,
// echoing the id on the response header, and per-request uniqueness.
import type { NextFunction, Request, Response } from 'express';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { REQUEST_ID_HEADER, requestId } from '../../../src/middleware/request-id.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Minimal local res double (the shared mockRes has no setHeader). */
function resWithHeaderSpy(): Response & { setHeader: Mock } {
  const res = {
    statusCode: 0,
    setHeader: vi.fn(),
  };
  return res as unknown as Response & { setHeader: Mock };
}

function reqWithHeaders(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

let next: NextFunction & Mock;

beforeEach(() => {
  next = vi.fn() as unknown as NextFunction & Mock;
});

describe('requestId', () => {
  it('reuses a client-provided X-Request-Id', () => {
    const res = resWithHeaderSpy();
    const req = reqWithHeaders({ 'x-request-id': 'correlation-abc' });

    requestId(req, res, next);

    expect(req.id).toBe('correlation-abc');
    expect(res.setHeader).toHaveBeenCalledTimes(1);
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, 'correlation-abc');
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it('generates a UUID when the header is absent', () => {
    const res = resWithHeaderSpy();
    const req = reqWithHeaders();

    requestId(req, res, next);

    expect(typeof req.id).toBe('string');
    expect(req.id).toMatch(UUID_PATTERN);
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, req.id);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('treats an empty header value as absent and generates a UUID', () => {
    const res = resWithHeaderSpy();
    const req = reqWithHeaders({ 'x-request-id': '' });

    requestId(req, res, next);

    expect(req.id).toMatch(UUID_PATTERN);
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, req.id);
  });

  it('rejects a header with invalid characters and generates a UUID instead', () => {
    const res = resWithHeaderSpy();
    const req = reqWithHeaders({ 'x-request-id': 'bad id with spaces/newline\n' });

    requestId(req, res, next);

    expect(req.id).toMatch(UUID_PATTERN);
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, req.id);
  });

  it('rejects a header longer than 64 characters and generates a UUID instead', () => {
    const res = resWithHeaderSpy();
    const req = reqWithHeaders({ 'x-request-id': 'a'.repeat(65) });

    requestId(req, res, next);

    expect(req.id).toMatch(UUID_PATTERN);
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, req.id);
  });

  it('accepts the maximum 64-character client id unchanged', () => {
    const res = resWithHeaderSpy();
    const id = 'a'.repeat(64);
    const req = reqWithHeaders({ 'x-request-id': id });

    requestId(req, res, next);

    expect(req.id).toBe(id);
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, id);
  });

  it('generates a distinct id for every request without a header', () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const req = reqWithHeaders();
      requestId(req, resWithHeaderSpy(), next);
      ids.push(req.id as string);
    }
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) {
      expect(id).toMatch(UUID_PATTERN);
    }
  });

  it('exposes the header name as X-Request-Id', () => {
    expect(REQUEST_ID_HEADER).toBe('X-Request-Id');
  });
});
