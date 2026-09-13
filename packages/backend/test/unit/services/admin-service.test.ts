// Unit tests for the admin service (user management, pipeline stage
// configuration, and the 30-day trash / recovery workflow).
// Pure unit tests: the Prisma client, password hashing, and logger are mocked,
// so no database or HTTP server is required.
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('../../../src/db.ts', () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      delete: vi.fn(),
    },
    stage: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      aggregate: vi.fn(),
    },
    opportunity: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    task: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    contact: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    account: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    interaction: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    contactAccountLink: {
      count: vi.fn(),
    },
    passwordResetToken: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../../src/services/auth-service.ts', () => ({
  hashPassword: vi.fn(async (password: string) => `hashed:${password}`),
  authLinkUrl: vi.fn((purpose: string, token: string) => `http://app.test/${purpose}/${token}`),
}));

vi.mock('../../../src/services/mailer.ts', () => ({
  smtpConfigured: vi.fn(() => true),
  sendInvitation: vi.fn(async () => true),
  sendPasswordReset: vi.fn(async () => true),
}));

vi.mock('../../../src/logger.ts', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() },
}));

import { prisma } from '../../../src/db.ts';
import { logger } from '../../../src/logger.ts';
import { sendInvitation } from '../../../src/services/mailer.ts';
import { ApiError, errors } from '../../../src/lib/errors.ts';
import {
  createUser,
  createStage,
  deleteStage,
  deleteUser,
  listTrash,
  listUsers,
  purgeTrashAccount,
  purgeTrashContact,
  purgeTrashInteraction,
  purgeTrashOpportunity,
  purgeTrashTask,
  reorderStages,
  restoreTrashAccount,
  restoreTrashContact,
  restoreTrashInteraction,
  restoreTrashOpportunity,
  restoreTrashTask,
  updateStage,
  updateUser,
} from '../../../src/services/admin-service.ts';
import type { User } from '../../../src/types/domain.ts';

// ---- Fixtures --------------------------------------------------------------

const now = new Date('2026-09-09T12:00:00.000Z');

function userRow(
  overrides: Partial<{
    id: string;
    name: string;
    email: string;
    role: string;
    mustChangePassword: boolean;
  }> = {},
) {
  return {
    id: 'u1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    role: 'rep',
    passwordHash: 'hashed:x',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const adminUser: User = { id: 'admin-1', name: 'Root', email: 'root@example.com', role: 'admin' };

function stageRow(
  overrides: Partial<{
    id: string;
    name: string;
    order: number;
    winProbability: number;
    classification: string;
  }> = {},
) {
  return {
    id: 's1',
    name: 'Qualification',
    order: 0,
    winProbability: 20,
    classification: 'open',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function contactRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    phone: null,
    jobTitle: null,
    company: null,
    address: null,
    notes: null,
    status: 'active',
    accountLinks: [{ accountId: 'a1', primary: true, role: 'contact' }],
    createdAt: now,
    createdBy: 'u1',
    updatedAt: now,
    updatedBy: 'u1',
    deletedAt: now,
    ...overrides,
  };
}

function accountRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    name: 'Acme',
    industry: null,
    website: null,
    phone: null,
    billingAddress: null,
    ownerId: 'u1',
    notes: null,
    createdAt: now,
    createdBy: 'u1',
    updatedAt: now,
    updatedBy: 'u1',
    deletedAt: now,
    ...overrides,
  };
}

function opportunityRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'o1',
    name: 'Big deal',
    contactId: null,
    accountId: 'a1',
    valueMinor: 10000,
    currency: 'USD',
    expectedCloseDate: now,
    stageId: 's1',
    probability: 50,
    probabilityManual: false,
    ownerId: 'u1',
    description: null,
    lossReason: null,
    createdAt: now,
    createdBy: 'u1',
    updatedAt: now,
    updatedBy: 'u1',
    deletedAt: now,
    ...overrides,
  };
}

function taskRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 't1',
    title: 'Follow up',
    description: null,
    dueDate: now,
    priority: 'high',
    status: 'open',
    assigneeId: 'u1',
    contactId: null,
    accountId: null,
    opportunityId: null,
    completedAt: null,
    completedBy: null,
    createdAt: now,
    createdBy: 'u1',
    updatedAt: now,
    updatedBy: 'u1',
    deletedAt: now,
    ...overrides,
  };
}

function interactionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'i1',
    type: 'call',
    dateTime: now,
    channel: null,
    direction: 'outbound',
    summary: 'Called about renewal',
    contactId: 'c1',
    accountId: null,
    opportunityId: null,
    taskId: null,
    responsibleUserId: 'u1',
    createdAt: now,
    createdBy: 'u1',
    updatedAt: now,
    updatedBy: 'u1',
    deletedAt: now,
    ...overrides,
  };
}

