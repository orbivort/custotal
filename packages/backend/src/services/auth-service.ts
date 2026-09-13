// Authentication service: login/logout, session management, purpose-scoped
// password set/reset tokens (invite | reset, delivered by email), password
// change with global revocation, and temporary-credential expiry.
import bcrypt from 'bcryptjs';
import { prisma } from '../db.ts';
import { env } from '../config.ts';
import { logger } from '../logger.ts';
import { errors, type FieldError } from '../lib/errors.ts';
import { hashToken, generateToken } from '../lib/tokens.ts';
import { EMAIL_RE } from '../lib/validation.ts';
import { toUser } from '../serializers.ts';
import type { User } from '../types/domain.ts';
import { sendPasswordReset } from './mailer.ts';

const BCRYPT_ROUNDS = 10;

export async function findUserByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  return prisma.user.findUnique({ where: { email: normalized } });
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Creates a session row and returns the raw opaque token (the route sets the cookie). */
async function createSession(userId: string): Promise<string> {
  const token = generateToken();
  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt: new Date(Date.now() + env.sessionTtlHours * 3_600_000),
    },
  });
  return token;
}

export interface LoginResult {
  user: User;
  /** Raw one-time session token; the caller sets it as the session cookie. */
  sessionToken: string;
}

export async function login(email: string, password: string): Promise<LoginResult> {
  if (!EMAIL_RE.test(email.trim())) throw errors.invalidCredentials();
  const user = await findUserByEmail(email);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw errors.invalidCredentials();
  }
  assertTempCredentialUsable(user);
  const sessionToken = await createSession(user.id);
  return { user: toUser(user), sessionToken };
}

/**
 * A user holding a temporary credential (invite email undeliverable) must
 * rotate it within `tempPasswordTtlDays`; afterwards only the reset flow works.
 */
function assertTempCredentialUsable(user: {
  mustChangePassword: boolean;
  passwordChangedAt: Date;
}): void {
  if (!user.mustChangePassword) return;
  const ageMs = Date.now() - user.passwordChangedAt.getTime();
  if (ageMs > env.tempPasswordTtlDays * 86_400_000) {
    throw errors.badRequest(
      'expired_credential',
      'This temporary password has expired. Use "Forgot password?" to receive a reset link.',
    );
  }
}

export async function logout(sessionId: string | undefined): Promise<void> {
  if (sessionId) {
    await prisma.session.deleteMany({ where: { id: sessionId } }).catch(() => undefined);
  }
}

export type TokenPurpose = 'invite' | 'reset';

/** Builds the frontend link for a one-time set-password token. */
export function authLinkUrl(purpose: TokenPurpose, token: string): string {
  const path = purpose === 'invite' ? '/invite/accept' : '/reset-password';
  return `${env.appPublicUrl}${path}?token=${encodeURIComponent(token)}`;
}

/** FR-CC-01 password reset: issue a purpose-scoped token and email the link. */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await findUserByEmail(email);
  // Always succeed to avoid account enumeration.
  if (!user) return;
  // Revoke outstanding tokens for this user.
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
  const token = generateToken();
  await prisma.passwordResetToken.create({
    data: {
      tokenHash: hashToken(token),
      purpose: 'reset',
      userId: user.id,
      expiresAt: new Date(Date.now() + env.resetTokenTtlMinutes * 60_000),
    },
  });
  logger.info({ userId: user.id, action: 'password_reset.requested' }, 'Password reset requested');
  // The mailer logs the link itself only when SMTP is unconfigured; with SMTP
  // configured the link is never written to logs.
  await sendPasswordReset(user.email, user.name, authLinkUrl('reset', token));
}

export async function resetPassword(
  token: string,
  newPassword: string,
  expectedPurpose: TokenPurpose = 'reset',
): Promise<void> {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  // Purpose scoping: an invite link cannot confirm a reset and vice versa.
  if (
    !record ||
    record.usedAt ||
    record.purpose !== expectedPurpose ||
    record.expiresAt.getTime() < Date.now()
  ) {
    throw errors.badRequest('invalid_token', 'This password reset link is invalid or has expired.');
  }
  if (newPassword.length < 8) {
    throw errors.validation([
      { field: 'password', message: 'Password must be at least 8 characters.' },
    ]);
  }
  const passwordHash = await hashPassword(newPassword);
  const now = new Date();
  await prisma.$transaction([
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: now } }),
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash, passwordChangedAt: now, mustChangePassword: false },
    }),
    // FR-CC-09: a password change revokes every existing session.
    prisma.session.deleteMany({ where: { userId: record.userId } }),
  ]);
  logger.info(
    { userId: record.userId, action: `password_${expectedPurpose}.confirmed` },
    expectedPurpose === 'invite' ? 'Invitation accepted' : 'Password reset completed',
  );
}

/** Accept an invitation: consume the invite token and set the first password. */
export async function acceptInvite(token: string, newPassword: string): Promise<void> {
  await resetPassword(token, newPassword, 'invite');
}

/** Change the password for an authenticated user; revokes all sessions (FR-CC-09). */
export async function changePassword(
  user: User,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await verifyPassword(currentPassword, row.passwordHash))) {
    throw errors.validation([
      { field: 'currentPassword', message: 'Your current password is incorrect.' },
    ]);
  }
  if (newPassword.length < 8) {
    throw errors.validation([
      { field: 'newPassword', message: 'Password must be at least 8 characters.' },
    ]);
  }
  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, passwordChangedAt: new Date(), mustChangePassword: false },
    }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
  ]);
  logger.info({ userId: user.id, action: 'password.changed' }, 'Password changed');
}

export function validateNewPassword(
  details: FieldError[],
  password: unknown,
  field = 'password',
): boolean {
  if (typeof password !== 'string' || password.length < 8) {
    details.push({ field, message: 'Password must be at least 8 characters.' });
    return false;
  }
  return true;
}
