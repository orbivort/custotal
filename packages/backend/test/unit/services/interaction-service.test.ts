// Unit tests for the interaction service (FR-IT-01..04).
// Pure unit tests: the Prisma client is mocked at the module boundary, no
// database is required. Real serializers, validation and error factories are
// used so wire-shape mapping and error envelopes are exercised for real.
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the Prisma singleton before importing the service under test.
vi.mock('../../../src/db.ts', () => ({
  prisma: {
    interaction: {
      count: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    contact: {
      findFirst: vi.fn(),
    },
    account: {
      findFirst: vi.fn(),
    },
    opportunity: {
      findFirst: vi.fn(),
    },
    task: {
      findFirst: vi.fn(),
    },
  },
}));

import { prisma } from '../../../src/db.ts';
import { errors } from '../../../src/lib/errors.ts';
import type { InteractionRow } from '../../../src/serializers.ts';
import type { User } from '../../../src/types/domain.ts';
import {
  createInteraction,
  listInteractions,
  softDeleteInteraction,
  updateInteraction,
} from '../../../src/services/interaction-service.ts';

// Structurally-typed view over the mocked prisma for ergonomic assertions.
interface PrismaMock {
  interaction: {
    count: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  contact: { findFirst: ReturnType<typeof vi.fn> };
  account: { findFirst: ReturnType<typeof vi.fn> };
  opportunity: { findFirst: ReturnType<typeof vi.fn> };
  task: { findFirst: ReturnType<typeof vi.fn> };
}

const db = prisma as unknown as PrismaMock;

const now = new Date('2026-01-15T10:00:00.000Z');

const admin: User = { id: 'user-1', name: 'Alice', email: 'alice@example.com', role: 'admin' };
const manager: User = { id: 'user-2', name: 'Bob', email: 'bob@example.com', role: 'manager' };
const sales: User = { id: 'user-4', name: 'Dave', email: 'dave@example.com', role: 'rep' };

function interactionRow(overrides: Partial<InteractionRow> = {}): InteractionRow {
  return {
    id: 'itx-1',
    type: 'call',
    dateTime: now,
    channel: 'phone',
    direction: 'outbound',
    summary: 'Discussed renewal',
    contactId: 'con-1',
    accountId: null,
    opportunityId: null,
    taskId: null,
    responsibleUserId: 'user-4',
    createdAt: now,
    createdBy: 'user-4',
    updatedAt: now,
    updatedBy: 'user-4',
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.interaction.count.mockResolvedValue(0);
  db.interaction.findMany.mockResolvedValue([]);
  db.interaction.findFirst.mockResolvedValue(null);
  db.interaction.create.mockImplementation(async (args: { data: Record<string, unknown> }) =>
    interactionRow({ ...args.data } as Partial<InteractionRow>),
  );
  db.interaction.update.mockImplementation(
    async (args: { where: { id: string }; data: Record<string, unknown> }) =>
      interactionRow({ id: args.where.id, ...(args.data as Partial<InteractionRow>) }),
  );
  db.contact.findFirst.mockResolvedValue({ id: 'con-1' });
  db.account.findFirst.mockResolvedValue(null);
  db.opportunity.findFirst.mockResolvedValue(null);
  db.task.findFirst.mockResolvedValue(null);
});

describe('listInteractions', () => {
  it('uses default paging (page 1, pageSize 20) and the dateTime-desc sort by default', async () => {
    await listInteractions({}, admin);
    expect(db.interaction.count).toHaveBeenCalledWith({ where: { deletedAt: null } });
    expect(db.interaction.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      orderBy: { dateTime: 'desc' },
      skip: 0,
      take: 20,
    });
  });

  it('scopes reads to the responsible user for plain sales users (FR-IT-02)', async () => {
    await listInteractions({}, sales);
    const expected = expect.objectContaining({ responsibleUserId: sales.id });
    expect(db.interaction.count).toHaveBeenCalledWith({ where: expected });
    expect(db.interaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expected }),
    );
  });

  it.each(['admin', 'manager', 'readonly'] as const)(
    'does not scope reads by owner for role %p',
    async (role) => {
      await listInteractions({}, { ...admin, role });
      const where = db.interaction.findMany.mock.calls[0][0].where;
      expect(where.responsibleUserId).toBeUndefined();
    },
  );

  it.each([
    [undefined, 1],
    [0, 1],
    [-5, 1],
    [Number.NaN, 1],
    [3.9, 3],
  ] as const)('normalizes page %p to %p', async (page, expectedPage) => {
    await listInteractions({ page }, admin);
    expect(db.interaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: (expectedPage - 1) * 20 }),
    );
  });

  it('clamps pageSize into [1, 100]', async () => {
    await listInteractions({ pageSize: 0 }, admin);
    expect(db.interaction.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ take: 1 }));
    await listInteractions({ pageSize: 500 }, admin);
    expect(db.interaction.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 100 }),
    );
    await listInteractions({ pageSize: 25.9 }, admin);
    expect(db.interaction.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ take: 25 }));
  });

  it('maps explicit page/pageSize into skip/take', async () => {
    await listInteractions({ page: 4, pageSize: 10 }, admin);
    expect(db.interaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 30, take: 10 }),
    );
  });

  it('adds trimmed entity filters when the corresponding ids are provided', async () => {
    await listInteractions(
      { contactId: ' con-1 ', accountId: ' acc-1 ', opportunityId: ' opp-1 ' },
      admin,
    );
    expect(db.interaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          contactId: 'con-1',
          accountId: 'acc-1',
          opportunityId: 'opp-1',
        }),
      }),
    );
  });

  it('ignores blank/whitespace entity filters', async () => {
    await listInteractions({ contactId: '   ', accountId: '', opportunityId: undefined }, admin);
    const where = db.interaction.findMany.mock.calls[0][0].where;
    expect(where.contactId).toBeUndefined();
    expect(where.accountId).toBeUndefined();
    expect(where.opportunityId).toBeUndefined();
  });

  it('returns serialized items plus total/page/pageSize', async () => {
    db.interaction.count.mockResolvedValue(2);
    db.interaction.findMany.mockResolvedValue([
      interactionRow({ id: 'a' }),
      interactionRow({ id: 'b', channel: null, direction: null, accountId: null }),
    ]);
    const result = await listInteractions({ page: 2, pageSize: 10 }, admin);
    expect(result).toEqual({
      items: [
        expect.objectContaining({ id: 'a', channel: 'phone' }),
        expect.objectContaining({ id: 'b', channel: undefined, direction: undefined }),
      ],
      total: 2,
      page: 2,
      pageSize: 10,
    });
  });
});

