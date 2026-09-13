// Unit tests for the opportunity service (FR-SP-04/05, FR-CC-02/05/13).
// Pure unit tests: the Prisma client is mocked at the module boundary, so no
// database is required. Covers owner-scoped listing, get + stage history,
// create validation + probability rule, optimistic-concurrency updates,
// permission checks, soft delete, and Kanban stage transitions.
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  canViewOpportunity,
  createOpportunity,
  getOpportunity,
  listOpportunities,
  moveOpportunityStage,
  softDeleteOpportunity,
  updateOpportunity,
} from '../../../src/services/opportunity-service.ts';
import type { User } from '../../../src/types/domain.ts';

vi.mock('../../../src/db.ts', () => ({
  prisma: {
    opportunity: {
      count: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    stageHistory: { findMany: vi.fn(), create: vi.fn() },
    stage: { findFirst: vi.fn(), findUnique: vi.fn() },
    account: { findFirst: vi.fn() },
    contact: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));

// The mocked db module replaces the real one, so config/env is never loaded.
const { prisma } = (await import('../../../src/db.ts')) as unknown as {
  prisma: Record<string, Record<string, Mock>> & { $transaction: Mock };
};

const admin: User = { id: 'u1', name: 'Admin', email: 'admin@example.com', role: 'admin' };
const manager: User = { id: 'u3', name: 'Manager', email: 'manager@example.com', role: 'manager' };
const rep: User = { id: 'u2', name: 'Rep', email: 'rep@example.com', role: 'rep' };
const readonlyUser: User = {
  id: 'u4',
  name: 'Viewer',
  email: 'viewer@example.com',
  role: 'readonly',
};

const NOW = new Date('2026-01-15T10:00:00.000Z');

function oppRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'o1',
    name: 'Big Deal',
    contactId: null,
    accountId: 'a1',
    valueMinor: 500000,
    currency: 'USD',
    expectedCloseDate: new Date('2026-03-01T00:00:00.000Z'),
    stageId: 's1',
    probability: 60,
    probabilityManual: false,
    ownerId: 'u2',
    description: null,
    lossReason: null,
    createdAt: NOW,
    createdBy: 'u2',
    updatedAt: NOW,
    updatedBy: 'u2',
    deletedAt: null,
    ...overrides,
  };
}

function stageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 's2',
    name: 'Negotiation',
    order: 3,
    winProbability: 75,
    classification: 'open',
    ...overrides,
  };
}

function historyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'h1',
    opportunityId: 'o1',
    fromStageId: null,
    toStageId: 's1',
    userId: 'u2',
    timestamp: NOW,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default $transaction implementation: run the callback with the mock itself as tx.
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
});

describe('listOpportunities', () => {
  it('shows everything to admin, ordered by updatedAt desc, with a total', async () => {
    prisma.opportunity.findMany.mockResolvedValue([oppRow()]);
    prisma.opportunity.count.mockResolvedValue(1);

    const result = await listOpportunities(admin, {});

    expect(prisma.opportunity.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    });
    expect(prisma.opportunity.count).toHaveBeenCalledWith({ where: { deletedAt: null } });
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 'o1',
      name: 'Big Deal',
      ownerId: 'u2',
      expectedCloseDate: '2026-03-01',
      updatedAt: NOW.toISOString(),
    });
  });

  it('scopes reps to their own opportunities (FR-CC-02)', async () => {
    prisma.opportunity.findMany.mockResolvedValue([]);
    prisma.opportunity.count.mockResolvedValue(0);

    await listOpportunities(rep, {});

    expect(prisma.opportunity.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null, ownerId: 'u2' },
      orderBy: { updatedAt: 'desc' },
    });
  });

  it('ignores an owner filter requested by a rep', async () => {
    prisma.opportunity.findMany.mockResolvedValue([]);
    prisma.opportunity.count.mockResolvedValue(0);

    await listOpportunities(rep, { owner: 'u1' });

    const { where } = prisma.opportunity.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(where).toEqual({ deletedAt: null, ownerId: 'u2' });
  });

  it('applies an owner filter for privileged roles', async () => {
    prisma.opportunity.findMany.mockResolvedValue([]);
    prisma.opportunity.count.mockResolvedValue(0);

    await listOpportunities(admin, { owner: 'u9' });

    expect(prisma.opportunity.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null, ownerId: 'u9' },
      orderBy: { updatedAt: 'desc' },
    });
  });

  it('applies the stage filter when provided', async () => {
    prisma.opportunity.findMany.mockResolvedValue([]);
    prisma.opportunity.count.mockResolvedValue(0);

    await listOpportunities(manager, { stage: 's3' });

    expect(prisma.opportunity.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null, stageId: 's3' },
      orderBy: { updatedAt: 'desc' },
    });
  });

  it('ignores a whitespace-only stage filter', async () => {
    prisma.opportunity.findMany.mockResolvedValue([]);
    prisma.opportunity.count.mockResolvedValue(0);

    await listOpportunities(admin, { stage: '   ' });

    expect(prisma.opportunity.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    });
  });
});

