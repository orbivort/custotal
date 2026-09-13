// Unit tests for the authentication service (FR-CC-01 login/session, password
// reset, password change with global session revocation FR-CC-09).
// `prisma` and the env config are mocked, so these tests are pure unit tests:
// no database, no HTTP layer, no cookie plumbing (the service returns the raw
// session token; the routes own the cookie helpers). bcryptjs is used for
// real (pure JS) so hashing round-trips are genuinely verified.
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
  type MockInstance,
} from 'vitest';
import { env } from '../../../src/config.ts';
import { prisma } from '../../../src/db.ts';
import { errors } from '../../../src/lib/errors.ts';
import { hashToken } from '../../../src/lib/tokens.ts';
import { logger } from '../../../src/logger.ts';
import { sendPasswordReset } from '../../../src/services/mailer.ts';
import {
  acceptInvite,
  changePassword,
  findUserByEmail,
  hashPassword,
  login,
  logout,
  requestPasswordReset,
  resetPassword,
  validateNewPassword,
  verifyPassword,
} from '../../../src/services/auth-service.ts';
import type { User } from '../../../src/types/domain.ts';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../../../src/db.ts', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    session: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    passwordResetToken: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../../src/config.ts', () => ({
  env: {
    sessionTtlHours: 8,
    resetTokenTtlMinutes: 60,
    tempPasswordTtlDays: 7,
    appPublicUrl: 'http://localhost:5173',
  },
}));

