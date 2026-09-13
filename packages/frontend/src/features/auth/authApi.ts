// Auth and instance-bootstrap API. Owns the /api/auth/* endpoints plus the
// /api/health probe used by the login screen.
import { api } from '../../lib/api';
import type { InstanceInfo, User } from '../../types/domain';

export interface LoginCredentials {
  email: string;
  password: string;
}

export async function login({ email, password }: LoginCredentials): Promise<User> {
  const res = await api.post<{ user: User }>('/api/auth/login', { email, password });
  return res.user;
}

export async function logout(): Promise<void> {
  await api.post<{ ok: true }>('/api/auth/logout');
}

export async function fetchMe(): Promise<User> {
  const res = await api.get<{ user: User }>('/api/auth/me');
  return res.user;
}

/** Static instance facts used to render the login screen (GET /api/health). */
export async function fetchInstanceInfo(): Promise<InstanceInfo> {
  return api.get<InstanceInfo>('/api/health');
}

/** Requests a password-reset email. Always succeeds to avoid enumeration. */
export async function requestPasswordReset(email: string): Promise<void> {
  await api.post<{ ok: true }>('/api/auth/password-reset/request', { email });
}

/** Consumes a purpose-scoped token and sets the password (reset flow). */
export async function confirmPasswordReset(token: string, password: string): Promise<void> {
  await api.post<{ ok: true }>('/api/auth/password-reset/confirm', { token, password });
}

/** Consumes an invitation token and sets the first password (invite flow). */
export async function acceptInvitation(token: string, password: string): Promise<void> {
  await api.post<{ ok: true }>('/api/auth/invite/accept', { token, password });
}

/** Changes the password for the signed-in user (revokes all sessions). */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await api.post<{ ok: true }>('/api/auth/change-password', { currentPassword, newPassword });
}
