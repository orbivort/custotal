import { http } from 'msw';
import { getDB, persist } from '../db/store';
import { err, json } from './helpers';

// The mock dataset stores no per-user credentials, so this single shared value
// is accepted for every seeded account and expected as the current password
// when changing it.
const MOCK_PASSWORD = 'demo1234';

export const authHandlers = [
  http.post('/api/auth/login', async ({ request }) => {
    const body = (await request.json()) as { email?: string; password?: string };
    const db = getDB();
    const email = (body.email ?? '').trim().toLowerCase();
    const user = db.users.find((u) => u.email.toLowerCase() === email);
    // Identity is strict: credentials must match a real account. Never fall back
    // to another user, otherwise an unknown "admin" login silently becomes a rep.
    if (!user || body.password !== MOCK_PASSWORD) {
      return err(401, 'invalid_credentials', 'Invalid email or password.');
    }
    db.sessionUserId = user.id;
    persist();
    return json({ user });
  }),

  http.post('/api/auth/logout', () => {
    const db = getDB();
    db.sessionUserId = null;
    persist();
    return json({ ok: true });
  }),

  http.get('/api/auth/me', () => {
    const db = getDB();
    const user = db.users.find((u) => u.id === db.sessionUserId) ?? null;
    if (!user) return err(401, 'unauthorized', 'Not authenticated.');
    return json({ user });
  }),

  // ---- Password recovery / invitation (token flows) ------------------------
  // The mock has no token store, so it accepts any well-formed request. Real
  // token validation (single-use, purpose-scoped, TTL) lives in the backend.

  http.post('/api/auth/password-reset/request', () => {
    // Always OK to avoid account enumeration, mirroring the backend.
    return json({ ok: true }, 202);
  }),

  http.post('/api/auth/password-reset/confirm', async ({ request }) => {
    const body = (await request.json()) as { token?: string; password?: string };
    if (!body.token)
      return err(400, 'invalid_token', 'This password reset link is invalid or has expired.');
    if (!body.password || body.password.length < 8) {
      return err(400, 'validation', 'Please correct the highlighted fields.', [
        { field: 'password', message: 'Password must be at least 8 characters.' },
      ]);
    }
    return json({ ok: true });
  }),

  http.post('/api/auth/invite/accept', async ({ request }) => {
    const body = (await request.json()) as { token?: string; password?: string };
    if (!body.token)
      return err(400, 'invalid_token', 'This invitation link is invalid or has expired.');
    if (!body.password || body.password.length < 8) {
      return err(400, 'validation', 'Please correct the highlighted fields.', [
        { field: 'password', message: 'Password must be at least 8 characters.' },
      ]);
    }
    return json({ ok: true });
  }),

  http.post('/api/auth/change-password', async ({ request }) => {
    const db = getDB();
    const user = db.users.find((u) => u.id === db.sessionUserId);
    if (!user) return err(401, 'unauthorized', 'Not authenticated.');
    const body = (await request.json()) as {
      currentPassword?: string;
      newPassword?: string;
    };
    if (body.currentPassword !== MOCK_PASSWORD) {
      return err(400, 'validation', 'Please correct the highlighted fields.', [
        { field: 'currentPassword', message: 'Your current password is incorrect.' },
      ]);
    }
    if (!body.newPassword || body.newPassword.length < 8) {
      return err(400, 'validation', 'Please correct the highlighted fields.', [
        { field: 'newPassword', message: 'Password must be at least 8 characters.' },
      ]);
    }
    return json({ ok: true });
  }),
];
