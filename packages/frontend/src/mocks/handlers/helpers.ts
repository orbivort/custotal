import type { ApiErrorBody, User } from '../../types/domain';
import { getDB } from '../db/store';

export function json<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function err(
  status: number,
  code: string,
  message: string,
  details?: { field: string; message: string }[],
): Response {
  const body: ApiErrorBody = { error: { code, message, details } };
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let seq = 0;

export function genId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function currentUser(): User | null {
  const db = getDB();
  if (!db.sessionUserId) return null;
  return db.users.find((u) => u.id === db.sessionUserId) ?? null;
}

export function requireUser(): User | null {
  return currentUser();
}

/**
 * Admin gate mirroring the backend's requireUser + requireAdmin pair: returns
 * an error Response (401 for anonymous callers, 403 for signed-in non-admins)
 * or the admin user the handler should act as.
 */
export function adminGate(): User | Response {
  const user = currentUser();
  if (!user) return err(401, 'unauthorized', 'Authentication required.');
  if (user.role !== 'admin') {
    return err(403, 'forbidden', 'Administrator access required.');
  }
  return user;
}

/** Owner-scoped visibility for opportunities, tasks, and interactions. */
export function canViewOwnerScoped(user: User, ownerId: string): boolean {
  if (user.role === 'admin' || user.role === 'manager' || user.role === 'readonly') return true;
  return ownerId === user.id;
}

export function canEdit(user: User): boolean {
  return user.role === 'admin' || user.role === 'manager' || user.role === 'rep';
}
