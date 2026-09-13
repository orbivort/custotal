// Unit tests for the global grouped search service (FR-CC-03).
// Pure unit tests: the Prisma client is mocked at the module boundary, no
// database is required. Real serializers are used so wire-shape mapping is
// exercised for real.
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the Prisma singleton before importing the service under test.
vi.mock('../../../src/db.ts', () => ({
  prisma: {
    contact: { findMany: vi.fn(), count: vi.fn() },
    account: { findMany: vi.fn(), count: vi.fn() },
    opportunity: { findMany: vi.fn(), count: vi.fn() },
    task: { findMany: vi.fn(), count: vi.fn() },
    interaction: { findMany: vi.fn(), count: vi.fn() },
  },
}));

import { prisma } from '../../../src/db.ts';
import type {
  AccountRow,
  ContactRow,
  InteractionRow,
  OpportunityRow,
  TaskRow,
} from '../../../src/serializers.ts';
import type { User } from '../../../src/types/domain.ts';
import { searchAll } from '../../../src/services/search-service.ts';

// Structurally-typed view over the mocked prisma for ergonomic assertions.
interface ModelMock {
  findMany: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
}
interface PrismaMock {
  contact: ModelMock;
  account: ModelMock;
  opportunity: ModelMock;
  task: ModelMock;
  interaction: ModelMock;
}

const db = prisma as unknown as PrismaMock;

const now = new Date('2026-01-15T10:00:00.000Z');

const admin: User = { id: 'user-1', name: 'Alice', email: 'alice@example.com', role: 'admin' };
const manager: User = { id: 'user-2', name: 'Bob', email: 'bob@example.com', role: 'manager' };
const readonlyUser: User = {
  id: 'user-3',
  name: 'Carol',
  email: 'carol@example.com',
  role: 'readonly',
};
const sales: User = { id: 'user-4', name: 'Dave', email: 'dave@example.com', role: 'rep' };

function contactRow(overrides: Partial<ContactRow> = {}): ContactRow {
  return {
    id: 'con-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    phone: '+1-555-0100',
    jobTitle: 'CTO',
    company: 'Analytical Engines',
    address: null,
    notes: null,
    status: 'active',
    accountLinks: [{ accountId: 'acc-1', primary: true, role: 'employee' }],
    createdAt: now,
    createdBy: 'user-1',
    updatedAt: now,
    updatedBy: 'user-1',
    deletedAt: null,
    ...overrides,
  };
}

function accountRow(overrides: Partial<AccountRow> = {}): AccountRow {
  return {
    id: 'acc-1',
    name: 'Globex',
    industry: 'Software',
    website: 'https://globex.example.com',
    phone: null,
    billingAddress: null,
    ownerId: 'user-4',
    notes: null,
    createdAt: now,
    createdBy: 'user-1',
    updatedAt: now,
    updatedBy: 'user-1',
    deletedAt: null,
    ...overrides,
  };
}

function opportunityRow(overrides: Partial<OpportunityRow> = {}): OpportunityRow {
  return {
    id: 'opp-1',
    name: 'Renewal 2026',
    contactId: null,
    accountId: 'acc-1',
    valueMinor: 120000,
    currency: 'USD',
    expectedCloseDate: now,
    stageId: 'stage-2',
    probability: 50,
    probabilityManual: false,
    ownerId: 'user-4',
    description: 'Annual renewal',
    lossReason: null,
    createdAt: now,
    createdBy: 'user-4',
    updatedAt: now,
    updatedBy: 'user-4',
    deletedAt: null,
    ...overrides,
  };
}

function taskRow(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: 'task-1',
    title: 'Follow up',
    description: 'Call the customer',
    dueDate: now,
    priority: 'high',
    status: 'open',
    assigneeId: 'user-4',
    contactId: null,
    accountId: null,
    opportunityId: null,
    completedAt: null,
    completedBy: null,
    createdAt: now,
    createdBy: 'user-4',
    updatedAt: now,
    updatedBy: 'user-4',
    deletedAt: null,
    ...overrides,
  };
}

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
  db.contact.findMany.mockResolvedValue([]);
  db.contact.count.mockResolvedValue(0);
  db.account.findMany.mockResolvedValue([]);
  db.account.count.mockResolvedValue(0);
  db.opportunity.findMany.mockResolvedValue([]);
  db.opportunity.count.mockResolvedValue(0);
  db.task.findMany.mockResolvedValue([]);
  db.task.count.mockResolvedValue(0);
  db.interaction.findMany.mockResolvedValue([]);
  db.interaction.count.mockResolvedValue(0);
});