function expectApiError(
  fn: () => Promise<unknown>,
  status: number,
  code: string,
  message?: string,
) {
  return expect(fn()).rejects.toSatisfy((err: unknown) => {
    expect(err).toBeInstanceOf(ApiError);
    const apiErr = err as ApiError;
    expect(apiErr.status).toBe(status);
    expect(apiErr.code).toBe(code);
    if (message !== undefined) expect(apiErr.message).toBe(message);
    return true;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(logger.warn).mockClear();
});

// ---- Users -----------------------------------------------------------------

describe('listUsers', () => {
  it('returns users sorted by name, mapped to wire type', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      userRow({ id: 'u2', name: 'Bob', email: 'bob@example.com' }),
      userRow(),
    ] as never);

    const users = await listUsers();

    expect(prisma.user.findMany).toHaveBeenCalledWith({ orderBy: { name: 'asc' } });
    expect(users).toEqual([
      { id: 'u2', name: 'Bob', email: 'bob@example.com', role: 'rep', mustChangePassword: false },
      {
        id: 'u1',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        role: 'rep',
        mustChangePassword: false,
      },
    ]);
  });
});

describe('createUser', () => {
  it('creates a user with a lowercased email, default role and hashed temp password', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue(userRow({ email: 'new@example.com' }) as never);

    const { user } = await createUser({ name: '  New User  ', email: 'New@Example.COM ' });

    expect(prisma.user.create).toHaveBeenCalledTimes(1);
    const data = vi.mocked(prisma.user.create).mock.calls[0][0].data;
    expect(data.name).toBe('New User');
    expect(data.email).toBe('new@example.com');
    expect(data.role).toBe('rep');
    expect(data.passwordHash).toMatch(/^hashed:.{10,}$/);

    expect(user).toEqual({
      id: 'u1',
      name: 'Ada Lovelace',
      email: 'new@example.com',
      role: 'rep',
      mustChangePassword: false,
    });
  });

  it('sends an invitation email with a purpose-scoped one-time link when delivery succeeds', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue(userRow() as never);
    vi.mocked(prisma.passwordResetToken.create).mockResolvedValue({} as never);

    const result = await createUser({ name: 'New User', email: 'new@example.com' });

    // An invite token is persisted, scoped to the invite flow.
    expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
    const tokenData = vi.mocked(prisma.passwordResetToken.create).mock.calls[0][0].data as {
      purpose: string;
      tokenHash: string;
    };
    expect(tokenData.purpose).toBe('invite');

    // The emailed link contains the raw token and points at the accept page.
    expect(sendInvitation).toHaveBeenCalledTimes(1);
    const [to, name, link] = vi.mocked(sendInvitation).mock.calls[0];
    expect(to).toBe('new@example.com');
    expect(name).toBe('New User');
    const url = new URL(link);
    expect(url.pathname.startsWith('/invite/')).toBe(true);
    const rawToken = url.pathname.slice('/invite/'.length);
    expect(rawToken.length).toBeGreaterThan(0);

    // Success path: no fallback secret, no forced rotation.
    expect(result.inviteSent).toBe(true);
    expect(result.tempPassword).toBeUndefined();
    expect(result.user.mustChangePassword).toBe(false);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('falls back to a one-time temporary password (and forces rotation) when delivery fails', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue(userRow() as never);
    vi.mocked(prisma.passwordResetToken.create).mockResolvedValue({} as never);
    vi.mocked(prisma.user.update).mockResolvedValue(userRow({ mustChangePassword: true }) as never);
    vi.mocked(sendInvitation).mockResolvedValueOnce(false);

    const result = await createUser({ name: 'New User', email: 'new@example.com' });

    expect(result.inviteSent).toBe(false);
    expect(typeof result.tempPassword).toBe('string');
    expect(result.tempPassword!.length).toBeGreaterThan(8);
    expect(result.user.mustChangePassword).toBe(true);

    // The user is flagged for forced rotation at first login.
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { mustChangePassword: true },
    });

    // The fallback is logged once, but the credential-bearing message is gone:
    // neither the temporary password nor the user's email reach the logs.
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const [meta, message] = vi.mocked(logger.warn).mock.calls[0];
    expect(message).not.toContain(result.tempPassword!);
    expect(message).not.toContain('new@example.com');
    expect(JSON.stringify(meta)).not.toContain(result.tempPassword!);
  });

  it('rejects a missing name with a validation error', async () => {
    await expectApiError(() => createUser({ name: '   ', email: 'a@b.co' }), 400, 'validation');
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid email with a validation error', async () => {
    await expectApiError(() => createUser({ name: 'X', email: 'not-an-email' }), 400, 'validation');
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('rejects a duplicate email with a validation error', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(userRow() as never);

    await expectApiError(
      () => createUser({ name: 'X', email: 'ada@example.com' }),
      400,
      'validation',
    ).catch((err: ApiError) => {
      expect(err.details).toEqual([
        { field: 'email', message: 'A user with this email already exists.' },
      ]);
      throw err;
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('rejects an unknown role with a validation error', async () => {
    await expectApiError(
      () => createUser({ name: 'X', email: 'a@b.co', role: 'superuser' }),
      400,
      'validation',
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('aggregates multiple field errors in one validation error', async () => {
    const err = (await createUser({ name: '', email: 'bad', role: 'nope' }).catch(
      (e: ApiError) => e,
    )) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.details).toEqual([
      { field: 'name', message: 'Full name is required.' },
      { field: 'email', message: 'Invalid email format.' },
      { field: 'role', message: 'Unknown role.' },
    ]);
  });

  it('accepts every valid role', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockImplementation((async (args: { data: { role: string } }) =>
      userRow({ role: args.data.role })) as never);

    for (const role of ['rep', 'manager', 'admin', 'readonly'] as const) {
      await createUser({ name: 'X', email: `${role}@example.com`, role });
      expect(vi.mocked(prisma.user.create).mock.calls.at(-1)![0].data.role).toBe(role);
    }
  });
});

describe('updateUser', () => {
  it('throws notFound when the user does not exist', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    await expectApiError(
      () => updateUser('missing', { name: 'X' }),
      404,
      'not_found',
      'User not found.',
    );
  });

  it('applies partial updates without touching omitted fields', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(userRow() as never);
    vi.mocked(prisma.user.update).mockResolvedValue(userRow({ name: 'Renamed' }) as never);

    await updateUser('u1', { name: 'Renamed' });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { name: 'Renamed' },
    });
  });

  it('normalizes and stores a changed email', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(userRow() as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.user.update).mockResolvedValue(userRow() as never);

    await updateUser('u1', { email: '  Ada@Example.COM ' });

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { email: 'ada@example.com', id: { not: 'u1' } },
    });
    expect(vi.mocked(prisma.user.update).mock.calls[0][0].data.email).toBe('ada@example.com');
  });

  it('rejects a blank name', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(userRow() as never);
    await expectApiError(() => updateUser('u1', { name: '  ' }), 400, 'validation');
  });

  it('rejects an invalid email', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(userRow() as never);
    await expectApiError(() => updateUser('u1', { email: 'nope' }), 400, 'validation');
  });

  it('rejects an email taken by another user', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(userRow() as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue(userRow({ id: 'u2' }) as never);

    await expectApiError(
      () => updateUser('u1', { email: 'taken@example.com' }),
      400,
      'validation',
    ).catch((err: ApiError) => {
      expect(err.details).toEqual([
        { field: 'email', message: 'A user with this email already exists.' },
      ]);
      throw err;
    });
  });

  it('rejects demoting the last admin', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(userRow({ role: 'admin' }) as never);
    vi.mocked(prisma.user.count).mockResolvedValue(1);

    await expectApiError(() => updateUser('admin-1', { role: 'rep' }), 400, 'validation').catch(
      (err: ApiError) => {
        expect(err.details).toEqual([
          { field: 'role', message: 'At least one administrator is required.' },
        ]);
        throw err;
      },
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('allows demoting an admin when other admins remain', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(userRow({ role: 'admin' }) as never);
    vi.mocked(prisma.user.count).mockResolvedValue(2);
    vi.mocked(prisma.user.update).mockResolvedValue(userRow({ role: 'rep' }) as never);

    await updateUser('admin-1', { role: 'rep' });

    expect(vi.mocked(prisma.user.update).mock.calls[0][0].data.role).toBe('rep');
  });

  it('rejects an unknown role', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(userRow() as never);
    await expectApiError(() => updateUser('u1', { role: 'owner' as never }), 400, 'validation');
  });

  it('allows promoting a non-admin to admin without a count check', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(userRow({ role: 'rep' }) as never);
    vi.mocked(prisma.user.update).mockResolvedValue(userRow({ role: 'admin' }) as never);

    await updateUser('u1', { role: 'admin' });

    expect(prisma.user.count).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.user.update).mock.calls[0][0].data.role).toBe('admin');
  });

  it('aggregates multiple field errors', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(userRow() as never);
    const err = (await updateUser('u1', { name: ' ', email: 'bad', role: 'nope' as never }).catch(
      (e: ApiError) => e,
    )) as ApiError;
    expect(err.details).toEqual([
      { field: 'name', message: 'Full name is required.' },
      { field: 'email', message: 'Invalid email format.' },
      { field: 'role', message: 'Unknown role.' },
    ]);
  });
});

