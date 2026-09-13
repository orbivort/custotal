// Thin HTTP client for the Custotal API. Every network request in the app goes
// through this module so base-URL handling, cookie credentials, and error
// decoding stay consistent. Services in src/features/*/*Api.ts build on `api`
// and own the per-domain endpoint paths.
import type { ApiErrorBody } from '../types/domain';
import { env } from '../config/env';
import { describeHttpStatus } from './httpErrors';
import { notifyUnauthorized } from './sessionEvents';

export class ApiError extends Error {
  code: string;
  details?: { field: string; message: string }[];
  /** HTTP status from the response; undefined for transport-level failures. */
  status?: number;

  constructor(code: string, message: string, details?: { field: string; message: string }[]) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Message used when the network itself fails (no HTTP response was received).
 * The login page special-cases the 'unreachable' code to offer retry guidance.
 */
const UNREACHABLE_MESSAGE =
  "Can't reach the server. Check that it's running and reachable from this browser.";

/** Prepend the configured API base URL ('' => same origin) to a request path. */
function withBaseUrl(path: string): string {
  if (!env.apiBaseUrl) return path;
  const separator = path.startsWith('/') ? '' : '/';
  return `${env.apiBaseUrl}${separator}${path}`;
}

/**
 * Builds a query string from a params object, skipping nullish/empty values so
 * callers can pass filter state directly (e.g. { status: '' } => no param).
 */
export function toQueryString<P extends object>(params: P): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const serialized = search.toString();
  return serialized ? `?${serialized}` : '';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  let res: Response;
  try {
    res = await fetch(withBaseUrl(path), {
      ...init,
      // Always send cookies: harmless for same-origin requests and required for
      // cross-origin deployments using VITE_API_BASE_URL (the HttpOnly ct_session
      // cookie authenticates every API call).
      credentials: 'include',
      headers,
    });
  } catch {
    // fetch only rejects on transport failures (DNS, refused connection, CORS,
    // offline). HTTP error responses reach the branch below as normal responses.
    throw new ApiError('unreachable', UNREACHABLE_MESSAGE);
  }

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as ApiErrorBody | null;
    const err = payload?.error;
    const apiError = new ApiError(
      err?.code ?? 'unknown',
      // Prefer the backend's own message (already user-facing). Only when there
      // is no envelope — e.g. a proxy's bare 502 — fall back to readable copy
      // for the status instead of showing the raw code.
      err?.message ?? describeHttpStatus(res.status),
      err?.details,
    );
    apiError.status = res.status;
    // A 401 that is not a failed credential check means the session is gone
    // (expired or revoked): notify the session layer so the app redirects to
    // sign-in instead of stranding the user on an error banner. A failed login
    // keeps its own inline handling.
    if (res.status === 401 && apiError.code !== 'invalid_credentials') {
      notifyUnauthorized();
    }
    throw apiError;
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, opts?: RequestInit) => request<T>(path, { ...opts, method: 'GET' }),
  post: <T>(path: string, body?: unknown, opts?: RequestInit) =>
    request<T>(path, {
      ...opts,
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  patch: <T>(path: string, body?: unknown, opts?: RequestInit) =>
    request<T>(path, {
      ...opts,
      method: 'PATCH',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  del: <T>(path: string, opts?: RequestInit) => request<T>(path, { ...opts, method: 'DELETE' }),
};