describe('canViewOpportunity', () => {
  it('allows privileged roles to view any opportunity', async () => {
    await expect(canViewOpportunity(admin, 'someone-else')).resolves.toBe(true);
    await expect(canViewOpportunity(manager, 'someone-else')).resolves.toBe(true);
    await expect(canViewOpportunity(readonlyUser, 'someone-else')).resolves.toBe(true);
  });

  it('allows a rep to view their own and denies others', async () => {
    await expect(canViewOpportunity(rep, 'u2')).resolves.toBe(true);
    await expect(canViewOpportunity(rep, 'u9')).resolves.toBe(false);
  });
});

describe('getOpportunity', () => {
  it('returns the serialized opportunity with its stage history', async () => {
    prisma.opportunity.findFirst.mockResolvedValue(oppRow());
    prisma.stageHistory.findMany.mockResolvedValue([
      historyRow({ fromStageId: 's1', toStageId: 's2' }),
      historyRow(),
    ]);

    const result = await getOpportunity('o1', readonlyUser);

    expect(prisma.opportunity.findFirst).toHaveBeenCalledWith({
      where: { id: 'o1', deletedAt: null },
    });
    expect(prisma.stageHistory.findMany).toHaveBeenCalledWith({
      where: { opportunityId: 'o1' },
      orderBy: { timestamp: 'desc' },
    });
    expect(result).toMatchObject({ id: 'o1', stageId: 's1' });
    expect(result.history).toEqual([
      {
        id: 'h1',
        opportunityId: 'o1',
        fromStageId: 's1',
        toStageId: 's2',
        userId: 'u2',
        timestamp: NOW.toISOString(),
      },
      {
        id: 'h1',
        opportunityId: 'o1',
        fromStageId: null,
        toStageId: 's1',
        userId: 'u2',
        timestamp: NOW.toISOString(),
      },
    ]);
  });

  it('throws 404 not_found when the opportunity does not exist', async () => {
    prisma.opportunity.findFirst.mockResolvedValue(null);

    await expect(getOpportunity('missing', admin)).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
      message: 'Opportunity not found.',
    });
  });

  it("hides other reps' opportunities behind a 404 for a rep (FR-CC-02)", async () => {
    prisma.opportunity.findFirst.mockResolvedValue(oppRow({ ownerId: 'u9' }));

    await expect(getOpportunity('o1', rep)).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    });
    expect(prisma.stageHistory.findMany).not.toHaveBeenCalled();
  });
});