describe('deleteUser', () => {
  it('throws notFound when the user does not exist', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    await expectApiError(
      () => deleteUser('missing', adminUser),
      404,
      'not_found',
      'User not found.',
    );
  });

  it('refuses deleting your own account', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(userRow({ id: adminUser.id }) as never);
    await expectApiError(
      () => deleteUser(adminUser.id, adminUser),
      400,
      'forbidden',
      'You cannot delete your own account while signed in.',
    );
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('refuses deleting the last admin', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(userRow({ role: 'admin' }) as never);
    vi.mocked(prisma.user.count).mockResolvedValue(1);

    await expectApiError(
      () => deleteUser('admin-1', adminUser),
      400,
      'forbidden',
      'At least one administrator is required.',
    );
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('allows deleting an admin when other admins remain', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(
      userRow({ role: 'admin', id: 'admin-2' }) as never,
    );
    vi.mocked(prisma.user.count).mockResolvedValue(2);
    vi.mocked(prisma.account.count).mockResolvedValue(0);
    vi.mocked(prisma.opportunity.count).mockResolvedValue(0);
    vi.mocked(prisma.task.count).mockResolvedValue(0);

    await deleteUser('admin-2', adminUser);

    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'admin-2' } });
  });

  it('refuses deleting a user who still owns accounts', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(userRow({ id: 'u2' }) as never);
    vi.mocked(prisma.account.count).mockResolvedValue(3);
    vi.mocked(prisma.opportunity.count).mockResolvedValue(0);
    vi.mocked(prisma.task.count).mockResolvedValue(0);

    await expectApiError(
      () => deleteUser('u2', adminUser),
      409,
      'in_use',
      'This user still owns accounts, deals, or tasks. Reassign their records before deleting them.',
    );
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('refuses deleting a user who still owns opportunities or tasks (not just accounts)', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(userRow({ id: 'u2' }) as never);
    vi.mocked(prisma.account.count).mockResolvedValue(0);
    vi.mocked(prisma.opportunity.count).mockResolvedValue(0);
    vi.mocked(prisma.task.count).mockResolvedValue(2);

    await expectApiError(() => deleteUser('u2', adminUser), 409, 'in_use');
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('deletes a user with no owned records', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(userRow({ id: 'u2' }) as never);
    vi.mocked(prisma.account.count).mockResolvedValue(0);
    vi.mocked(prisma.opportunity.count).mockResolvedValue(0);
    vi.mocked(prisma.task.count).mockResolvedValue(0);

    await deleteUser('u2', adminUser);

    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'u2' } });
  });
});

