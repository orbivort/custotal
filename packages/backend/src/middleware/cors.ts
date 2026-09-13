// Minimal, allow-list CORS for cross-origin development. Same-origin deployments
// (frontend proxied through the API host) need no headers at all.
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config.ts';

export function corsAllowList(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  if (origin && env.corsOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
  }
  next();
}