describe('searchAll', () => {
  describe('empty / blank terms', () => {
    it('returns empty grouped results with zero counts for a blank term', async () => {
      const result = await searchAll(admin, '   ', false);
      expect(result).toEqual({
        contacts: [],
        accounts: [],
        opportunities: [],
        tasks: [],
        interactions: [],
        counts: { contacts: 0, accounts: 0, opportunities: 0, tasks: 0, interactions: 0 },
      });
    });

    it('does not hit the database for a blank term', async () => {
      await searchAll(admin, '', false);
      for (const model of Object.values(db)) {
        expect(model.findMany).not.toHaveBeenCalled();
        expect(model.count).not.toHaveBeenCalled();
      }
    });
  });

  describe('query construction', () => {
    it('normalizes the term (trim + lowercase) and filters soft-deleted rows everywhere', async () => {
      await searchAll(admin, '  GLOBEX  ', false);
      const contains = (col: string) => ({ [col]: { contains: 'globex', mode: 'insensitive' } });

      expect(db.contact.findMany).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          OR: [
            contains('firstName'),
            contains('lastName'),
            contains('email'),
            contains('company'),
            contains('jobTitle'),
          ],
        },
        take: 5,
        include: { accountLinks: true },
        orderBy: { updatedAt: 'desc' },
      });
      expect(db.account.findMany).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          OR: [contains('name'), contains('industry'), contains('website')],
        },
        take: 5,
        orderBy: { updatedAt: 'desc' },
      });
      expect(db.opportunity.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null, OR: [contains('name'), contains('description')] },
        take: 5,
        orderBy: { updatedAt: 'desc' },
      });
      expect(db.task.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null, OR: [contains('title'), contains('description')] },
        take: 5,
        orderBy: { updatedAt: 'desc' },
      });
      expect(db.interaction.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null, OR: [contains('summary')] },
        take: 5,
        orderBy: { dateTime: 'desc' },
      });
    });

    it('runs counts with the same where clauses as the finds', async () => {
      await searchAll(admin, 'globex', false);
      const findWhere = (model: ModelMock) =>
        (model.findMany.mock.calls[0] as [{ where: unknown }])[0].where;

      expect(db.contact.count).toHaveBeenCalledWith({ where: findWhere(db.contact) });
      expect(db.account.count).toHaveBeenCalledWith({ where: findWhere(db.account) });
      expect(db.opportunity.count).toHaveBeenCalledWith({ where: findWhere(db.opportunity) });
      expect(db.task.count).toHaveBeenCalledWith({ where: findWhere(db.task) });
      expect(db.interaction.count).toHaveBeenCalledWith({ where: findWhere(db.interaction) });
    });
  });

  describe('result limiting', () => {
    it('limits findMany to 5 results per group by default', async () => {
      await searchAll(admin, 'globex', false);
      expect(db.contact.findMany.mock.calls[0][0].take).toBe(5);
      expect(db.account.findMany.mock.calls[0][0].take).toBe(5);
      expect(db.opportunity.findMany.mock.calls[0][0].take).toBe(5);
      expect(db.task.findMany.mock.calls[0][0].take).toBe(5);
      expect(db.interaction.findMany.mock.calls[0][0].take).toBe(5);
    });

    it('limits findMany to 30 results per group when all=true', async () => {
      await searchAll(admin, 'globex', true);
      expect(db.contact.findMany.mock.calls[0][0].take).toBe(30);
      expect(db.account.findMany.mock.calls[0][0].take).toBe(30);
      expect(db.opportunity.findMany.mock.calls[0][0].take).toBe(30);
      expect(db.task.findMany.mock.calls[0][0].take).toBe(30);
      expect(db.interaction.findMany.mock.calls[0][0].take).toBe(30);
    });
  });

  describe('RBAC scoping', () => {
    const expectedRepWhere = (key: 'ownerId' | 'assigneeId' | 'responsibleUserId') =>
      expect.objectContaining({ [key]: sales.id });

    it('does not scope results for admins', async () => {
      await searchAll(admin, 'globex', false);
      expect(db.opportunity.findMany.mock.calls[0][0].where).toEqual(
        expect.not.objectContaining({ ownerId: expect.anything() }),
      );
      expect(db.task.findMany.mock.calls[0][0].where).toEqual(
        expect.not.objectContaining({ assigneeId: expect.anything() }),
      );
      expect(db.interaction.findMany.mock.calls[0][0].where).toEqual(
        expect.not.objectContaining({ responsibleUserId: expect.anything() }),
      );
    });

    it('does not scope results for managers', async () => {
      await searchAll(manager, 'globex', false);
      expect(db.opportunity.findMany.mock.calls[0][0].where).not.toHaveProperty('ownerId');
      expect(db.task.findMany.mock.calls[0][0].where).not.toHaveProperty('assigneeId');
      expect(db.interaction.findMany.mock.calls[0][0].where).not.toHaveProperty(
        'responsibleUserId',
      );
    });

    it('does not scope results for readonly users', async () => {
      await searchAll(readonlyUser, 'globex', false);
      expect(db.opportunity.findMany.mock.calls[0][0].where).not.toHaveProperty('ownerId');
      expect(db.task.findMany.mock.calls[0][0].where).not.toHaveProperty('assigneeId');
      expect(db.interaction.findMany.mock.calls[0][0].where).not.toHaveProperty(
        'responsibleUserId',
      );
    });

    it('scopes opportunities by ownerId for plain sales users', async () => {
      await searchAll(sales, 'globex', false);
      expect(db.opportunity.findMany.mock.calls[0][0].where).toEqual(expectedRepWhere('ownerId'));
      expect(db.opportunity.count.mock.calls[0][0].where).toEqual(expectedRepWhere('ownerId'));
    });

    it('scopes tasks by assigneeId for plain sales users', async () => {
      await searchAll(sales, 'globex', false);
      expect(db.task.findMany.mock.calls[0][0].where).toEqual(expectedRepWhere('assigneeId'));
      expect(db.task.count.mock.calls[0][0].where).toEqual(expectedRepWhere('assigneeId'));
    });

    it('scopes interactions by responsibleUserId for plain sales users', async () => {
      await searchAll(sales, 'globex', false);
      expect(db.interaction.findMany.mock.calls[0][0].where).toEqual(
        expectedRepWhere('responsibleUserId'),
      );
      expect(db.interaction.count.mock.calls[0][0].where).toEqual(
        expectedRepWhere('responsibleUserId'),
      );
    });

    it('never scopes contacts and accounts (shared visibility)', async () => {
      await searchAll(sales, 'globex', false);
      expect(db.contact.findMany.mock.calls[0][0].where).not.toHaveProperty('ownerId');
      expect(db.account.findMany.mock.calls[0][0].where).not.toHaveProperty('ownerId');
    });
  });

  describe('result mapping', () => {
    it('maps rows through the real serializers and returns counts', async () => {
      db.contact.findMany.mockResolvedValue([contactRow()]);
      db.account.findMany.mockResolvedValue([accountRow()]);
      db.opportunity.findMany.mockResolvedValue([opportunityRow()]);
      db.task.findMany.mockResolvedValue([taskRow()]);
      db.interaction.findMany.mockResolvedValue([interactionRow()]);
      db.contact.count.mockResolvedValue(2);
      db.account.count.mockResolvedValue(3);
      db.opportunity.count.mockResolvedValue(4);
      db.task.count.mockResolvedValue(5);
      db.interaction.count.mockResolvedValue(6);

      const result = await searchAll(admin, 'ada', false);

      // Contact: nulls coerced to undefined, accountLinks preserved.
      expect(result.contacts).toEqual([
        expect.objectContaining({
          id: 'con-1',
          firstName: 'Ada',
          lastName: 'Lovelace',
          email: 'ada@example.com',
          company: 'Analytical Engines',
          accountLinks: [{ accountId: 'acc-1', primary: true, role: 'employee' }],
        }),
      ]);
      // Account: industry kept, nulls dropped.
      expect(result.accounts).toEqual([
        expect.objectContaining({ id: 'acc-1', name: 'Globex', industry: 'Software' }),
      ]);
      // Opportunity: expectedCloseDate serialized as a date-only string.
      expect(result.opportunities).toEqual([
        expect.objectContaining({
          id: 'opp-1',
          name: 'Renewal 2026',
          expectedCloseDate: '2026-01-15',
        }),
      ]);
      // Task: priority/status passed through.
      expect(result.tasks).toEqual([
        expect.objectContaining({
          id: 'task-1',
          title: 'Follow up',
          priority: 'high',
          status: 'open',
        }),
      ]);
      // Interaction: summary and responsible user preserved.
      expect(result.interactions).toEqual([
        expect.objectContaining({
          id: 'itx-1',
          summary: 'Discussed renewal',
          responsibleUserId: 'user-4',
        }),
      ]);

      expect(result.counts).toEqual({
        contacts: 2,
        accounts: 3,
        opportunities: 4,
        tasks: 5,
        interactions: 6,
      });
    });

    it('returns empty arrays with zero counts when nothing matches', async () => {
      const result = await searchAll(admin, 'no-such-thing', false);
      expect(result.contacts).toEqual([]);
      expect(result.accounts).toEqual([]);
      expect(result.opportunities).toEqual([]);
      expect(result.tasks).toEqual([]);
      expect(result.interactions).toEqual([]);
      expect(result.counts).toEqual({
        contacts: 0,
        accounts: 0,
        opportunities: 0,
        tasks: 0,
        interactions: 0,
      });
    });

    it('coerces nullable fields to undefined in serialized output', async () => {
      db.contact.findMany.mockResolvedValue([contactRow({ email: null, company: null })]);
      const result = await searchAll(admin, 'ada', false);
      expect(result.contacts[0]?.email).toBeUndefined();
      expect(result.contacts[0]?.company).toBeUndefined();
    });
  });

  describe('error propagation', () => {
    it('rejects when a prisma call fails', async () => {
      db.account.count.mockRejectedValue(new Error('db down'));
      await expect(searchAll(admin, 'globex', false)).rejects.toThrow('db down');
    });
  });
});