// ---- Pipeline stages -------------------------------------------------------

describe('createStage', () => {
  it('appends a stage after the current highest order', async () => {
    vi.mocked(prisma.stage.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.stage.aggregate).mockResolvedValue({ _max: { order: 3 } } as never);
    vi.mocked(prisma.stage.create).mockResolvedValue(
      stageRow({ order: 4, winProbability: 66 }) as never,
    );

    const stage = await createStage({
      name: 'Negotiation',
      winProbability: 66.4,
      classification: 'open',
    });

    expect(prisma.stage.create).toHaveBeenCalledWith({
      data: { name: 'Negotiation', order: 4, winProbability: 66, classification: 'open' },
    });
    expect(stage.order).toBe(4);
    expect(stage.winProbability).toBe(66); // rounded
  });

  it('starts at order 0 when there are no stages yet', async () => {
    vi.mocked(prisma.stage.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.stage.aggregate).mockResolvedValue({ _max: { order: null } } as never);
    vi.mocked(prisma.stage.create).mockResolvedValue(stageRow({ order: 0 }) as never);

    await createStage({ name: 'First' });

    expect(vi.mocked(prisma.stage.create).mock.calls[0][0].data.order).toBe(0);
  });

  it('defaults the classification to open and the probability to 0', async () => {
    vi.mocked(prisma.stage.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.stage.aggregate).mockResolvedValue({ _max: { order: null } } as never);
    vi.mocked(prisma.stage.create).mockResolvedValue(stageRow() as never);

    await createStage({ name: 'Demo', winProbability: Number.NaN });

    const data = vi.mocked(prisma.stage.create).mock.calls[0][0].data;
    expect(data.winProbability).toBe(0);
    expect(data.classification).toBe('open');
  });

  it('rejects a missing name', async () => {
    await expectApiError(() => createStage({ name: '  ' }), 400, 'validation');
    expect(prisma.stage.create).not.toHaveBeenCalled();
  });

  it('rejects a duplicate stage name case-insensitively', async () => {
    vi.mocked(prisma.stage.findFirst).mockResolvedValue(
      stageRow({ name: 'qualification' }) as never,
    );

    await expectApiError(() => createStage({ name: 'Qualification' }), 400, 'validation').catch(
      (err: ApiError) => {
        expect(err.details).toEqual([
          { field: 'name', message: 'A stage with this name already exists.' },
        ]);
        throw err;
      },
    );
    expect(prisma.stage.aggregate).not.toHaveBeenCalled();
  });

  it('rejects a probability below 0', async () => {
    await expectApiError(
      () => createStage({ name: 'X', winProbability: -1 }),
      400,
      'validation',
    ).catch((err: ApiError) => {
      expect(err.details).toEqual([
        { field: 'winProbability', message: 'Win probability must be between 0 and 100.' },
      ]);
      throw err;
    });
  });

  it('rejects a probability above 100', async () => {
    await expectApiError(() => createStage({ name: 'X', winProbability: 101 }), 400, 'validation');
  });

  it('rejects an unknown classification', async () => {
    await expectApiError(
      () => createStage({ name: 'X', classification: 'frozen' }),
      400,
      'validation',
    ).catch((err: ApiError) => {
      expect(err.details).toEqual([
        { field: 'classification', message: 'Unknown stage classification.' },
      ]);
      throw err;
    });
  });
});