describe('createInteraction', () => {
  const base = { contactId: 'con-1', summary: 'Intro call' };

  it.each([
    [
      'missing contact',
      { summary: 'Intro call' },
      [{ field: 'contactId', message: 'A contact is required.' }],
    ],
    [
      'missing summary',
      { contactId: 'con-1' },
      [{ field: 'summary', message: 'A summary is required.' }],
    ],
    [
      'missing both',
      {},
      [
        { field: 'contactId', message: 'A contact is required.' },
        { field: 'summary', message: 'A summary is required.' },
      ],
    ],
  ])('rejects %p with a validation error', async (_name, body, details) => {
    await expect(createInteraction(body, admin)).rejects.toMatchObject({
      status: 400,
      code: 'validation',
      details,
    });
  });

  it('rejects a blank summary (whitespace only)', async () => {
    await expect(
      createInteraction({ contactId: 'con-1', summary: '   ' }, admin),
    ).rejects.toMatchObject({
      status: 400,
      code: 'validation',
    });
  });

  it('rejects when the contact does not exist or is soft-deleted', async () => {
    db.contact.findFirst.mockResolvedValue(null);
    await expect(createInteraction(base, admin)).rejects.toMatchObject({
      status: 400,
      code: 'validation',
      details: [{ field: 'contactId', message: 'A contact is required.' }],
    });
    expect(db.contact.findFirst).toHaveBeenCalledWith({
      where: { id: 'con-1', deletedAt: null },
      select: { id: true },
    });
  });

  it('creates with defaults: type note, null direction, current dateTime', async () => {
    vi.setSystemTime(now);
    try {
      const result = await createInteraction(base, admin);
      expect(db.interaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'note',
          direction: null,
          dateTime: now,
          channel: null,
          accountId: null,
          opportunityId: null,
          taskId: null,
          responsibleUserId: admin.id,
          createdBy: admin.id,
          updatedBy: admin.id,
        }),
      });
      expect(result).toEqual(
        expect.objectContaining({ id: 'itx-1', type: 'note', direction: undefined }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a valid type and defaults an invalid type to note', async () => {
    await createInteraction({ ...base, type: 'meeting' }, admin);
    expect(db.interaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'meeting' }) }),
    );
    await createInteraction({ ...base, type: 'smoke-signal' as unknown as 'email' }, admin);
    expect(db.interaction.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'note' }) }),
    );
  });

  it('forces direction to null for notes regardless of the provided direction', async () => {
    await createInteraction({ ...base, type: 'note', direction: 'inbound' }, admin);
    expect(db.interaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'note', direction: null }) }),
    );
  });

  it('defaults direction to outbound for non-note types when missing or invalid', async () => {
    await createInteraction({ ...base, type: 'call' }, admin);
    expect(db.interaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'call', direction: 'outbound' }),
      }),
    );
    await createInteraction(
      { ...base, type: 'call', direction: 'sideways' as unknown as 'inbound' },
      admin,
    );
    expect(db.interaction.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ direction: 'outbound' }) }),
    );
  });

  it('keeps a valid direction for non-note types', async () => {
    await createInteraction({ ...base, type: 'email', direction: 'inbound' }, admin);
    expect(db.interaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'email', direction: 'inbound' }),
      }),
    );
  });

  it('trims strings and uses the provided dateTime', async () => {
    const result = await createInteraction(
      { ...base, channel: '  email  ', dateTime: '2026-02-01T08:30:00.000Z' },
      admin,
    );
    expect(db.interaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        channel: 'email',
        dateTime: new Date('2026-02-01T08:30:00.000Z'),
      }),
    });
    expect(result).toEqual(expect.objectContaining({ channel: 'email' }));
  });

  it('defaults responsibleUserId to the acting user and honors an explicit owner', async () => {
    await createInteraction(base, sales);
    expect(db.interaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ responsibleUserId: sales.id }) }),
    );
    await createInteraction({ ...base, responsibleUserId: 'user-9' }, sales);
    expect(db.interaction.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ responsibleUserId: 'user-9' }) }),
    );
  });

  it('passes when all linked records exist', async () => {
    db.account.findFirst.mockResolvedValue({ id: 'acc-1' });
    db.opportunity.findFirst.mockResolvedValue({ id: 'opp-1' });
    db.task.findFirst.mockResolvedValue({ id: 'task-1' });
    await expect(
      createInteraction(
        { ...base, accountId: 'acc-1', opportunityId: 'opp-1', taskId: 'task-1' },
        admin,
      ),
    ).resolves.toBeDefined();
    expect(db.account.findFirst).toHaveBeenCalledWith({
      where: { id: 'acc-1', deletedAt: null },
      select: { id: true },
    });
    expect(db.opportunity.findFirst).toHaveBeenCalledWith({
      where: { id: 'opp-1', deletedAt: null },
      select: { id: true },
    });
    expect(db.task.findFirst).toHaveBeenCalledWith({
      where: { id: 'task-1', deletedAt: null },
      select: { id: true },
    });
  });

  it.each([
    ['account', { accountId: 'acc-missing' }, 'The linked account does not exist.'],
    ['opportunity', { opportunityId: 'opp-missing' }, 'The linked opportunity does not exist.'],
    ['task', { taskId: 'task-missing' }, 'The linked task does not exist.'],
  ] as const)('rejects when the linked %p does not exist', async (_name, body, message) => {
    await expect(createInteraction({ ...base, ...body }, admin)).rejects.toMatchObject({
      status: 400,
      code: 'validation',
      message,
    });
  });
});

