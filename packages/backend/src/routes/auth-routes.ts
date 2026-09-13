// Authentication endpoints. Session cookies are set by the service (login) and
// cleared on logout. Reset endpoints are rate limited (FR-CC-01 / FR-CC-11).
import { Router } from 'express';
import * as authService from '../services/auth-service.ts';
import { loginLimiter, resetRequestLimiter, tokenActionLimiter } from '../middleware/rate-limit.ts';
import {
  authedUser,
  requireUser,
  setSessionCookie,
  clearSessionCookie,
} from '../middleware/auth.ts';

export const authRouter = Router();

authRouter.post('/login', loginLimiter, async (req, res) => {
  const body = (req.body ?? {}) as { email?: string; password?: string };
  const { user, sessionToken } = await authService.login(body.email ?? '', body.password ?? '');
  setSessionCookie(res, sessionToken);
  res.json({ user });
});

authRouter.post('/logout', async (req, res) => {
  clearSessionCookie(res);
  await authService.logout(req.sessionId);
  res.json({ ok: true });
});

authRouter.get('/me', requireUser, (req, res) => {
  res.json({ user: authedUser(req) });
});

authRouter.post('/password-reset/request', resetRequestLimiter(), async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email : '';
  await authService.requestPasswordReset(email);
  // Always return ok to avoid account enumeration.
  res.status(202).json({ ok: true });
});

authRouter.post('/password-reset/confirm', tokenActionLimiter, async (req, res) => {
  const body = (req.body ?? {}) as { token?: string; password?: string };
  await authService.resetPassword(body.token ?? '', body.password ?? '');
  res.json({ ok: true });
});

// Invitation acceptance: consumes a purpose: 'invite' token and sets the
// user's first password. Unauthenticated (the user has no credentials yet).
authRouter.post('/invite/accept', tokenActionLimiter, async (req, res) => {
  const body = (req.body ?? {}) as { token?: string; password?: string };
  await authService.acceptInvite(body.token ?? '', body.password ?? '');
  res.json({ ok: true });
});

authRouter.post('/change-password', requireUser, async (req, res) => {
  const body = (req.body ?? {}) as { currentPassword?: string; newPassword?: string };
  await authService.changePassword(
    authedUser(req),
    body.currentPassword ?? '',
    body.newPassword ?? '',
  );
  res.json({ ok: true });
});