describe('updateStage', () => {
  it('throws notFound when the stage does not exist', async () => {
    vi.mocked(prisma.stage.findUnique).mockResolvedValue(null);
    await expectApiError(
      () => updateStage('missing', { name: 'X' }),
      404,
      'not_found',
      'Stage not found.',
    );
  });

  it('applies partial updates without touching omitted fields', async () => {
    vi.mocked(prisma.stage.findUnique).mockResolvedValue(stageRow() as never);
    vi.mocked(prisma.stage.update).mockResolvedValue(stageRow() as never);

    await updateStage('s1', { winProbability: 80 });

    expect(prisma.stage.findFirst).not.toHaveBeenCalled(); // no name change
    expect(prisma.stage.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { winProbability: 80 },
    });
  });

  it('renames a stage and checks uniqueness excluding itself', async () => {
    vi.mocked(prisma.stage.findUnique).mockResolvedValue(stageRow() as never);
    vi.mocked(prisma.stage.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.stage.update).mockResolvedValue(stageRow({ name: 'Renamed' }) as never);

    await updateStage('s1', { name: 'Qualification' }); // same name as itself -> allowed

    expect(prisma.stage.findFirst).toHaveBeenCalledWith({
      where: { name: { equals: 'Qualification', mode: 'insensitive' }, id: { not: 's1' } },
    });
    expect(vi.mocked(prisma.stage.update).mock.calls[0][0].data.name).toBe('Qualification');
  });

  it('rejects a blank name', async () => {
    vi.mocked(prisma.stage.findUnique).mockResolvedValue(stageRow() as never);
    await expectApiError(() => updateStage('s1', { name: ' ' }), 400, 'validation');
  });

  it('rejects a name taken by another stage', async () => {
    vi.mocked(prisma.stage.findUnique).mockResolvedValue(stageRow() as never);
    vi.mocked(prisma.stage.findFirst).mockResolvedValue(stageRow({ id: 's2' }) as never);

    await expectApiError(() => updateStage('s1', { name: 'Closed Won' }), 400, 'validation');
  });

  it('rejects out-of-range probabilities', async () => {
    vi.mocked(prisma.stage.findUnique).mockResolvedValue(stageRow() as never);
    await expectApiError(() => updateStage('s1', { winProbability: -5 }), 400, 'validation');
    await expectApiError(() => updateStage('s1', { winProbability: 120 }), 400, 'validation');
    expect(prisma.stage.update).not.toHaveBeenCalled();
  });

  it('accepts boundary probabilities 0 and 100', async () => {
    vi.mocked(prisma.stage.findUnique).mockResolvedValue(stageRow() as never);
    vi.mocked(prisma.stage.update).mockResolvedValue(stageRow() as never);

    await updateStage('s1', { winProbability: 0 });
    await updateStage('s1', { winProbability: 100 });

    expect(vi.mocked(prisma.stage.update).mock.calls[0][0].data.winProbability).toBe(0);
    expect(vi.mocked(prisma.stage.update).mock.calls[1][0].data.winProbability).toBe(100);
  });

  it('rejects an unknown classification', async () => {
    vi.mocked(prisma.stage.findUnique).mockResolvedValue(stageRow() as never);
    await expectApiError(
      () => updateStage('s1', { classification: 'archived' as never }),
      400,
      'validation',
    );
  });

  it('accepts every valid classification', async () => {
    vi.mocked(prisma.stage.findUnique).mockResolvedValue(stageRow() as never);
    vi.mocked(prisma.stage.update).mockResolvedValue(stageRow() as never);

    for (const classification of ['open', 'won', 'lost'] as const) {
      await updateStage('s1', { classification });
      expect(vi.mocked(prisma.stage.update).mock.calls.at(-1)![0].data.classification).toBe(
        classification,
      );
    }
  });
});

