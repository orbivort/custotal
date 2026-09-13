// Unit tests for the shared HTTP client in `lib/api`.
//
// The transport is the unit under test, so `fetch` is replaced with a stub and
// the two collaborators it reaches out to — the parsed env config (base URL)
// and the session-events notifier (401 handling) — are mocked so their inputs
// and side effects can be asserted directly. `toQueryString` is a pure helper
// and is exercised as-is.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, toQueryString } from './api';

const h = vi.hoisted(() => ({
  // Mutable so each test can set the effective API origin. `withBaseUrl` reads
  // it at call time, so reassigning between tests is enough.
  env: { apiBaseUrl: '' as string },
  notifyUnauthorized: vi.fn(),
}));

vi.mock('../config/env', () => ({ env: h.env }));
vi.mock('./sessionEvents', () => ({ notifyUnauthorized: h.notifyUnauthorized }));

const fetchMock = vi.fn();

/** Minimal stand-in for a `Response`, exposing the `json` spy for assertions. */
function makeResponse(options: { status?: number; body?: unknown; jsonError?: boolean } = {}) {
  const status = options.status ?? 200;
  const json = options.jsonError
    ? vi.fn().mockRejectedValue(new Error('invalid json'))
    : vi.fn().mockResolvedValue(options.body);
  const res = {
    ok: status >= 200 && status < 300,
    status,
    json,
  } as unknown as Response;
  return { res, json };
}

/** The `(url, init)` pair passed to the most recent `fetch` call. */
function lastFetch(): [string, RequestInit] {
  return fetchMock.mock.calls.at(-1) as [string, RequestInit];
}

beforeEach(() => {
  h.env.apiBaseUrl = '';
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ApiError', () => {
  it('carries the code, message, and field-level details', () => {
    const err = new ApiError('validation_failed', 'Bad input', [
      { field: 'email', message: 'required' },
    ]);

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ApiError');
    expect(err.code).toBe('validation_failed');
    expect(err.message).toBe('Bad input');
    expect(err.details).toEqual([{ field: 'email', message: 'required' }]);
    // Transport-level errors have no status until one is attached.
    expect(err.status).toBeUndefined();
  });
});

describe('toQueryString', () => {
  it('serializes string, number, and boolean params', () => {
    expect(toQueryString({ scope: 'all', page: 2, archived: true })).toBe(
      '?scope=all&page=2&archived=true',
    );
  });

  it('skips undefined, null, and empty-string values', () => {
    expect(toQueryString({ a: undefined, b: null, c: '', d: 'keep' })).toBe('?d=keep');
  });

  it('returns an empty string when nothing survives filtering', () => {
    expect(toQueryString({ a: '' })).toBe('');
    expect(toQueryString({})).toBe('');
  });

  it('percent-encodes reserved characters', () => {
    expect(toQueryString({ owner: 'u&2 x' })).toBe('?owner=u%262+x');
  });
});

describe('api verbs', () => {
  it('get issues a GET and returns the decoded payload', async () => {
    const { res } = makeResponse({ body: { id: 'c1' } });
    fetchMock.mockResolvedValueOnce(res);

    const result = await api.get<{ id: string }>('/api/contacts/c1');

    const [url, init] = lastFetch();
    expect(url).toBe('/api/contacts/c1');
    expect(init.method).toBe('GET');
    expect(result).toEqual({ id: 'c1' });
  });

  it('post serializes the body and issues a POST', async () => {
    const { res } = makeResponse({ body: { id: 'c2' } });
    fetchMock.mockResolvedValueOnce(res);

    await api.post('/api/contacts', { name: 'Ada' });

    const [, init] = lastFetch();
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ name: 'Ada' }));
  });

  it('post omits the body when none is supplied', async () => {
    const { res } = makeResponse({ body: {} });
    fetchMock.mockResolvedValueOnce(res);

    await api.post('/api/contacts/c1/complete');

    const [, init] = lastFetch();
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
  });

  it('patch serializes the body and issues a PATCH', async () => {
    const { res } = makeResponse({ body: { id: 'c1' } });
    fetchMock.mockResolvedValueOnce(res);

    await api.patch('/api/contacts/c1', { title: 'Renamed' });

    const [, init] = lastFetch();
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe(JSON.stringify({ title: 'Renamed' }));
  });

  it('patch omits the body when none is supplied', async () => {
    const { res } = makeResponse({ body: {} });
    fetchMock.mockResolvedValueOnce(res);

    await api.patch('/api/contacts/c1');

    const [, init] = lastFetch();
    expect(init.method).toBe('PATCH');
    expect(init.body).toBeUndefined();
  });

  it('del issues a DELETE', async () => {
    const { res } = makeResponse({ body: { ok: true } });
    fetchMock.mockResolvedValueOnce(res);

    const result = await api.del<{ ok: boolean }>('/api/contacts/c1');

    const [, init] = lastFetch();
    expect(init.method).toBe('DELETE');
    expect(result).toEqual({ ok: true });
  });
});