describe('createOpportunity', () => {
  it('requires name and account, reporting both fields at once', async () => {
    const err = await createOpportunity({}, admin).catch((e) => e);
    expect(err.status).toBe(400);
    expect(err.code).toBe('validation');
    expect(err.details).toEqual([
      { field: 'name', message: 'Name is required.' },
      { field: 'accountId', message: 'Account is required.' },
    ]);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects whitespace-only name / accountId', async () => {
    const err = await createOpportunity({ name: '   ', accountId: '\t' }, admin).catch((e) => e);
    expect(err.details).toEqual([
      { field: 'name', message: 'Name is required.' },
      { field: 'accountId', message: 'Account is required.' },
    ]);
  });

  it('rejects an unknown or soft-deleted account', async () => {
    prisma.account.findFirst.mockResolvedValue(null);

    const err = await createOpportunity({ name: 'Deal', accountId: 'aX' }, admin).catch((e) => e);
    expect(err.details).toEqual([{ field: 'accountId', message: 'Account is required.' }]);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an unknown contact when contactId is provided', async () => {
    prisma.account.findFirst.mockResolvedValue({ id: 'a1' });
    prisma.contact.findFirst.mockResolvedValue(null);

    const err = await createOpportunity(
      { name: 'Deal', accountId: 'a1', contactId: 'cX' },
      admin,
    ).catch((e) => e);
    expect(err.details).toEqual([{ field: 'contactId', message: 'Contact not found.' }]);
  });

  it('skips contact resolution when contactId is omitted or blank', async () => {
    prisma.account.findFirst.mockResolvedValue({ id: 'a1' });
    prisma.stage.findFirst.mockResolvedValue(stageRow({ id: 's1' }));
    prisma.stage.findUnique.mockResolvedValue(stageRow({ id: 's1' }));
    prisma.opportunity.create.mockResolvedValue(oppRow());

    await createOpportunity({ name: 'Deal', accountId: 'a1', contactId: '   ' }, admin);

    expect(prisma.contact.findFirst).not.toHaveBeenCalled();
  });

  it('rejects the request when no open stage exists and none was requested', async () => {
    prisma.account.findFirst.mockResolvedValue({ id: 'a1' });
    prisma.stage.findFirst.mockResolvedValue(null);

    const err = await createOpportunity({ name: 'Deal', accountId: 'a1' }, admin).catch((e) => e);
    expect(err.details).toEqual([{ field: 'stageId', message: 'A pipeline stage is required.' }]);
  });

  it('rejects an unknown requested stage with a bad request', async () => {
    prisma.account.findFirst.mockResolvedValue({ id: 'a1' });
    prisma.stage.findUnique.mockResolvedValue(null);

    const err = await createOpportunity(
      { name: 'Deal', accountId: 'a1', stageId: 'sX' },
      admin,
    ).catch((e) => e);
    expect(err.status).toBe(400);
    expect(err.code).toBe('validation');
    expect(err.message).toBe('Unknown stage.');
  });

  it('creates with defaults: open stage, stage probability, USD, today close date, actor as owner', async () => {
    prisma.account.findFirst.mockResolvedValue({ id: 'a1' });
    prisma.stage.findFirst.mockResolvedValue(stageRow({ id: 's1', winProbability: 60 }));
    prisma.stage.findUnique.mockResolvedValue(stageRow({ id: 's1', winProbability: 60 }));
    prisma.opportunity.create.mockResolvedValue(oppRow());

    const opp = await createOpportunity({ name: '  Deal  ', accountId: 'a1' }, rep);

    expect(prisma.stage.findFirst).toHaveBeenCalledWith({
      where: { classification: 'open' },
      orderBy: { order: 'asc' },
    });
    expect(prisma.opportunity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Deal',
        contactId: null,
        accountId: 'a1',
        valueMinor: 0, // Number(undefined) -> NaN -> 0
        currency: 'USD',
        expectedCloseDate: expect.any(Date),
        stageId: 's1',
        probability: 60, // stage default
        probabilityManual: false,
        ownerId: 'u2', // actor
        createdBy: 'u2',
        updatedBy: 'u2',
      }),
    });
    expect(prisma.stageHistory.create).toHaveBeenCalledWith({
      data: {
        opportunityId: 'o1',
        fromStageId: null,
        toStageId: 's1',
        userId: 'u2',
        timestamp: expect.any(Date),
      },
    });
    expect(opp).toMatchObject({ id: 'o1', stageId: 's1', probability: 60 });
  });

  it('honors explicit stageId, owner and contact', async () => {
    prisma.account.findFirst.mockResolvedValue({ id: 'a1' });
    prisma.contact.findFirst.mockResolvedValue({ id: 'c1' });
    prisma.stage.findUnique.mockResolvedValue(stageRow({ id: 's2' }));
    prisma.opportunity.create.mockResolvedValue(oppRow());

    await createOpportunity(
      { name: 'Deal', accountId: 'a1', contactId: 'c1', stageId: 's2', ownerId: 'u9' },
      admin,
    );

    expect(prisma.stage.findFirst).not.toHaveBeenCalled(); // no default lookup
    expect(prisma.opportunity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stageId: 's2', ownerId: 'u9', contactId: 'c1' }),
      }),
    );
  });

  it.each([
    [150, 100], // clamped high
    [-5, 0], // clamped low
    [49.6, 50], // rounded
  ])('clamps/rounds a manual probability %s to %s and marks it manual', async (input, expected) => {
    prisma.account.findFirst.mockResolvedValue({ id: 'a1' });
    prisma.stage.findFirst.mockResolvedValue(stageRow({ id: 's1', winProbability: 60 }));
    prisma.stage.findUnique.mockResolvedValue(stageRow({ id: 's1', winProbability: 60 }));
    prisma.opportunity.create.mockResolvedValue(oppRow());

    await createOpportunity({ name: 'Deal', accountId: 'a1', probability: input }, admin);

    expect(prisma.opportunity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ probability: expected, probabilityManual: true }),
      }),
    );
  });

  it('rounds a numeric-string probability but does not auto-mark it manual (string input)', async () => {
    prisma.account.findFirst.mockResolvedValue({ id: 'a1' });
    prisma.stage.findFirst.mockResolvedValue(stageRow({ id: 's1', winProbability: 60 }));
    prisma.stage.findUnique.mockResolvedValue(stageRow({ id: 's1', winProbability: 60 }));
    prisma.opportunity.create.mockResolvedValue(oppRow());

    await createOpportunity({ name: 'Deal', accountId: 'a1', probability: '42' }, admin);

    expect(prisma.opportunity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ probability: 42, probabilityManual: false }),
      }),
    );
  });

  it('falls back to the stage probability for a non-finite probability input', async () => {
    prisma.account.findFirst.mockResolvedValue({ id: 'a1' });
    prisma.stage.findFirst.mockResolvedValue(stageRow({ id: 's1', winProbability: 60 }));
    prisma.stage.findUnique.mockResolvedValue(stageRow({ id: 's1', winProbability: 60 }));
    prisma.opportunity.create.mockResolvedValue(oppRow());

    await createOpportunity({ name: 'Deal', accountId: 'a1', probability: 'abc' }, admin);

    expect(prisma.opportunity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ probability: 60, probabilityManual: false }),
      }),
    );
  });

  it('marks probabilityManual when explicitly requested even if the value matches the stage', async () => {
    prisma.account.findFirst.mockResolvedValue({ id: 'a1' });
    prisma.stage.findFirst.mockResolvedValue(stageRow({ id: 's1', winProbability: 60 }));
    prisma.stage.findUnique.mockResolvedValue(stageRow({ id: 's1', winProbability: 60 }));
    prisma.opportunity.create.mockResolvedValue(oppRow());

    await createOpportunity(
      { name: 'Deal', accountId: 'a1', probability: 60, probabilityManual: true },
      admin,
    );

    expect(prisma.opportunity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ probability: 60, probabilityManual: true }),
      }),
    );
  });

  it('truncates valueMinor and parses the expected close date', async () => {
    prisma.account.findFirst.mockResolvedValue({ id: 'a1' });
    prisma.stage.findFirst.mockResolvedValue(stageRow({ id: 's1', winProbability: 60 }));
    prisma.stage.findUnique.mockResolvedValue(stageRow({ id: 's1', winProbability: 60 }));
    prisma.opportunity.create.mockResolvedValue(oppRow());

    await createOpportunity(
      { name: 'Deal', accountId: 'a1', valueMinor: '12345.9', expectedCloseDate: '2026-06-30' },
      admin,
    );

    expect(prisma.opportunity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          valueMinor: 12345,
          expectedCloseDate: new Date('2026-06-30T00:00:00.000Z'),
        }),
      }),
    );
  });

  it('falls back to today for an invalid expectedCloseDate', async () => {
    prisma.account.findFirst.mockResolvedValue({ id: 'a1' });
    prisma.stage.findFirst.mockResolvedValue(stageRow({ id: 's1', winProbability: 60 }));
    prisma.stage.findUnique.mockResolvedValue(stageRow({ id: 's1', winProbability: 60 }));
    prisma.opportunity.create.mockResolvedValue(oppRow());

    await createOpportunity(
      { name: 'Deal', accountId: 'a1', expectedCloseDate: 'not-a-date' },
      admin,
    );

    const data = (
      prisma.opportunity.create.mock.calls[0][0] as { data: { expectedCloseDate: Date } }
    ).data;
    const today = new Date();
    expect(data.expectedCloseDate).toEqual(
      new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())),
    );
  });
});

