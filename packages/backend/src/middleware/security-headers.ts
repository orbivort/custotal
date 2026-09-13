// Baseline security headers on every response. The API sets authentication
// cookies, so `X-Content-Type-Options: nosniff` is applied unconditionally
// and HSTS is enabled whenever secure cookies are on (the production default).
// Intentionally dependency-free: an API that serves no HTML needs no full
// Helmet default set.
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config.ts';

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  if (env.cookieSecure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}
