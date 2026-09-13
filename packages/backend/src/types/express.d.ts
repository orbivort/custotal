import type { User } from './domain.ts';

declare global {
  namespace Express {
    interface Request {
      /** Correlation id set by the request-id middleware. */
      id?: string;
      /** Authenticated session user, set by the session middleware. */
      user?: User;
      /** Active Session row id (when authenticated). */
      sessionId?: string;
    }
  }
}

export {};