describe('updateOpportunity', () => {
  const existing = oppRow({ updatedAt: new Date('2026-01-10T09:00:00.000Z') });

  it('throws 404 when the opportunity does not exist', async () => {
    prisma.opportunity.findFirst.mockResolvedValue(null);

    await expect(updateOpportunity('missing', { name: 'X' }, admin)).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
      message: 'Opportunity not found.',
    });
  });

  it('throws 409 conflict on an updatedAt token mismatch (FR-CC-13)', async () => {
    prisma.opportunity.findFirst.mockResolvedValue(existing);

    await expect(
      updateOpportunity('o1', { name: 'X', updatedAt: '2020-01-01T00:00:00.000Z' }, admin),
    ).rejects.toMatchObject({ status: 409, code: 'conflict' });
    expect(prisma.opportunity.update).not.toHaveBeenCalled();
  });

  it('skips the conflict check when no updatedAt token is sent', async () => {
    prisma.opportunity.findFirst.mockResolvedValue(existing);
    prisma.account.findFirst.mockResolvedValue({ id: 'a1' });
    prisma.opportunity.update.mockResolvedValue(existing);

    await updateOpportunity('o1', { name: 'X' }, admin);

    expect(prisma.opportunity.update).toHaveBeenCalled();
  });

  it("forbids a rep from modifying another user's opportunity", async () => {
    prisma.opportunity.findFirst.mockResolvedValue(oppRow({ ownerId: 'u9' }));

    await expect(updateOpportunity('o1', { name: 'X' }, rep)).rejects.toMatchObject({
      status: 403,
      code: 'forbidden',
    });
    expect(prisma.opportunity.update).not.toHaveBeenCalled();
  });

  it('allows a rep to modify their own opportunity and readonly users to be blocked', async () => {
    prisma.opportunity.findFirst.mockResolvedValue(existing);
    prisma.account.findFirst.mockResolvedValue({ id: 'a1' });
    prisma.opportunity.update.mockResolvedValue(existing);

    await updateOpportunity('o1', { name: 'X' }, rep);
    expect(prisma.opportunity.update).toHaveBeenCalled();

    // readonly has no mutation rights: not admin/manager and not the owner.
    await expect(updateOpportunity('o1', { name: 'Y' }, readonlyUser)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('keeps manager/admin mutation rights on any record', async () => {
    prisma.opportunity.findFirst.mockResolvedValue(oppRow({ ownerId: 'u9' }));
    prisma.account.findFirst.mockResolvedValue({ id: 'a1' });
    prisma.opportunity.update.mockResolvedValue(oppRow({ name: 'X', ownerId: 'u9' }));

    await updateOpportunity('o1', { name: 'X' }, manager);

    expect(prisma.opportunity.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'X' }) }),
    );
  });

  it('rejects a merged result with no name', async () => {
    // An existing record with a blank name (bad data) plus a whitespace-only
    // body value: optionalString yields undefined -> merged name is '' -> invalid.
    prisma.opportunity.findFirst.mockResolvedValue(oppRow({ name: '' }));

    await expect(updateOpportunity('o1', { name: '  ' }, admin)).rejects.toMatchObject({
      status: 400,
      code: 'validation',
      details: [{ field: 'name', message: 'Name is required.' }],
    });
  });

  it('rejects an unknown account after merging', async () => {
    prisma.opportunity.findFirst.mockResolvedValue(existing);
    prisma.account.findFirst.mockResolvedValue(null);

    await expect(
      updateOpportunity('o1', { name: 'X', accountId: 'aX' }, admin),
    ).rejects.toMatchObject({
      status: 400,
      code: 'validation',
      details: [{ field: 'accountId', message: 'Account is required.' }],
    });
  });

  it('merges partial input over existing values and stamps updatedBy/updatedAt', async () => {
    prisma.opportunity.findFirst.mockResolvedValue(existing);
    prisma.account.findFirst.mockResolvedValue({ id: 'a1' });
    prisma.opportunity.update.mockResolvedValue(oppRow({ description: 'Updated' }));

    const opp = await updateOpportunity(
      'o1',
      { description: 'Updated', valueMinor: '999.5' },
      admin,
    );

    expect(prisma.opportunity.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: expect.objectContaining({
        name: 'Big Deal', // unchanged
        accountId: 'a1',
        contactId: null,
        valueMinor: 999, // truncated when provided
        currency: 'USD',
        probability: 60, // unchanged
        probabilityManual: false, // unchanged
        ownerId: 'u2',
        description: 'Updated', // changed
        updatedBy: 'u1',
        updatedAt: expect.any(Date),
      }),
    });
    expect(opp.description).toBe('Updated');
  });

  it('keeps existing valueMinor when not provided', async () => {
    prisma.opportunity.findFirst.mockResolvedValue(existing);
    prisma.account.findFirst.mockResolvedValue({ id: 'a1' });
    prisma.opportunity.update.mockResolvedValue(existing);

    await updateOpportunity('o1', { name: 'X' }, admin);

    expect(prisma.opportunity.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ valueMinor: 500000 }) }),
    );
  });

  it('coerces a non-numeric provided valueMinor to 0', async () => {
    prisma.opportunity.findFirst.mockResolvedValue(existing);
    prisma.account.findFirst.mockResolvedValue({ id: 'a1' });
    prisma.opportunity.update.mockResolvedValue(existing);

    await updateOpportunity('o1', { valueMinor: 'abc' }, admin);

    expect(prisma.opportunity.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ valueMinor: 0 }) }),
    );
  });

  it('rounds/clamps a provided probability and re-derives probabilityManual', async () => {
    prisma.opportunity.findFirst.mockResolvedValue(existing);
    prisma.account.findFirst.mockResolvedValue({ id: 'a1' });
    prisma.opportunity.update.mockResolvedValue(
      oppRow({ probability: 100, probabilityManual: true }),
    );

    await updateOpportunity('o1', { probability: 150 }, admin);

    expect(prisma.opportunity.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ probability: 100, probabilityManual: true }), // 150 != 60 -> manual
      }),
    );
  });

  it('does not mark manual when the provided probability equals the current one', async () => {
    prisma.opportunity.findFirst.mockResolvedValue(existing);
    prisma.account.findFirst.mockResolvedValue({ id: 'a1' });
    prisma.opportunity.update.mockResolvedValue(existing);

    await updateOpportunity('o1', { probability: 60 }, admin);

    expect(prisma.opportunity.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ probability: 60, probabilityManual: false }),
      }),
    );
  });

  it('honors an explicit probabilityManual=false and parses/keeps the close date', async () => {
    prisma.opportunity.findFirst.mockResolvedValue(existing);
    prisma.account.findFirst.mockResolvedValue({ id: 'a1' });
    prisma.opportunity.update.mockResolvedValue(existing);

    await updateOpportunity(
      'o1',
      { probabilityManual: false, expectedCloseDate: '2026-09-01' },
      admin,
    );

    expect(prisma.opportunity.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          probabilityManual: false,
          expectedCloseDate: new Date('2026-09-01T00:00:00.000Z'),
        }),
      }),
    );
  });

  it('keeps the existing close date for an invalid provided one and nulls an empty lossReason', async () => {
    prisma.opportunity.findFirst.mockResolvedValue(
      oppRow({ expectedCloseDate: existing.expectedCloseDate, lossReason: 'Priced out' }),
    );
    prisma.account.findFirst.mockResolvedValue({ id: 'a1' });
    prisma.opportunity.update.mockResolvedValue(existing);

    await updateOpportunity('o1', { expectedCloseDate: 'bogus', lossReason: '  ' }, admin);

    expect(prisma.opportunity.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          expectedCloseDate: existing.expectedCloseDate,
          lossReason: null,
        }),
      }),
    );
  });
});