describe('deleteStage', () => {
  it('throws notFound when the stage does not exist', async () => {
    vi.mocked(prisma.stage.findUnique).mockResolvedValue(null);
    await expectApiError(() => deleteStage('missing'), 404, 'not_found', 'Stage not found.');
  });

  it('refuses deleting a stage that still holds live deals (singular message)', async () => {
    vi.mocked(prisma.stage.findUnique).mockResolvedValue(stageRow({ name: 'Demo' }) as never);
    vi.mocked(prisma.opportunity.count).mockResolvedValue(1);

    await expectApiError(
      () => deleteStage('s1'),
      409,
      'in_use',
      'Stage "Demo" still contains 1 deal. Move or close them before deleting.',
    );
    expect(prisma.stage.delete).not.toHaveBeenCalled();
  });

  it('uses the plural form for several deals', async () => {
    vi.mocked(prisma.stage.findUnique).mockResolvedValue(stageRow({ name: 'Demo' }) as never);
    vi.mocked(prisma.opportunity.count).mockResolvedValue(4);

    await expectApiError(
      () => deleteStage('s1'),
      409,
      'in_use',
      'Stage "Demo" still contains 4 deals. Move or close them before deleting.',
    );
  });

  it('only counts non-deleted deals as occupying the stage', async () => {
    vi.mocked(prisma.stage.findUnique).mockResolvedValue(stageRow() as never);
    vi.mocked(prisma.opportunity.count).mockResolvedValue(0);

    await deleteStage('s1');

    expect(prisma.opportunity.count).toHaveBeenCalledWith({
      where: { stageId: 's1', deletedAt: null },
    });
    expect(prisma.stage.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
  });
});

describe('reorderStages', () => {
  it('rejects a list that does not match the current pipeline', async () => {
    vi.mocked(prisma.stage.findMany).mockResolvedValue([{ id: 's1' }, { id: 's2' }] as never);

    await expectApiError(
      () => reorderStages(['s1', 's3']),
      400,
      'validation',
      'Stage list does not match the current pipeline.',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a list missing a stage', async () => {
    vi.mocked(prisma.stage.findMany).mockResolvedValue([{ id: 's1' }, { id: 's2' }] as never);
    await expectApiError(() => reorderStages(['s1']), 400, 'validation');
  });

  it('assigns sequential orders inside one transaction and returns the reordered list', async () => {
    vi.mocked(prisma.stage.findMany)
      .mockResolvedValueOnce([{ id: 's2' }, { id: 's1' }] as never) // current ids
      .mockResolvedValueOnce([
        stageRow({ id: 's1', order: 0 }),
        stageRow({ id: 's2', order: 1 }),
      ] as never); // after reorder
    vi.mocked(prisma.stage.update).mockResolvedValue(stageRow() as never);

    const stages = await reorderStages(['s1', 's2']);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const ops = vi.mocked(prisma.$transaction).mock.calls[0]![0] as unknown as unknown[];
    expect(ops).toHaveLength(2);
    expect(prisma.stage.update).toHaveBeenNthCalledWith(1, {
      where: { id: 's1' },
      data: { order: 0 },
    });
    expect(prisma.stage.update).toHaveBeenNthCalledWith(2, {
      where: { id: 's2' },
      data: { order: 1 },
    });
    expect(stages.map((s) => s.id)).toEqual(['s1', 's2']);
  });
});

// ---- Trash / recovery ------------------------------------------------------

describe('listTrash', () => {
  it('queries all five collections with the 30-day cutoff and maps the rows', async () => {
    vi.mocked(prisma.contact.findMany).mockResolvedValue([contactRow()] as never);
    vi.mocked(prisma.account.findMany).mockResolvedValue([accountRow()] as never);
    vi.mocked(prisma.opportunity.findMany).mockResolvedValue([opportunityRow()] as never);
    vi.mocked(prisma.task.findMany).mockResolvedValue([taskRow()] as never);
    vi.mocked(prisma.interaction.findMany).mockResolvedValue([interactionRow()] as never);

    const trash = await listTrash();

    expect(trash.contacts).toHaveLength(1);
    expect(trash.contacts[0]).toMatchObject({ id: 'c1', firstName: 'Jane' });
    expect(trash.accounts).toHaveLength(1);
    expect(trash.accounts[0]).toMatchObject({ id: 'a1', name: 'Acme' });
    expect(trash.opportunities).toHaveLength(1);
    expect(trash.opportunities[0]).toMatchObject({ id: 'o1' });
    expect(trash.tasks).toHaveLength(1);
    expect(trash.tasks[0]).toMatchObject({ id: 't1' });
    expect(trash.interactions).toHaveLength(1);
    expect(trash.interactions[0]).toMatchObject({ id: 'i1' });

    // All five collections use the same soft-delete window (>= now - 30 days).
    const before = Date.now() - 30 * 86400000 - 60_000;
    const after = Date.now() - 30 * 86400000 + 60_000;
    const cutoffs = [
      vi.mocked(prisma.contact.findMany),
      vi.mocked(prisma.account.findMany),
      vi.mocked(prisma.opportunity.findMany),
      vi.mocked(prisma.task.findMany),
      vi.mocked(prisma.interaction.findMany),
    ].map((m) =>
      (m.mock.calls[0][0] as { where: { deletedAt: { gte: Date } } }).where.deletedAt.gte.getTime(),
    );
    for (const cutoff of cutoffs) {
      expect(cutoff).toBeGreaterThanOrEqual(before);
      expect(cutoff).toBeLessThanOrEqual(after);
    }
    // Deleted items are listed most-recently-deleted first.
    expect(prisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { deletedAt: 'desc' } }),
    );
    expect(prisma.account.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { deletedAt: 'desc' } }),
    );
  });
});

describe('restoreTrashContact', () => {
  it('throws notFound when the contact is not in the trash', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue(null);
    await expectApiError(
      () => restoreTrashContact('c1', adminUser),
      404,
      'not_found',
      'Deleted contact not found.',
    );
  });

  it('restores the contact with audit fields from the actor', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue(contactRow() as never);
    vi.mocked(prisma.contact.update).mockResolvedValue(contactRow({ deletedAt: null }) as never);

    const contact = await restoreTrashContact('c1', adminUser);

    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { deletedAt: null, updatedAt: expect.any(Date), updatedBy: 'admin-1' },
      include: { accountLinks: true },
    });
    expect(contact.deletedAt).toBeUndefined();
  });
});

