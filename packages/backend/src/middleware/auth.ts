// DB-backed session authentication. The client holds an opaque random token in an
// HttpOnly cookie; only its SHA-256 digest is stored. Sessions slide on activity and
// expire after an idle window (FR-CC-01 8h, FR-CC-09 server-side invalidation).
import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db.ts';
import { env } from '../config.ts';
import { errors } from '../lib/errors.ts';
import { canEditRole } from '../lib/rbac.ts';
import { hashToken } from '../lib/tokens.ts';
import { toUser } from '../serializers.ts';
import type { User } from '../types/domain.ts';

export const SESSION_COOKIE = 'ct_session';

const MS_PER_HOUR = 3_600_000;
const TOUCH_INTERVAL_MS = 60_000;

function cookieOptions(): Record<string, unknown> {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSameSite,
    path: '/',
    maxAge: env.sessionTtlHours * MS_PER_HOUR,
  };
}

/** Set or refresh the session cookie on the response. */
export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, cookieOptions());
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSameSite,
    path: '/',
  });
}

/**
 * Optional authentication: populates req.user/req.sessionId when a valid session
 * cookie is present. Routes requiring a user call requireUser afterwards.
 */
export async function sessionLoader(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
    if (token) {
      const now = Date.now();
      const session = await prisma.session.findFirst({
        where: {
          tokenHash: hashToken(token),
          expiresAt: { gt: new Date(now) },
        },
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
      });
      if (session) {
        req.user = toUser(session.user);
        req.sessionId = session.id;
        // Slide the idle window (throttled) so 8h is measured from the last activity.
        if (now - session.lastActiveAt.getTime() > TOUCH_INTERVAL_MS) {
          await prisma.session.update({
            where: { id: session.id },
            data: {
              lastActiveAt: new Date(now),
              expiresAt: new Date(now + env.sessionTtlHours * MS_PER_HOUR),
            },
          });
          setSessionCookie(res, token);
        }
      } else {
        // Expired or unknown token: remove the stale cookie silently.
        clearSessionCookie(res);
      }
    }
    next();
  } catch (error) {
    next(error);
  }
}

export function requireUser(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) next(errors.unauthorized());
  else next();
}

/** Any authenticated non-readonly user may write (admin/manager/rep). */
export function requireCanEdit(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(errors.unauthorized());
    return;
  }
  if (!canEditRole(req.user.role)) next(errors.forbidden());
  else next();
}

/**
 * Admin-only gate. Anonymous callers get 401 so the client can re-authenticate;
 * signed-in non-admins get 403 "Administrator access required." (FR-CC-02/CC-10).
 */
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(errors.unauthorized());
    return;
  }
  if (req.user.role !== 'admin') next(errors.adminOnly());
  else next();
}

/** Extract the typed authenticated user or throw. */
export function authedUser(req: Request): User {
  if (!req.user) throw errors.unauthorized();
  return req.user;
}