describe('updateInteraction', () => {
  it('rejects when the interaction does not exist or is soft-deleted', async () => {
    db.interaction.findFirst.mockResolvedValue(null);
    await expect(updateInteraction('itx-1', {}, admin)).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
      message: 'Interaction not found.',
    });
    expect(db.interaction.findFirst).toHaveBeenCalledWith({
      where: { id: 'itx-1', deletedAt: null },
    });
  });

  it('rejects with a 409 when the client updatedAt token is stale', async () => {
    db.interaction.findFirst.mockResolvedValue(interactionRow());
    await expect(
      updateInteraction('itx-1', { updatedAt: '2020-01-01T00:00:00.000Z' }, admin),
    ).rejects.toMatchObject({ status: 409, code: 'conflict' });
  });

  it('accepts the exact current updatedAt token and skips the check when omitted', async () => {
    db.interaction.findFirst.mockResolvedValue(interactionRow());
    await expect(
      updateInteraction('itx-1', { updatedAt: now.toISOString() }, admin),
    ).resolves.toBeDefined();
    await expect(updateInteraction('itx-1', {}, admin)).resolves.toBeDefined();
  });

  it('forbids unrelated sales users but allows creator/responsible users', async () => {
    const row = interactionRow({ createdBy: 'someone-else', responsibleUserId: 'someone-else' });
    db.interaction.findFirst.mockResolvedValue(row);

    const stranger: User = { id: 'user-99', name: 'Eve', email: 'eve@example.com', role: 'rep' };
    await expect(updateInteraction('itx-1', {}, stranger)).rejects.toMatchObject({
      status: 403,
      code: 'forbidden',
    });

    db.interaction.findFirst.mockResolvedValue(interactionRow({ createdBy: stranger.id }));
    await expect(updateInteraction('itx-1', {}, stranger)).resolves.toBeDefined();
    db.interaction.findFirst.mockResolvedValue(interactionRow({ responsibleUserId: stranger.id }));
    await expect(updateInteraction('itx-1', {}, stranger)).resolves.toBeDefined();
  });

  it('allows admins and managers regardless of ownership', async () => {
    db.interaction.findFirst.mockResolvedValue(interactionRow());
    for (const user of [admin, manager]) {
      await expect(updateInteraction('itx-1', {}, user)).resolves.toBeDefined();
    }
  });

  it('falls back to existing type and preserves fields the body omits', async () => {
    db.interaction.findFirst.mockResolvedValue(
      interactionRow({
        type: 'meeting',
        direction: 'inbound',
        channel: 'room',
        accountId: 'acc-1',
      }),
    );
    await updateInteraction('itx-1', { summary: 'Updated summary' }, admin);
    expect(db.interaction.update).toHaveBeenCalledWith({
      where: { id: 'itx-1' },
      data: expect.objectContaining({
        type: 'meeting',
        direction: 'inbound',
        summary: 'Updated summary',
        channel: 'room',
        accountId: 'acc-1',
        updatedBy: admin.id,
      }),
    });
  });

  it('applies provided values, trims strings, and sets direction for non-notes', async () => {
    db.interaction.findFirst.mockResolvedValue(interactionRow({ type: 'note', direction: null }));
    await updateInteraction(
      'itx-1',
      {
        type: 'call',
        direction: 'inbound',
        summary: '  New summary  ',
        channel: '  mobile  ',
        dateTime: '2026-03-01T09:00:00.000Z',
        accountId: ' acc-2 ',
        responsibleUserId: 'user-9',
      },
      admin,
    );
    expect(db.interaction.update).toHaveBeenCalledWith({
      where: { id: 'itx-1' },
      data: expect.objectContaining({
        type: 'call',
        direction: 'inbound',
        summary: 'New summary',
        channel: 'mobile',
        dateTime: new Date('2026-03-01T09:00:00.000Z'),
        accountId: 'acc-2',
        responsibleUserId: 'user-9',
        updatedBy: admin.id,
      }),
    });
  });

  it('falls back to outbound direction when switching from note without a valid direction', async () => {
    db.interaction.findFirst.mockResolvedValue(interactionRow({ type: 'note', direction: null }));
    await updateInteraction(
      'itx-1',
      { type: 'email', direction: 'sideways' as unknown as 'inbound' },
      admin,
    );
    expect(db.interaction.update).toHaveBeenCalledWith({
      where: { id: 'itx-1' },
      data: expect.objectContaining({ type: 'email', direction: 'outbound' }),
    });
  });

  it('clears direction to null when the type becomes note (FR-IT-03)', async () => {
    db.interaction.findFirst.mockResolvedValue(
      interactionRow({ type: 'call', direction: 'outbound' }),
    );
    await updateInteraction('itx-1', { type: 'note' }, admin);
    expect(db.interaction.update).toHaveBeenCalledWith({
      where: { id: 'itx-1' },
      data: expect.objectContaining({ type: 'note', direction: null }),
    });
  });

  it('returns the serialized updated interaction', async () => {
    db.interaction.findFirst.mockResolvedValue(interactionRow());
    db.interaction.update.mockResolvedValue(interactionRow({ summary: 'Fresh' }));
    const result = await updateInteraction('itx-1', { summary: 'Fresh' }, admin);
    expect(result).toEqual(expect.objectContaining({ id: 'itx-1', summary: 'Fresh' }));
  });
});

