// Rate limiting (FR-CC-11). In-memory stores — correct for the single-instance MVP.
// Login: 5/min per email+IP. Reset request: 3/h/email. General API: 100/min/user (or IP).
// express-rate-limit v8 requires the ipKeyGenerator helper when keying on the IP.
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config.ts';

function envelopeHandler(message: string) {
  return (
    _req: Request,
    res: Response,
    _next: NextFunction,
    options: { statusCode: number; windowMs: number },
  ): void => {
    res
      .status(options.statusCode)
      .setHeader('Retry-After', String(Math.ceil(options.windowMs / 1000)))
      .json({
        error: { code: 'rate_limited', message },
      });
  };
}

/**
 * Rate limiting is disabled under `NODE_ENV=test` except when a specific test
 * opts in by setting VITEST_RATE_LIMIT=1 (checked lazily per request).
 */
function skipInTests(): boolean {
  return env.nodeEnv === 'test' && process.env.VITEST_RATE_LIMIT !== '1';
}

/** Keyed per email+IP so brute force is capped per account, not just per address. */
export const loginLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: skipInTests,
  keyGenerator: (req) => {
    const ip = ipKeyGenerator(req.ip ?? '');
    const email = ((req.body as { email?: string } | undefined)?.email ?? 'unknown')
      .trim()
      .toLowerCase();
    return `${email}@${ip}`;
  },
  message: 'Too many login attempts. Try again in a minute.',
  handler: envelopeHandler('Too many login attempts. Try again in a minute.'),
});

/** Keyed per email so a single attacker can't lock an IP but a mailbox is capped. */
export function resetRequestLimiter(): ReturnType<typeof rateLimit> {
  return rateLimit({
    windowMs: 3_600_000,
    limit: 3,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: skipInTests,
    keyGenerator: (req) => {
      const ip = ipKeyGenerator(req.ip ?? '');
      const email = ((req.body as { email?: string } | undefined)?.email ?? 'unknown')
        .trim()
        .toLowerCase();
      return `${email}@${ip}`;
    },
    message: 'Too many password reset requests. Try again later.',
    handler: envelopeHandler('Too many password reset requests. Try again later.'),
  });
}

/** One-time token actions (invite acceptance, reset confirmation): 10/15min/IP. */
export const tokenActionLimiter: ReturnType<typeof rateLimit> = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: skipInTests,
  message: 'Too many attempts. Try again later.',
  handler: envelopeHandler('Too many attempts. Try again later.'),
});

export const generalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 100,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => {
    const ip = ipKeyGenerator(req.ip ?? '');
    // Authenticated users are keyed by user id; anonymous by IP.
    return req.user?.id ?? ip;
  },
  skip: skipInTests,
  message: 'Too many requests. Slow down.',
  handler: envelopeHandler('Too many requests. Slow down.'),
});