vi.mock('../../../src/services/mailer.ts', () => ({
  smtpConfigured: vi.fn(() => true),
  sendInvitation: vi.fn(),
  sendPasswordReset: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Typed handles for the prisma mocks (runtime: vi.fn(), statics: Prisma types)
// ---------------------------------------------------------------------------

const userFindUnique = prisma.user.findUnique as unknown as Mock;
const userFindUniqueOrThrow = prisma.user.findUniqueOrThrow as unknown as Mock;
const userUpdate = prisma.user.update as unknown as Mock;
const sessionCreate = prisma.session.create as unknown as Mock;
const sessionDeleteMany = prisma.session.deleteMany as unknown as Mock;
const resetTokenCreate = prisma.passwordResetToken.create as unknown as Mock;
const resetTokenDeleteMany = prisma.passwordResetToken.deleteMany as unknown as Mock;
const resetTokenFindUnique = prisma.passwordResetToken.findUnique as unknown as Mock;
const resetTokenUpdate = prisma.passwordResetToken.update as unknown as Mock;
const transaction = prisma.$transaction as unknown as Mock;
const sendPasswordResetMock = sendPasswordReset as unknown as Mock;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PASSWORD = 'correct-horse';
const BASE_TIME = new Date('2026-01-02T03:04:05.000Z');
const SESSION_TTL_MS = env.sessionTtlHours * 3_600_000;
const RESET_TTL_MS = env.resetTokenTtlMinutes * 60_000;

let passwordHash: string;

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    role: 'admin',
    passwordHash,
    mustChangePassword: false,
    passwordChangedAt: new Date('2025-06-01T00:00:00.000Z'),
    ...overrides,
  };
}

const wireUser: User = {
  id: 'u1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  role: 'admin',
  mustChangePassword: false,
};

beforeEach(async () => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: BASE_TIME });
  passwordHash = await hashPassword(PASSWORD);
  // Silence pino output while still allowing call assertions.
  vi.spyOn(logger, 'info').mockImplementation(() => undefined);
  vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
  vi.spyOn(logger, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// findUserByEmail
// ---------------------------------------------------------------------------

describe('findUserByEmail', () => {
  it('looks up the trimmed, lowercased email', async () => {
    userFindUnique.mockResolvedValue(userRow());
    await expect(findUserByEmail('  Ada@Example.COM ')).resolves.toEqual(userRow());
    expect(userFindUnique).toHaveBeenCalledWith({ where: { email: 'ada@example.com' } });
  });

  it('returns null for a blank email without querying the database', async () => {
    await expect(findUserByEmail('   ')).resolves.toBeNull();
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it('returns null when the user does not exist', async () => {
    userFindUnique.mockResolvedValue(null);
    await expect(findUserByEmail('nobody@example.com')).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// hashPassword / verifyPassword
// ---------------------------------------------------------------------------

describe('hashPassword / verifyPassword', () => {
  it('round-trips a password through hash and compare', async () => {
    const hash = await hashPassword('s3cret-pass');
    expect(hash).not.toBe('s3cret-pass');
    await expect(verifyPassword('s3cret-pass', hash)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('s3cret-pass');
    await expect(verifyPassword('wrong-pass', hash)).resolves.toBe(false);
  });

  it('produces different hashes for the same password (salted)', async () => {
    const [a, b] = await Promise.all([hashPassword('same'), hashPassword('same')]);
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// login
// ---------------------------------------------------------------------------

describe('login', () => {
  it('rejects a malformed email before touching the database', async () => {
    await expect(login('not-an-email', PASSWORD)).rejects.toMatchObject({
      status: 401,
      code: 'invalid_credentials',
    });
    expect(userFindUnique).not.toHaveBeenCalled();
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('throws invalidCredentials for an unknown email', async () => {
    userFindUnique.mockResolvedValue(null);
    await expect(login('ghost@example.com', PASSWORD)).rejects.toThrow(errors.invalidCredentials());
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('throws invalidCredentials when the password does not match', async () => {
    userFindUnique.mockResolvedValue(userRow());
    await expect(login('ada@example.com', 'wrong-pass')).rejects.toMatchObject({
      status: 401,
      code: 'invalid_credentials',
    });
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('creates a hashed-token session and returns the wire user with the raw session token', async () => {
    userFindUnique.mockResolvedValue(userRow());

    const result = await login('ada@example.com', PASSWORD);

    expect(result.user).toEqual(wireUser);
    // The caller receives the raw opaque token (to set as the cookie)...
    expect(typeof result.sessionToken).toBe('string');
    expect(result.sessionToken.length).toBeGreaterThan(0);
    // ...and the database stores only its SHA-256 digest.
    expect(sessionCreate).toHaveBeenCalledTimes(1);
    const { data } = sessionCreate.mock.calls[0][0];
    expect(data.tokenHash).toBe(hashToken(result.sessionToken));
    expect(data.userId).toBe('u1');
    expect(data.expiresAt.getTime()).toBe(BASE_TIME.getTime() + SESSION_TTL_MS);
  });

  it('normalizes the email before lookup', async () => {
    userFindUnique.mockResolvedValue(userRow());
    await login('  ADA@Example.COM ', PASSWORD);
    expect(userFindUnique).toHaveBeenCalledWith({ where: { email: 'ada@example.com' } });
  });

  it('never leaks the password hash in the returned user', async () => {
    userFindUnique.mockResolvedValue(userRow());
    const result = await login('ada@example.com', PASSWORD);
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('carries the mustChangePassword flag into the returned user', async () => {
    const recent = new Date(BASE_TIME.getTime() - 3_600_000);
    userFindUnique.mockResolvedValue(
      userRow({ mustChangePassword: true, passwordChangedAt: recent }),
    );
    const result = await login('ada@example.com', PASSWORD);
    expect(result.user.mustChangePassword).toBe(true);
  });

  it('rejects an expired temporary credential and directs the user to the reset flow', async () => {
    const tooOld = new Date(BASE_TIME.getTime() - (env.tempPasswordTtlDays + 0.01) * 86_400_000);
    userFindUnique.mockResolvedValue(
      userRow({ mustChangePassword: true, passwordChangedAt: tooOld }),
    );
    await expect(login('ada@example.com', PASSWORD)).rejects.toMatchObject({
      status: 400,
      code: 'expired_credential',
    });
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('accepts a temporary credential within its TTL window', async () => {
    const recent = new Date(BASE_TIME.getTime() - 3_600_000);
    userFindUnique.mockResolvedValue(
      userRow({ mustChangePassword: true, passwordChangedAt: recent }),
    );
    await expect(login('ada@example.com', PASSWORD)).resolves.toMatchObject({
      user: { id: 'u1' },
    });
    expect(sessionCreate).toHaveBeenCalledTimes(1);
  });

  it('ignores the temporary-credential expiry for users without the flag', async () => {
    // Flag not set: a stale passwordChangedAt must not block a normal login.
    userFindUnique.mockResolvedValue(
      userRow({ passwordChangedAt: new Date('2020-01-01T00:00:00.000Z') }),
    );
    await expect(login('ada@example.com', PASSWORD)).resolves.toMatchObject({
      user: { id: 'u1' },
    });
  });
});

// ---------------------------------------------------------------------------
// logout
// ---------------------------------------------------------------------------

describe('logout', () => {
  it('deletes the server-side session when a session id is provided', async () => {
    sessionDeleteMany.mockResolvedValue({ count: 1 });
    await logout('s1');
    expect(sessionDeleteMany).toHaveBeenCalledWith({ where: { id: 's1' } });
  });

  it('skips the database delete when there is no session id', async () => {
    await logout(undefined);
    expect(sessionDeleteMany).not.toHaveBeenCalled();
  });

  it('still succeeds when the session row is already gone (delete error swallowed)', async () => {
    sessionDeleteMany.mockRejectedValue(new Error('P2025: record not found'));
    await expect(logout('gone')).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// requestPasswordReset (FR-CC-01)
// ---------------------------------------------------------------------------

describe('requestPasswordReset', () => {
  it('returns silently for an unknown email (no account enumeration)', async () => {
    userFindUnique.mockResolvedValue(null);
    await expect(requestPasswordReset('ghost@example.com')).resolves.toBeUndefined();
    expect(resetTokenDeleteMany).not.toHaveBeenCalled();
    expect(resetTokenCreate).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
    expect(sendPasswordResetMock).not.toHaveBeenCalled();
  });

  it('revokes outstanding tokens and persists a fresh purpose-scoped hashed token', async () => {
    userFindUnique.mockResolvedValue(userRow());
    resetTokenDeleteMany.mockResolvedValue({ count: 0 });
    resetTokenCreate.mockResolvedValue({});

    await requestPasswordReset('ada@example.com');

    expect(resetTokenDeleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(resetTokenCreate).toHaveBeenCalledTimes(1);
    const { data } = resetTokenCreate.mock.calls[0][0];
    expect(data.userId).toBe('u1');
    expect(data.purpose).toBe('reset');
    expect(data.expiresAt.getTime()).toBe(BASE_TIME.getTime() + RESET_TTL_MS);
    expect(typeof data.tokenHash).toBe('string');
  });

  it('emails a reset link whose token hash matches the persisted one', async () => {
    userFindUnique.mockResolvedValue(userRow());
    resetTokenDeleteMany.mockResolvedValue({ count: 0 });
    resetTokenCreate.mockResolvedValue({});

    await requestPasswordReset('ada@example.com');

    // The raw token only ever leaves the server inside the emailed link.
    expect(sendPasswordResetMock).toHaveBeenCalledTimes(1);
    const [to, name, link] = sendPasswordResetMock.mock.calls[0];
    expect(to).toBe('ada@example.com');
    expect(name).toBe('Ada Lovelace');
    const url = new URL(link);
    expect(url.origin + url.pathname).toBe('http://localhost:5173/reset-password');
    const rawToken = url.searchParams.get('token')!;
    expect(rawToken.length).toBeGreaterThan(0);
    expect(resetTokenCreate.mock.calls[0][0].data.tokenHash).toBe(hashToken(rawToken));
  });

  it('logs the request with the user id and no email address', async () => {
    userFindUnique.mockResolvedValue(userRow());
    resetTokenDeleteMany.mockResolvedValue({ count: 0 });
    resetTokenCreate.mockResolvedValue({});

    await requestPasswordReset('ada@example.com');

    const [meta, message] = (logger.info as unknown as MockInstance).mock.calls[0];
    expect(meta).toEqual({ userId: 'u1', action: 'password_reset.requested' });
    expect(message).toBe('Password reset requested');
    expect(JSON.stringify(meta) + message).not.toContain('ada@example.com');
  });
});

// ---------------------------------------------------------------------------
// resetPassword
// ---------------------------------------------------------------------------

describe('resetPassword', () => {
  const GOOD_TOKEN = 'reset-token-abc';

  function validRecord(overrides: Record<string, unknown> = {}) {
    return {
      id: 'rt1',
      tokenHash: hashToken(GOOD_TOKEN),
      purpose: 'reset',
      userId: 'u1',
      expiresAt: new Date(BASE_TIME.getTime() + 1000),
      usedAt: null,
      ...overrides,
    };
  }

  it('rejects an unknown token with badRequest invalid_token', async () => {
    resetTokenFindUnique.mockResolvedValue(null);
    await expect(resetPassword(GOOD_TOKEN, 'new-password-1')).rejects.toMatchObject({
      status: 400,
      code: 'invalid_token',
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects a token that was already used', async () => {
    resetTokenFindUnique.mockResolvedValue(
      validRecord({ usedAt: new Date(BASE_TIME.getTime() - 500) }),
    );
    await expect(resetPassword(GOOD_TOKEN, 'new-password-1')).rejects.toMatchObject({
      status: 400,
      code: 'invalid_token',
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects an expired token', async () => {
    resetTokenFindUnique.mockResolvedValue(
      validRecord({ expiresAt: new Date(BASE_TIME.getTime() - 1) }),
    );
    await expect(resetPassword(GOOD_TOKEN, 'new-password-1')).rejects.toMatchObject({
      status: 400,
      code: 'invalid_token',
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects an invite-purpose token against the reset endpoint (purpose scoping)', async () => {
    resetTokenFindUnique.mockResolvedValue(validRecord({ purpose: 'invite' }));
    await expect(resetPassword(GOOD_TOKEN, 'new-password-1')).rejects.toMatchObject({
      status: 400,
      code: 'invalid_token',
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects a reset-purpose token when confirming an invite', async () => {
    resetTokenFindUnique.mockResolvedValue(validRecord({ purpose: 'reset' }));
    await expect(acceptInvite(GOOD_TOKEN, 'new-password-1')).rejects.toMatchObject({
      status: 400,
      code: 'invalid_token',
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('looks the token up by its SHA-256 hash, never the raw value', async () => {
    resetTokenFindUnique.mockResolvedValue(null);
    await resetPassword(GOOD_TOKEN, 'new-password-1').catch(() => undefined);
    expect(resetTokenFindUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashToken(GOOD_TOKEN) },
    });
  });

  it('rejects a too-short password with a field validation error', async () => {
    resetTokenFindUnique.mockResolvedValue(validRecord());
    await expect(resetPassword(GOOD_TOKEN, 'short')).rejects.toMatchObject({
      status: 400,
      code: 'validation',
      details: [{ field: 'password', message: 'Password must be at least 8 characters.' }],
    });
    expect(transaction).not.toHaveBeenCalled();
    expect(resetTokenUpdate).not.toHaveBeenCalled();
  });

  it('marks the token used, updates the hash and revokes every session in one transaction', async () => {
    const record = validRecord();
    resetTokenFindUnique.mockResolvedValue(record);
    userUpdate.mockResolvedValue(userRow());
    resetTokenUpdate.mockResolvedValue(record);
    sessionDeleteMany.mockResolvedValue({ count: 2 });
    transaction.mockResolvedValue([]);

    await resetPassword(GOOD_TOKEN, 'new-password-1');

    expect(transaction).toHaveBeenCalledTimes(1);
    const ops = transaction.mock.calls[0][0];
    expect(ops).toHaveLength(3);

    // Op 1: the reset token is marked used exactly once, right now.
    expect(resetTokenUpdate).toHaveBeenCalledWith({
      where: { id: 'rt1' },
      data: { usedAt: BASE_TIME },
    });
    expect(ops[0]).toBe(resetTokenUpdate.mock.results[0].value);

    // Op 2: the user's password hash and passwordChangedAt are updated, and the
    // temporary-credential flag is cleared.
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: expect.objectContaining({
        passwordChangedAt: BASE_TIME,
        mustChangePassword: false,
      }),
    });
    const updateData = userUpdate.mock.calls[0][0].data;
    await expect(verifyPassword('new-password-1', updateData.passwordHash)).resolves.toBe(true);
    await expect(verifyPassword(PASSWORD, updateData.passwordHash)).resolves.toBe(false);
    expect(ops[1]).toBe(userUpdate.mock.results[0].value);

    // Op 3 (FR-CC-09): all sessions for the user are revoked.
    expect(sessionDeleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(ops[2]).toBe(sessionDeleteMany.mock.results[0].value);

    expect(logger.info).toHaveBeenCalledWith(
      { userId: 'u1', action: 'password_reset.confirmed' },
      'Password reset completed',
    );
  });
});

// ---------------------------------------------------------------------------
// acceptInvite
// ---------------------------------------------------------------------------

describe('acceptInvite', () => {
  const INVITE_TOKEN = 'invite-token-abc';

  function inviteRecord(overrides: Record<string, unknown> = {}) {
    return {
      id: 'rt2',
      tokenHash: hashToken(INVITE_TOKEN),
      purpose: 'invite',
      userId: 'u1',
      expiresAt: new Date(BASE_TIME.getTime() + 1000),
      usedAt: null,
      ...overrides,
    };
  }

  it('consumes an invite-purpose token, sets the password and clears the rotation flag', async () => {
    const record = inviteRecord();
    resetTokenFindUnique.mockResolvedValue(record);
    userUpdate.mockResolvedValue(userRow());
    resetTokenUpdate.mockResolvedValue(record);
    sessionDeleteMany.mockResolvedValue({ count: 0 });
    transaction.mockResolvedValue([]);

    await acceptInvite(INVITE_TOKEN, 'first-password-1');

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: expect.objectContaining({
        passwordChangedAt: BASE_TIME,
        mustChangePassword: false,
      }),
    });
    await expect(
      verifyPassword('first-password-1', userUpdate.mock.calls[0][0].data.passwordHash),
    ).resolves.toBe(true);
    expect(logger.info).toHaveBeenCalledWith(
      { userId: 'u1', action: 'password_invite.confirmed' },
      'Invitation accepted',
    );
  });
});

// ---------------------------------------------------------------------------
// changePassword (FR-CC-09)
// ---------------------------------------------------------------------------

describe('changePassword', () => {
  it('verifies the current password against the stored hash before anything else', async () => {
    userFindUniqueOrThrow.mockResolvedValue(userRow());
    // Also assert that the current-password check happens before the length check:
    // a wrong current password wins even when the new password is too short.
    await expect(changePassword(wireUser, 'wrong-pass', 'short')).rejects.toMatchObject({
      status: 400,
      code: 'validation',
      details: [{ field: 'currentPassword', message: 'Your current password is incorrect.' }],
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects a too-short new password with a field validation error', async () => {
    userFindUniqueOrThrow.mockResolvedValue(userRow());
    await expect(changePassword(wireUser, PASSWORD, 'short')).rejects.toMatchObject({
      status: 400,
      code: 'validation',
      details: [{ field: 'newPassword', message: 'Password must be at least 8 characters.' }],
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('propagates a missing user row (findUniqueOrThrow)', async () => {
    userFindUniqueOrThrow.mockRejectedValue(new Error('P2025: record not found'));
    await expect(changePassword(wireUser, PASSWORD, 'new-password-1')).rejects.toThrow(
      'P2025: record not found',
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('updates the hash, stamps passwordChangedAt and revokes all sessions', async () => {
    userFindUniqueOrThrow.mockResolvedValue(userRow());
    userUpdate.mockResolvedValue(userRow());
    sessionDeleteMany.mockResolvedValue({ count: 1 });
    transaction.mockResolvedValue([]);

    await changePassword(wireUser, PASSWORD, 'new-password-1');

    expect(transaction).toHaveBeenCalledTimes(1);
    const ops = transaction.mock.calls[0][0];
    expect(ops).toHaveLength(2);

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: expect.objectContaining({ passwordChangedAt: BASE_TIME }),
    });
    const updateData = userUpdate.mock.calls[0][0].data;
    await expect(verifyPassword('new-password-1', updateData.passwordHash)).resolves.toBe(true);
    expect(ops[0]).toBe(userUpdate.mock.results[0].value);

    // FR-CC-09: a password change revokes every existing session.
    expect(sessionDeleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(ops[1]).toBe(sessionDeleteMany.mock.results[0].value);

    expect(logger.info).toHaveBeenCalledWith(
      { userId: 'u1', action: 'password.changed' },
      'Password changed',
    );
  });

  it('accepts a new password of exactly 8 characters', async () => {
    userFindUniqueOrThrow.mockResolvedValue(userRow());
    userUpdate.mockResolvedValue(userRow());
    sessionDeleteMany.mockResolvedValue({ count: 0 });
    transaction.mockResolvedValue([]);

    await expect(changePassword(wireUser, PASSWORD, '12345678')).resolves.toBeUndefined();
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// validateNewPassword
// ---------------------------------------------------------------------------

describe('validateNewPassword', () => {
  it('accepts a password of 8+ characters without adding errors', () => {
    const details: { field: string; message: string }[] = [];
    expect(validateNewPassword(details, 'long-enough')).toBe(true);
    expect(details).toEqual([]);
  });

  it('rejects a password shorter than 8 characters', () => {
    const details: { field: string; message: string }[] = [];
    expect(validateNewPassword(details, '1234567')).toBe(false);
    expect(details).toEqual([
      { field: 'password', message: 'Password must be at least 8 characters.' },
    ]);
  });

  it('rejects non-string values (numbers, null, undefined, objects)', () => {
    for (const value of [42, null, undefined, {}, ['12345678']]) {
      const details: { field: string; message: string }[] = [];
      expect(validateNewPassword(details, value)).toBe(false);
      expect(details).toEqual([
        { field: 'password', message: 'Password must be at least 8 characters.' },
      ]);
    }
  });

  it('appends to existing details without clobbering them', () => {
    const details = [{ field: 'email', message: 'Invalid email format.' }];
    expect(validateNewPassword(details, 'short')).toBe(false);
    expect(details).toHaveLength(2);
    expect(details[0]).toEqual({ field: 'email', message: 'Invalid email format.' });
  });

  it('uses a custom field name when given', () => {
    const details: { field: string; message: string }[] = [];
    expect(validateNewPassword(details, 'short', 'newPassword')).toBe(false);
    expect(details).toEqual([
      { field: 'newPassword', message: 'Password must be at least 8 characters.' },
    ]);
  });
});