describe('request wiring', () => {
  it('always sends cookies so the session flows cross-origin', async () => {
    const { res } = makeResponse({ body: {} });
    fetchMock.mockResolvedValueOnce(res);

    await api.get('/api/me');

    const [, init] = lastFetch();
    expect(init.credentials).toBe('include');
  });

  it('defaults Content-Type to application/json', async () => {
    const { res } = makeResponse({ body: {} });
    fetchMock.mockResolvedValueOnce(res);

    await api.get('/api/me');

    const [, init] = lastFetch();
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
  });

  it('preserves a caller-supplied Content-Type and extra headers', async () => {
    const { res } = makeResponse({ body: {} });
    fetchMock.mockResolvedValueOnce(res);

    await api.post('/api/import', 'raw', {
      headers: { 'Content-Type': 'text/csv', 'X-Trace': 'abc' },
    });

    const headers = new Headers(lastFetch()[1].headers);
    expect(headers.get('Content-Type')).toBe('text/csv');
    expect(headers.get('X-Trace')).toBe('abc');
  });

  it('prepends the configured API base URL', async () => {
    h.env.apiBaseUrl = 'https://api.example.com';
    const { res } = makeResponse({ body: {} });
    fetchMock.mockResolvedValueOnce(res);

    await api.get('/api/me');

    expect(lastFetch()[0]).toBe('https://api.example.com/api/me');
  });

  it('inserts a separator when the path lacks a leading slash', async () => {
    h.env.apiBaseUrl = 'https://api.example.com';
    const { res } = makeResponse({ body: {} });
    fetchMock.mockResolvedValueOnce(res);

    await api.get('api/me');

    expect(lastFetch()[0]).toBe('https://api.example.com/api/me');
  });

  it('leaves the path untouched when no base URL is configured', async () => {
    h.env.apiBaseUrl = '';
    const { res } = makeResponse({ body: {} });
    fetchMock.mockResolvedValueOnce(res);

    await api.get('/api/me');

    expect(lastFetch()[0]).toBe('/api/me');
  });

  it('resolves undefined for a 204 without parsing a body', async () => {
    const { res, json } = makeResponse({ status: 204 });
    fetchMock.mockResolvedValueOnce(res);

    await expect(api.del('/api/contacts/c1')).resolves.toBeUndefined();
    expect(json).not.toHaveBeenCalled();
  });
});

