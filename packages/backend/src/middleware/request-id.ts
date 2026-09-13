// Attach a correlation id to every request and echo it on the response.
// A client-supplied X-Request-Id is honored only when it is a sane log-safe
// token (1-64 chars of [A-Za-z0-9_-]); anything else is replaced with a UUID
// so hostile headers cannot flood or forge log correlation fields.
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'X-Request-Id';

const CLIENT_REQUEST_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'] as string | undefined;
  const id = incoming && CLIENT_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  req.id = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
}