describe('softDeleteOpportunity', () => {
  it('throws 404 when the opportunity does not exist', async () => {
    prisma.opportunity.findFirst.mockResolvedValue(null);

    await expect(softDeleteOpportunity('missing', admin)).rejects.toMatchObject({
      status: 404,
      message: 'Opportunity not found.',
    });
    expect(prisma.opportunity.update).not.toHaveBeenCalled();
  });

  it("forbids a rep from deleting another user's opportunity (FR-CC-02)", async () => {
    prisma.opportunity.findFirst.mockResolvedValue(oppRow({ ownerId: 'u9' }));

    await expect(softDeleteOpportunity('o1', rep)).rejects.toMatchObject({
      status: 403,
      code: 'forbidden',
    });
    expect(prisma.opportunity.update).not.toHaveBeenCalled();
  });

  it('stamps deletedAt/updatedAt/updatedBy (FR-CC-05)', async () => {
    prisma.opportunity.findFirst.mockResolvedValue(oppRow());
    prisma.opportunity.update.mockResolvedValue(oppRow({ deletedAt: NOW }));

    await softDeleteOpportunity('o1', rep);

    expect(prisma.opportunity.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { deletedAt: expect.any(Date), updatedAt: expect.any(Date), updatedBy: 'u2' },
    });
  });
});

