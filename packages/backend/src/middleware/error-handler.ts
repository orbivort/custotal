// Central error handling (FR-CC-10): every failure becomes the standard envelope
// { error: { code, message, details? } }. Prisma errors are translated to domain
// errors; anything unknown becomes a logged 500 without leaking internals.
import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '../generated/prisma/client.ts';
import { logger } from '../logger.ts';
import { ApiError, errors, type FieldError } from '../lib/errors.ts';

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'not_found', message: 'Route not found.' } });
}

function isBodyParseError(err: unknown): boolean {
  return (
    err instanceof SyntaxError &&
    typeof err === 'object' &&
    err !== null &&
    'status' in err &&
    (err as { status?: number }).status === 400 &&
    'type' in err &&
    (err as { type?: string }).type === 'entity.parse.failed'
  );
}

function isPayloadTooLarge(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    (err as { type?: string }).type === 'entity.too.large'
  );
}

function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (isBodyParseError(err))
    return errors.badRequest('bad_json', 'Request body is not valid JSON.');
  if (isPayloadTooLarge(err))
    return errors.badRequest('payload_too_large', 'Request body is too large.');
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002':
        return errors.conflict('A record with these values already exists.');
      case 'P2025':
        return errors.notFound();
      case 'P2003':
        return errors.inUse('This record is still referenced by other records.');
      default:
        return errors.internal();
    }
  }
  return errors.internal();
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const api = toApiError(err);
  const log = (
    req as Request & {
      log?: { error: (o: unknown, m: string) => void; warn: (o: unknown, m: string) => void };
    }
  ).log;
  const meta = {
    err: api.status >= 500 ? err : undefined,
    requestId: req.id,
    userId: req.user?.id,
    action: `${req.method} ${req.originalUrl}`,
  };
  if (api.status >= 500) {
    if (log) log.error(meta, 'request failed');
    else logger.error(meta, 'request failed');
  } else {
    if (log) log.warn({ ...meta, code: api.code }, 'request rejected');
    else logger.warn({ ...meta, code: api.code }, 'request rejected');
  }
  const body: { error: { code: string; message: string; details?: FieldError[] } } = {
    error: { code: api.code, message: api.message },
  };
  if (api.details && api.details.length > 0) body.error.details = api.details;
  res.status(api.status).json(body);
}