describe('restoreTrashAccount', () => {
  it('throws notFound when the account is not in the trash', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue(null);
    await expectApiError(
      () => restoreTrashAccount('a1', adminUser),
      404,
      'not_found',
      'Deleted account not found.',
    );
  });

  it('restores the account with audit fields from the actor', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue(accountRow() as never);
    vi.mocked(prisma.account.update).mockResolvedValue(accountRow({ deletedAt: null }) as never);

    const account = await restoreTrashAccount('a1', adminUser);

    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { deletedAt: null, updatedAt: expect.any(Date), updatedBy: 'admin-1' },
    });
    expect(account.deletedAt).toBeUndefined();
  });
});

describe('restoreTrashOpportunity', () => {
  it('throws notFound when the opportunity is not in the trash', async () => {
    vi.mocked(prisma.opportunity.findFirst).mockResolvedValue(null);
    await expectApiError(
      () => restoreTrashOpportunity('o1', adminUser),
      404,
      'not_found',
      'Deleted opportunity not found.',
    );
  });

  it('restores the opportunity', async () => {
    vi.mocked(prisma.opportunity.findFirst).mockResolvedValue(opportunityRow() as never);
    vi.mocked(prisma.opportunity.update).mockResolvedValue(
      opportunityRow({ deletedAt: null }) as never,
    );

    await restoreTrashOpportunity('o1', adminUser);

    expect(prisma.opportunity.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { deletedAt: null, updatedAt: expect.any(Date), updatedBy: 'admin-1' },
    });
  });
});

describe('restoreTrashTask', () => {
  it('throws notFound when the task is not in the trash', async () => {
    vi.mocked(prisma.task.findFirst).mockResolvedValue(null);
    await expectApiError(
      () => restoreTrashTask('t1', adminUser),
      404,
      'not_found',
      'Deleted task not found.',
    );
  });

  it('restores the task', async () => {
    vi.mocked(prisma.task.findFirst).mockResolvedValue(taskRow() as never);
    vi.mocked(prisma.task.update).mockResolvedValue(taskRow({ deletedAt: null }) as never);

    await restoreTrashTask('t1', adminUser);

    expect(prisma.task.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { deletedAt: null, updatedAt: expect.any(Date), updatedBy: 'admin-1' },
    });
  });
});

describe('restoreTrashInteraction', () => {
  it('throws notFound when the interaction is not in the trash', async () => {
    vi.mocked(prisma.interaction.findFirst).mockResolvedValue(null);
    await expectApiError(
      () => restoreTrashInteraction('i1', adminUser),
      404,
      'not_found',
      'Deleted interaction not found.',
    );
  });

  it('restores the interaction', async () => {
    vi.mocked(prisma.interaction.findFirst).mockResolvedValue(interactionRow() as never);
    vi.mocked(prisma.interaction.update).mockResolvedValue(
      interactionRow({ deletedAt: null }) as never,
    );

    await restoreTrashInteraction('i1', adminUser);

    expect(prisma.interaction.update).toHaveBeenCalledWith({
      where: { id: 'i1' },
      data: { deletedAt: null, updatedAt: expect.any(Date), updatedBy: 'admin-1' },
    });
  });
});

describe('purgeTrashContact', () => {
  it('throws notFound when the contact is not in the trash', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue(null);
    await expectApiError(
      () => purgeTrashContact('c1'),
      404,
      'not_found',
      'Deleted contact not found.',
    );
  });

  it('refuses purging a contact with linked records', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue(contactRow() as never);
    vi.mocked(prisma.interaction.count).mockResolvedValue(2);
    vi.mocked(prisma.opportunity.count).mockResolvedValue(0);
    vi.mocked(prisma.task.count).mockResolvedValue(0);

    await expectApiError(
      () => purgeTrashContact('c1'),
      409,
      'in_use',
      'This contact still has linked interactions, deals, or tasks. Permanently delete or reassign those records first.',
    );
    expect(prisma.contact.delete).not.toHaveBeenCalled();
  });

  it('permanently deletes a contact with no linked records', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue(contactRow() as never);
    vi.mocked(prisma.interaction.count).mockResolvedValue(0);
    vi.mocked(prisma.opportunity.count).mockResolvedValue(0);
    vi.mocked(prisma.task.count).mockResolvedValue(0);

    await purgeTrashContact('c1');

    expect(prisma.contact.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });
});