describe('moveOpportunityStage', () => {
  it('throws 404 when the opportunity does not exist', async () => {
    prisma.opportunity.findFirst.mockResolvedValue(null);

    await expect(moveOpportunityStage('missing', { toStageId: 's2' }, admin)).rejects.toMatchObject(
      {
        status: 404,
        code: 'not_found',
      },
    );
  });

  it("forbids a rep from moving another user's opportunity", async () => {
    prisma.opportunity.findFirst.mockResolvedValue(oppRow({ ownerId: 'u9' }));

    await expect(moveOpportunityStage('o1', { toStageId: 's2' }, rep)).rejects.toMatchObject({
      status: 403,
      code: 'forbidden',
    });
  });

  it('rejects a missing or whitespace-only toStageId', async () => {
    prisma.opportunity.findFirst.mockResolvedValue(oppRow());

    for (const toStageId of [undefined, '   ']) {
      await expect(moveOpportunityStage('o1', { toStageId }, admin)).rejects.toMatchObject({
        status: 400,
        message: 'Unknown stage.',
      });
    }
    expect(prisma.stage.findUnique).not.toHaveBeenCalled();
  });

  it('rejects an unknown toStageId', async () => {
    prisma.opportunity.findFirst.mockResolvedValue(oppRow());
    prisma.stage.findUnique.mockResolvedValue(null);

    await expect(moveOpportunityStage('o1', { toStageId: 'sX' }, admin)).rejects.toMatchObject({
      status: 400,
      message: 'Unknown stage.',
    });
  });

  it('applies the target stage probability by default and records the history (FR-SP-04/05)', async () => {
    prisma.opportunity.findFirst.mockResolvedValue(oppRow({ stageId: 's1' }));
    prisma.stage.findUnique.mockResolvedValue(stageRow({ id: 's2', winProbability: 75 }));
    prisma.opportunity.update.mockResolvedValue(oppRow({ stageId: 's2', probability: 75 }));

    const opp = await moveOpportunityStage('o1', { toStageId: 's2' }, rep);

    expect(prisma.opportunity.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: expect.objectContaining({
        stageId: 's2',
        probability: 75,
        probabilityManual: false,
        lossReason: null,
        updatedBy: 'u2',
        updatedAt: expect.any(Date),
      }),
    });
    expect(prisma.stageHistory.create).toHaveBeenCalledWith({
      data: {
        opportunityId: 'o1',
        fromStageId: 's1',
        toStageId: 's2',
        userId: 'u2',
        timestamp: expect.any(Date),
      },
    });
    expect(opp.stageId).toBe('s2');
  });

  it('keeps the existing probability when probabilityChoice is "keep"', async () => {
    prisma.opportunity.findFirst.mockResolvedValue(oppRow({ probability: 60 }));
    prisma.stage.findUnique.mockResolvedValue(stageRow({ id: 's2', winProbability: 75 }));
    prisma.opportunity.update.mockResolvedValue(oppRow({ stageId: 's2' }));

    await moveOpportunityStage('o1', { toStageId: 's2', probabilityChoice: 'keep' }, rep);

    expect(prisma.opportunity.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ probability: 60, probabilityManual: true }),
      }),
    );
  });

  it('requires a lossReason default for a lost stage and uses the provided one (FR-SP-04)', async () => {
    prisma.opportunity.findFirst.mockResolvedValue(oppRow({ stageId: 's1' }));
    prisma.stage.findUnique.mockResolvedValue(
      stageRow({ id: 'sL', classification: 'lost', winProbability: 0 }),
    );

    for (const [bodyLossReason, expected] of [
      ['Competitor won', 'Competitor won'],
      [undefined, ''], // falls back to existing (null) -> ''
    ] as const) {
      vi.clearAllMocks();
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
      prisma.opportunity.findFirst.mockResolvedValue(oppRow({ stageId: 's1' }));
      prisma.stage.findUnique.mockResolvedValue(
        stageRow({ id: 'sL', classification: 'lost', winProbability: 0 }),
      );
      prisma.opportunity.update.mockResolvedValue(oppRow({ stageId: 'sL' }));

      await moveOpportunityStage('o1', { toStageId: 'sL', lossReason: bodyLossReason }, rep);

      expect(prisma.opportunity.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ stageId: 'sL', probability: 0, lossReason: expected }),
        }),
      );
    }
  });

  it('keeps an existing lossReason when moving to a lost stage without providing one', async () => {
    prisma.opportunity.findFirst.mockResolvedValue(
      oppRow({ stageId: 's1', lossReason: 'Priced out' }),
    );
    prisma.stage.findUnique.mockResolvedValue(
      stageRow({ id: 'sL', classification: 'lost', winProbability: 0 }),
    );
    prisma.opportunity.update.mockResolvedValue(oppRow({ stageId: 'sL' }));

    await moveOpportunityStage('o1', { toStageId: 'sL' }, rep);

    expect(prisma.opportunity.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lossReason: 'Priced out' }),
      }),
    );
  });

  it('clears the lossReason when moving to a non-lost stage', async () => {
    prisma.opportunity.findFirst.mockResolvedValue(
      oppRow({ stageId: 's1', lossReason: 'Priced out' }),
    );
    prisma.stage.findUnique.mockResolvedValue(
      stageRow({ id: 's2', classification: 'won', winProbability: 100 }),
    );
    prisma.opportunity.update.mockResolvedValue(oppRow({ stageId: 's2' }));

    await moveOpportunityStage('o1', { toStageId: 's2' }, rep);

    expect(prisma.opportunity.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stageId: 's2', probability: 100, lossReason: null }),
      }),
    );
  });
});

describe('error envelope sanity', () => {
  it('thrown errors are ApiError instances from the shared factory', async () => {
    prisma.opportunity.findFirst.mockResolvedValue(null);
    const err = await getOpportunity('x', admin).catch((e) => e);
    expect(err.name).toBe('ApiError');
    expect(err.status).toBe(404);
  });
});