describe('softDeleteInteraction', () => {
  it('rejects when the interaction does not exist', async () => {
    db.interaction.findFirst.mockResolvedValue(null);
    await expect(softDeleteInteraction('itx-1', admin)).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    });
    expect(db.interaction.update).not.toHaveBeenCalled();
  });

  it('forbids unrelated non-privileged users (FR-IT-04)', async () => {
    db.interaction.findFirst.mockResolvedValue(
      interactionRow({ createdBy: 'someone-else', responsibleUserId: 'someone-else' }),
    );
    const stranger: User = { id: 'user-99', name: 'Eve', email: 'eve@example.com', role: 'rep' };
    await expect(softDeleteInteraction('itx-1', stranger)).rejects.toMatchObject({
      status: 403,
      code: 'forbidden',
      message: errors.forbidden('You do not have permission to modify this interaction.').message,
    });
    expect(db.interaction.update).not.toHaveBeenCalled();
  });

  it('sets deletedAt and stamps the mutator for authorized users', async () => {
    vi.setSystemTime(now);
    try {
      db.interaction.findFirst.mockResolvedValue(interactionRow());
      await softDeleteInteraction('itx-1', admin);
      expect(db.interaction.update).toHaveBeenCalledWith({
        where: { id: 'itx-1' },
        data: { deletedAt: now, updatedAt: now, updatedBy: admin.id },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('allows the creator to soft-delete their own interaction', async () => {
    db.interaction.findFirst.mockResolvedValue(interactionRow({ createdBy: sales.id }));
    await expect(softDeleteInteraction('itx-1', sales)).resolves.toBeUndefined();
  });
});