describe('request error handling', () => {
  it('maps a transport failure to an unreachable ApiError', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const err = await api.get('/api/me').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    const apiError = err as ApiError;
    expect(apiError.code).toBe('unreachable');
    expect(apiError.message).toBe(
      "Can't reach the server. Check that it's running and reachable from this browser.",
    );
    expect(apiError.status).toBeUndefined();
    expect(h.notifyUnauthorized).not.toHaveBeenCalled();
  });

  it('decodes the error envelope and copies the HTTP status', async () => {
    const { res } = makeResponse({
      status: 422,
      body: {
        error: {
          code: 'validation_failed',
          message: 'Bad input',
          details: [{ field: 'email', message: 'required' }],
        },
      },
    });
    fetchMock.mockResolvedValueOnce(res);

    const err = (await api.post('/api/contacts', {}).catch((e: unknown) => e)) as ApiError;

    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('validation_failed');
    expect(err.message).toBe('Bad input');
    expect(err.details).toEqual([{ field: 'email', message: 'required' }]);
    expect(err.status).toBe(422);
  });

  it('falls back to an unknown code and friendly status copy when the body has no envelope', async () => {
    const { res } = makeResponse({ status: 500, body: {} });
    fetchMock.mockResolvedValueOnce(res);

    const err = (await api.get('/api/me').catch((e: unknown) => e)) as ApiError;

    expect(err.code).toBe('unknown');
    expect(err.message).toBe('Something went wrong on our end. Please try again.');
    expect(err.status).toBe(500);
  });

  it('falls back when the error body is not valid JSON', async () => {
    const { res } = makeResponse({ status: 503, jsonError: true });
    fetchMock.mockResolvedValueOnce(res);

    const err = (await api.get('/api/me').catch((e: unknown) => e)) as ApiError;

    expect(err.code).toBe('unknown');
    expect(err.message).toBe(
      'The service is temporarily unavailable. Please try again in a moment.',
    );
    expect(err.status).toBe(503);
  });

  it('maps a bare 502 from a proxy to a friendly message instead of the raw code', async () => {
    const { res } = makeResponse({ status: 502, jsonError: true });
    fetchMock.mockResolvedValueOnce(res);

    const err = (await api.get('/api/me').catch((e: unknown) => e)) as ApiError;

    expect(err.code).toBe('unknown');
    expect(err.message).toBe(
      'The server is temporarily unavailable. Please try again in a moment.',
    );
    expect(err.message).not.toContain('502');
    expect(err.status).toBe(502);
  });

  it('uses a generic message for a status with no specific copy', async () => {
    const { res } = makeResponse({ status: 599, body: {} });
    fetchMock.mockResolvedValueOnce(res);

    const err = (await api.get('/api/me').catch((e: unknown) => e)) as ApiError;

    expect(err.message).toBe('Something went wrong. Please try again.');
    expect(err.status).toBe(599);
  });

  it('keeps the backend message even when the status has friendly copy', async () => {
    const { res } = makeResponse({
      status: 404,
      body: { error: { code: 'not_found', message: 'Contact not found.' } },
    });
    fetchMock.mockResolvedValueOnce(res);

    const err = (await api.get('/api/contacts/c1').catch((e: unknown) => e)) as ApiError;

    expect(err.message).toBe('Contact not found.');
  });

  it('notifies the session layer on a 401 that is not a failed login', async () => {
    const { res } = makeResponse({
      status: 401,
      body: { error: { code: 'session_expired', message: 'Session expired' } },
    });
    fetchMock.mockResolvedValueOnce(res);

    await expect(api.get('/api/me')).rejects.toBeInstanceOf(ApiError);
    expect(h.notifyUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('does not notify for a 401 caused by invalid login credentials', async () => {
    const { res } = makeResponse({
      status: 401,
      body: { error: { code: 'invalid_credentials', message: 'Wrong password' } },
    });
    fetchMock.mockResolvedValueOnce(res);

    await expect(api.post('/api/auth/login', {})).rejects.toBeInstanceOf(ApiError);
    expect(h.notifyUnauthorized).not.toHaveBeenCalled();
  });

  it('does not notify for non-401 failures', async () => {
    const { res } = makeResponse({
      status: 403,
      body: { error: { code: 'forbidden', message: 'Forbidden' } },
    });
    fetchMock.mockResolvedValueOnce(res);

    await expect(api.get('/api/admin/users')).rejects.toBeInstanceOf(ApiError);
    expect(h.notifyUnauthorized).not.toHaveBeenCalled();
  });
});
