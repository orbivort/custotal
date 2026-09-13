// CSRF defence-in-depth: reject cross-origin state-changing requests.
//
// The session cookie is SameSite=Lax, which already blocks classic cross-site
// form POSTs. This middleware adds an explicit Origin/Referer check so the
// protection does not silently disappear if COOKIE_SAMESITE is ever loosened
// (e.g. to 'none' for a cross-origin deployment).
//
// A request is allowed when it carries no browser provenance (server-to-server,
// curl, the test harness — there is no Origin for an attacker to forge), or its
// Origin/Referer host matches the request Host (same-origin), or the Origin is
// on the explicit CORS allow-list.
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config.ts';
import { errors } from '../lib/errors.ts';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const FORBIDDEN_MESSAGE = 'Request origin is not allowed.';

function firstHeader(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** Browser provenance for the request: Origin when present, else Referer. */
function requestProvenance(req: Request): string | null {
  return firstHeader(req.headers.origin) ?? firstHeader(req.headers.referer);
}

function parseOrigin(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function csrfProtection(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }

  const provenance = requestProvenance(req);
  if (provenance === null) {
    next();
    return;
  }

  const url = parseOrigin(provenance);
  if (!url) {
    // Unparseable provenance (e.g. the literal "null" of a sandboxed iframe).
    next(errors.forbidden(FORBIDDEN_MESSAGE));
    return;
  }

  const host = firstHeader(req.headers.host);
  const sameHost = host !== null && url.host === host;
  if (sameHost || env.corsOrigins.includes(url.origin)) {
    next();
    return;
  }

  next(errors.forbidden(FORBIDDEN_MESSAGE));
}