describe('purgeTrashAccount', () => {
  it('throws notFound when the account is not in the trash', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue(null);
    await expectApiError(
      () => purgeTrashAccount('a1'),
      404,
      'not_found',
      'Deleted account not found.',
    );
  });

  it('refuses purging an account with any linked records (contacts, deals, tasks, interactions)', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue(accountRow() as never);
    // Only the contact link count is non-zero — every check must run.
    vi.mocked(prisma.contactAccountLink.count).mockResolvedValue(1);
    vi.mocked(prisma.opportunity.count).mockResolvedValue(0);
    vi.mocked(prisma.task.count).mockResolvedValue(0);
    vi.mocked(prisma.interaction.count).mockResolvedValue(0);

    await expectApiError(
      () => purgeTrashAccount('a1'),
      409,
      'in_use',
      'This account still has linked contacts, deals, interactions, or tasks. Permanently delete or reassign those records first.',
    );
    expect(prisma.account.delete).not.toHaveBeenCalled();

    // Same for a linked task only.
    vi.clearAllMocks();
    vi.mocked(prisma.account.findFirst).mockResolvedValue(accountRow() as never);
    vi.mocked(prisma.contactAccountLink.count).mockResolvedValue(0);
    vi.mocked(prisma.opportunity.count).mockResolvedValue(0);
    vi.mocked(prisma.task.count).mockResolvedValue(1);
    vi.mocked(prisma.interaction.count).mockResolvedValue(0);
    await expectApiError(() => purgeTrashAccount('a1'), 409, 'in_use');
    expect(prisma.account.delete).not.toHaveBeenCalled();
  });

  it('permanently deletes an account with no linked records', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue(accountRow() as never);
    vi.mocked(prisma.contactAccountLink.count).mockResolvedValue(0);
    vi.mocked(prisma.opportunity.count).mockResolvedValue(0);
    vi.mocked(prisma.task.count).mockResolvedValue(0);
    vi.mocked(prisma.interaction.count).mockResolvedValue(0);

    await purgeTrashAccount('a1');

    expect(prisma.account.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
  });
});

describe('purgeTrashOpportunity', () => {
  it('throws notFound when the opportunity is not in the trash', async () => {
    vi.mocked(prisma.opportunity.findFirst).mockResolvedValue(null);
    await expectApiError(
      () => purgeTrashOpportunity('o1'),
      404,
      'not_found',
      'Deleted opportunity not found.',
    );
  });

  it('refuses purging a deal with linked interactions or tasks', async () => {
    vi.mocked(prisma.opportunity.findFirst).mockResolvedValue(opportunityRow() as never);
    vi.mocked(prisma.interaction.count).mockResolvedValue(0);
    vi.mocked(prisma.task.count).mockResolvedValue(2);

    await expectApiError(
      () => purgeTrashOpportunity('o1'),
      409,
      'in_use',
      'This deal still has linked interactions or tasks. Permanently delete or reassign those records first.',
    );
    expect(prisma.opportunity.delete).not.toHaveBeenCalled();
  });

  it('permanently deletes a deal with no linked records', async () => {
    vi.mocked(prisma.opportunity.findFirst).mockResolvedValue(opportunityRow() as never);
    vi.mocked(prisma.interaction.count).mockResolvedValue(0);
    vi.mocked(prisma.task.count).mockResolvedValue(0);

    await purgeTrashOpportunity('o1');

    expect(prisma.opportunity.delete).toHaveBeenCalledWith({ where: { id: 'o1' } });
  });
});

describe('purgeTrashTask', () => {
  it('throws notFound when the task is not in the trash', async () => {
    vi.mocked(prisma.task.findFirst).mockResolvedValue(null);
    await expectApiError(() => purgeTrashTask('t1'), 404, 'not_found', 'Deleted task not found.');
  });

  it('refuses purging a task with linked interactions', async () => {
    vi.mocked(prisma.task.findFirst).mockResolvedValue(taskRow() as never);
    vi.mocked(prisma.interaction.count).mockResolvedValue(1);

    await expectApiError(
      () => purgeTrashTask('t1'),
      409,
      'in_use',
      'This task still has linked interactions. Permanently delete or reassign those records first.',
    );
    expect(prisma.task.delete).not.toHaveBeenCalled();
  });

  it('permanently deletes a task with no linked interactions', async () => {
    vi.mocked(prisma.task.findFirst).mockResolvedValue(taskRow() as never);
    vi.mocked(prisma.interaction.count).mockResolvedValue(0);

    await purgeTrashTask('t1');

    expect(prisma.task.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
  });
});

describe('purgeTrashInteraction', () => {
  it('throws notFound when the interaction is not in the trash', async () => {
    vi.mocked(prisma.interaction.findFirst).mockResolvedValue(null);
    await expectApiError(
      () => purgeTrashInteraction('i1'),
      404,
      'not_found',
      'Deleted interaction not found.',
    );
  });

  it('permanently deletes the interaction (no referential checks needed)', async () => {
    vi.mocked(prisma.interaction.findFirst).mockResolvedValue(interactionRow() as never);

    await purgeTrashInteraction('i1');

    expect(prisma.interaction.delete).toHaveBeenCalledWith({ where: { id: 'i1' } });
  });
});

// ---- Error-factory sanity (guards the envelope contract used above) --------

describe('error envelope contract', () => {
  it('errors.inUse produces a 409 ApiError', () => {
    const err = errors.inUse('busy');
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.code).toBe('in_use');
  });
});

// Keep the Mock type import used for casts in assertions.
export type { Mock };
