// Unit tests for the account service (FR-CM-02/03/05, FR-CC-13).
// Pure unit tests: the Prisma client is mocked at the module boundary, no
// database is required. Real serializers, validation and error factories are
// used so wire-shape mapping and error envelopes are exercised for real.
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the Prisma singleton before importing the service under test.
vi.mock('../../../src/db.ts', () => ({
  prisma: {
    account: {
      count: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    contact: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    opportunity: {
      findMany: vi.fn(),
    },
    contactAccountLink: {
      update: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { prisma } from '../../../src/db.ts';
import { errors } from '../../../src/lib/errors.ts';
import type { AccountRow, ContactRow, OpportunityRow } from '../../../src/serializers.ts';
import type { User } from '../../../src/types/domain.ts';
import {
  addAccountLink,
  createAccount,
  getAccount,
  listAccounts,
  removeAccountLink,
  softDeleteAccount,
  updateAccount,
} from '../../../src/services/account-service.ts';

// Structurally-typed view over the mocked prisma for ergonomic assertions.
interface PrismaMock {
  account: {
    count: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  contact: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  opportunity: { findMany: ReturnType<typeof vi.fn> };
  contactAccountLink: {
    update: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
}

const db = prisma as unknown as PrismaMock;

const actor: User = { id: 'user-1', name: 'Alice', email: 'alice@example.com', role: 'admin' };

let now: Date;

function accountRow(overrides: Partial<AccountRow> = {}): AccountRow {
  return {
    id: 'acc-1',
    name: 'Acme Corp',
    industry: 'Manufacturing',
    website: 'https://acme.example.com',
    phone: '+1-555-0100',
    billingAddress: '1 Main St',
    ownerId: 'user-1',
    notes: 'Flagship customer',
    createdAt: now,
    createdBy: 'user-1',
    updatedAt: now,
    updatedBy: 'user-1',
    deletedAt: null,
    ...overrides,
  };
}

function link(overrides: { accountId?: string; primary?: boolean; role?: string } = {}) {
  return { accountId: 'acc-1', primary: false, role: '', ...overrides };
}

function contactRow(
  overrides: Partial<ContactRow> & { accountLinks?: ContactRow['accountLinks'] } = {},
): ContactRow {
  const { accountLinks, ...rest } = overrides;
  return {
    id: 'con-1',
    firstName: 'Bob',
    lastName: 'Builder',
    email: 'bob@example.com',
    phone: null,
    jobTitle: null,
    company: null,
    address: null,
    notes: null,
    status: 'active',
    accountLinks: accountLinks ?? [link()],
    createdAt: now,
    createdBy: 'user-1',
    updatedAt: now,
    updatedBy: 'user-1',
    deletedAt: null,
    ...rest,
  };
}

function opportunityRow(overrides: Partial<OpportunityRow> = {}): OpportunityRow {
  return {
    id: 'opp-1',
    name: 'Big deal',
    contactId: null,
    accountId: 'acc-1',
    valueMinor: 123456,
    currency: 'USD',
    expectedCloseDate: now,
    stageId: 'stage-1',
    probability: 50,
    probabilityManual: false,
    ownerId: 'user-1',
    description: null,
    lossReason: null,
    createdAt: now,
    createdBy: 'user-1',
    updatedAt: now,
    updatedBy: 'user-1',
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  now = new Date('2026-01-15T10:00:00.000Z');
  db.account.count.mockResolvedValue(0);
  db.account.findMany.mockResolvedValue([]);
  db.account.findFirst.mockResolvedValue(null);
  db.account.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
    ...accountRow({ name: String(args.data.name) }),
  }));
  db.account.update.mockImplementation(
    async (args: { where: { id: string }; data: Record<string, unknown> }) =>
      accountRow({ id: args.where.id, ...(args.data as Partial<AccountRow>) }),
  );
  db.contact.findMany.mockResolvedValue([]);
  db.contact.findFirst.mockResolvedValue(null);
  db.contact.update.mockResolvedValue(contactRow());
  db.opportunity.findMany.mockResolvedValue([]);
  db.contactAccountLink.update.mockResolvedValue(link());
  db.contactAccountLink.create.mockResolvedValue(link());
  db.contactAccountLink.deleteMany.mockResolvedValue({ count: 1 });
});

describe('listAccounts', () => {
  it('uses default paging (page 1, pageSize 25) and the updatedAt-desc sort by default', async () => {
    await listAccounts({});
    expect(db.account.count).toHaveBeenCalledWith({
      where: { deletedAt: null },
    });
    expect(db.account.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      orderBy: [{ updatedAt: 'desc' }],
      skip: 0,
      take: 25,
    });
  });

  it.each([
    [undefined, 1],
    [0, 1],
    [-5, 1],
    [Number.NaN, 1],
    [3.9, 3],
    [2, 2],
  ] as [number | undefined, number][])('normalizes page %p to %p', async (page, expectedPage) => {
    await listAccounts({ page });
    expect(db.account.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: (expectedPage - 1) * 25, take: 25 }),
    );
  });

  it('clamps pageSize into [1, 100]', async () => {
    await listAccounts({ pageSize: 0 });
    expect(db.account.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ take: 1 }));
    await listAccounts({ pageSize: 500 });
    expect(db.account.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ take: 100 }));
    await listAccounts({ pageSize: 25.9 });
    expect(db.account.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ take: 25 }));
  });

  it('maps explicit page/pageSize into skip/take', async () => {
    await listAccounts({ page: 4, pageSize: 10 });
    expect(db.account.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 30, take: 10 }),
    );
  });

  it('builds an insensitive OR search across name, industry and website from q', async () => {
    await listAccounts({ q: '  Acme  ' });
    const arg = db.account.findMany.mock.calls[0][0];
    expect(arg.where.OR).toEqual([
      { name: { contains: 'acme', mode: 'insensitive' } },
      { industry: { contains: 'acme', mode: 'insensitive' } },
      { website: { contains: 'acme', mode: 'insensitive' } },
    ]);
  });

  it('applies the first-letter filter as an insensitive startsWith (FR-CM-05)', async () => {
    await listAccounts({ letter: ' b ' });
    expect(db.account.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ name: { startsWith: 'B', mode: 'insensitive' } }),
      }),
    );
  });

  it('ignores the letter filter when it is not a single A-Z character', async () => {
    await listAccounts({ letter: 'ab' });
    expect(db.account.findMany.mock.calls[0][0].where.name).toBeUndefined();
    await listAccounts({ letter: '1' });
    expect(db.account.findMany.mock.calls[1][0].where.name).toBeUndefined();
  });

  it('filters by ownerId when owner is provided', async () => {
    await listAccounts({ owner: 'user-9' });
    expect(db.account.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ ownerId: 'user-9' }),
    });
  });

  it.each([
    ['name', [{ name: 'asc' }, { updatedAt: 'desc' }]],
    ['name_desc', [{ name: 'desc' }, { updatedAt: 'desc' }]],
    ['updated', [{ updatedAt: 'asc' }]],
    ['bogus', [{ updatedAt: 'desc' }]],
  ] as const)('sort=%p produces ORDER BY %p', async (sort, orderBy) => {
    await listAccounts({ sort });
    expect(db.account.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy }));
  });

  it('returns serialized items plus total/page/pageSize', async () => {
    db.account.count.mockResolvedValue(2);
    db.account.findMany.mockResolvedValue([
      accountRow({ id: 'a' }),
      accountRow({
        id: 'b',
        industry: null,
        website: null,
        phone: null,
        billingAddress: null,
        notes: null,
      }),
    ]);
    const result = await listAccounts({ page: 2, pageSize: 10 });
    expect(result).toEqual({
      items: [
        expect.objectContaining({ id: 'a', industry: 'Manufacturing' }),
        expect.objectContaining({ id: 'b', industry: undefined }),
      ],
      total: 2,
      page: 2,
      pageSize: 10,
    });
  });
});

describe('getAccount', () => {
  it('throws 404 when the account does not exist', async () => {
    db.account.findFirst.mockResolvedValue(null);
    await expect(getAccount('missing')).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
      message: 'Account not found.',
    });
  });

  it('throws 404 when the account is soft-deleted', async () => {
    db.account.findFirst.mockResolvedValue(null); // findFirst filters deletedAt: null
    await expect(getAccount('deleted')).rejects.toMatchObject({ status: 404 });
  });

  it('returns the account with linked contacts and their link objects', async () => {
    db.account.findFirst.mockResolvedValue(accountRow());
    db.contact.findMany.mockResolvedValue([
      contactRow({
        id: 'con-1',
        accountLinks: [
          { accountId: 'acc-other', primary: false, role: '' },
          { accountId: 'acc-1', primary: true, role: 'Decision maker' },
        ],
      }),
    ]);
    const result = await getAccount('acc-1');
    expect(result.account).toEqual(expect.objectContaining({ id: 'acc-1', name: 'Acme Corp' }));
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0]).toEqual(
      expect.objectContaining({
        id: 'con-1',
        link: { accountId: 'acc-1', primary: true, role: 'Decision maker' },
      }),
    );
  });

  it('sets link to null for contacts linked to other accounts only', async () => {
    db.account.findFirst.mockResolvedValue(accountRow());
    db.contact.findMany.mockResolvedValue([
      contactRow({ accountLinks: [{ accountId: 'acc-other', primary: false, role: '' }] }),
    ]);
    const result = await getAccount('acc-1');
    expect(result.contacts[0].link).toBeNull();
  });

  it('returns serialized opportunities for the account', async () => {
    db.account.findFirst.mockResolvedValue(accountRow());
    db.opportunity.findMany.mockResolvedValue([opportunityRow()]);
    const result = await getAccount('acc-1');
    expect(result.opportunities).toEqual([
      expect.objectContaining({ id: 'opp-1', name: 'Big deal' }),
    ]);
    expect(db.opportunity.findMany).toHaveBeenCalledWith({
      where: { accountId: 'acc-1', deletedAt: null },
    });
  });

  it('queries contacts via the accountLinks relation excluding soft-deleted ones', async () => {
    db.account.findFirst.mockResolvedValue(accountRow());
    await getAccount('acc-1');
    expect(db.contact.findFirst).not.toHaveBeenCalled();
    expect(db.contact.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null, accountLinks: { some: { accountId: 'acc-1' } } },
      include: { accountLinks: true },
    });
  });
});

describe('createAccount', () => {
  it('rejects a missing name with a field-level validation error', async () => {
    await expect(createAccount({}, actor)).rejects.toMatchObject({
      status: 400,
      code: 'validation',
      details: [{ field: 'name', message: 'Account name is required.' }],
    });
  });

  it('rejects a whitespace-only name', async () => {
    await expect(createAccount({ name: '   ' }, actor)).rejects.toMatchObject({
      status: 400,
      details: [{ field: 'name' }],
    });
  });

  it('rejects a non-string name', async () => {
    await expect(createAccount({ name: 42 }, actor)).rejects.toMatchObject({ status: 400 });
    expect(db.account.create).not.toHaveBeenCalled();
  });

  it('creates the account and defaults ownerId to the actor', async () => {
    await createAccount({ name: '  Acme Corp  ' }, actor);
    expect(db.account.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Acme Corp',
        ownerId: 'user-1',
        createdBy: 'user-1',
        updatedBy: 'user-1',
      }),
    });
  });

  it('honors an explicit ownerId and trims strings', async () => {
    await createAccount({ name: 'Acme', industry: ' Retail ', ownerId: 'user-2' }, actor);
    expect(db.account.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: 'Acme', industry: 'Retail', ownerId: 'user-2' }),
    });
  });

  it('stores whitespace-only optional fields as null', async () => {
    await createAccount(
      {
        name: 'Acme',
        industry: '  ',
        website: '',
        phone: null,
        billingAddress: ' addr ',
        notes: '  n  ',
      },
      actor,
    );
    expect(db.account.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        industry: null,
        website: null,
        phone: null,
        billingAddress: 'addr',
        notes: 'n',
      }),
    });
  });

  it('returns the serialized account', async () => {
    db.account.create.mockResolvedValue(accountRow({ id: 'acc-new' }));
    const result = await createAccount({ name: 'Acme' }, actor);
    expect(result).toEqual(expect.objectContaining({ id: 'acc-new', ownerId: 'user-1' }));
  });
});

describe('updateAccount', () => {
  it('throws 404 when the account does not exist', async () => {
    await expect(updateAccount('missing', {}, actor)).rejects.toMatchObject({ status: 404 });
  });

  it('throws 409 conflict when the updatedAt token is stale (FR-CC-13)', async () => {
    db.account.findFirst.mockResolvedValue(accountRow());
    await expect(
      updateAccount('acc-1', { updatedAt: '2020-01-01T00:00:00.000Z' }, actor),
    ).rejects.toMatchObject({
      status: 409,
      code: 'conflict',
      message: errors.conflict().message,
    });
    expect(db.account.update).not.toHaveBeenCalled();
  });

  it('allows the update when the updatedAt token matches the stored value', async () => {
    db.account.findFirst.mockResolvedValue(accountRow());
    await updateAccount('acc-1', { name: 'New name', updatedAt: now.toISOString() }, actor);
    expect(db.account.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: expect.objectContaining({ name: 'New name' }),
    });
  });

  it('skips the conflict check when the updatedAt token is omitted', async () => {
    db.account.findFirst.mockResolvedValue(accountRow());
    await updateAccount('acc-1', { name: 'New name' }, actor);
    expect(db.account.update).toHaveBeenCalled();
  });

  it('keeps existing values for fields not supplied', async () => {
    db.account.findFirst.mockResolvedValue(accountRow());
    await updateAccount('acc-1', {}, actor);
    expect(db.account.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: expect.objectContaining({
        name: 'Acme Corp',
        industry: 'Manufacturing',
        website: 'https://acme.example.com',
        phone: '+1-555-0100',
        billingAddress: '1 Main St',
        notes: 'Flagship customer',
        ownerId: 'user-1',
      }),
    });
  });

  it('applies supplied fields (trimmed) and stamps updatedBy/updatedAt with the actor', async () => {
    db.account.findFirst.mockResolvedValue(accountRow());
    await updateAccount('acc-1', { name: '  Renamed  ', notes: 'new notes' }, actor);
    const data = db.account.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data).toMatchObject({ name: 'Renamed', notes: 'new notes', updatedBy: 'user-1' });
    expect(data.updatedAt).toBeInstanceOf(Date);
  });

  it('returns the serialized updated account', async () => {
    db.account.findFirst.mockResolvedValue(accountRow());
    db.account.update.mockResolvedValue(accountRow({ name: 'Renamed' }));
    const result = await updateAccount('acc-1', { name: 'Renamed' }, actor);
    expect(result.name).toBe('Renamed');
  });
});

describe('softDeleteAccount', () => {
  it('throws 404 when the account does not exist', async () => {
    await expect(softDeleteAccount('missing')).rejects.toMatchObject({ status: 404 });
    expect(db.account.update).not.toHaveBeenCalled();
  });

  it('sets deletedAt instead of removing the row', async () => {
    db.account.findFirst.mockResolvedValue(accountRow());
    await softDeleteAccount('acc-1');
    expect(db.account.update).toHaveBeenCalledTimes(1);
    const args = db.account.update.mock.calls[0][0];
    expect(args.where).toEqual({ id: 'acc-1' });
    expect((args.data as { deletedAt: unknown }).deletedAt).toBeInstanceOf(Date);
  });
});

describe('addAccountLink', () => {
  it('throws 404 when the account does not exist', async () => {
    await expect(addAccountLink('missing', { contactId: 'con-1' }, actor)).rejects.toMatchObject({
      status: 404,
      message: 'Account not found.',
    });
  });

  it('rejects a missing contactId with a validation error', async () => {
    db.account.findFirst.mockResolvedValue(accountRow());
    await expect(addAccountLink('acc-1', {}, actor)).rejects.toMatchObject({
      status: 400,
      details: [{ field: 'contactId', message: 'A contact is required.' }],
    });
  });

  it('rejects a whitespace-only contactId', async () => {
    db.account.findFirst.mockResolvedValue(accountRow());
    await expect(addAccountLink('acc-1', { contactId: '  ' }, actor)).rejects.toMatchObject({
      status: 400,
    });
  });

  it('throws 404 when the contact does not exist', async () => {
    db.account.findFirst.mockResolvedValue(accountRow());
    db.contact.findFirst.mockResolvedValue(null);
    await expect(addAccountLink('acc-1', { contactId: 'missing' }, actor)).rejects.toMatchObject({
      status: 404,
      message: 'Contact not found.',
    });
  });

  it('throws 404 when the contact is soft-deleted', async () => {
    db.account.findFirst.mockResolvedValue(accountRow());
    db.contact.findFirst.mockResolvedValue(null); // findFirst filters deletedAt: null
    await expect(addAccountLink('acc-1', { contactId: 'con-1' }, actor)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('creates a new link with primary=false and empty role by default', async () => {
    db.account.findFirst.mockResolvedValue(accountRow());
    db.contact.findFirst
      .mockResolvedValueOnce(contactRow({ accountLinks: [] }))
      .mockResolvedValue(contactRow({ accountLinks: [link({ primary: false, role: '' })] }));
    const result = await addAccountLink('acc-1', { contactId: 'con-1' }, actor);
    expect(db.contactAccountLink.create).toHaveBeenCalledWith({
      data: { contactId: 'con-1', accountId: 'acc-1', primary: false, role: '' },
    });
    expect(db.contactAccountLink.update).not.toHaveBeenCalled();
    expect(result.accountLinks).toEqual([{ accountId: 'acc-1', primary: false, role: '' }]);
  });

  it('does not treat a truthy non-boolean primary as true on create', async () => {
    db.account.findFirst.mockResolvedValue(accountRow());
    db.contact.findFirst
      .mockResolvedValueOnce(contactRow({ accountLinks: [] }))
      .mockResolvedValue(contactRow());
    await addAccountLink('acc-1', { contactId: 'con-1', primary: 'yes' }, actor);
    expect(db.contactAccountLink.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ primary: false }),
    });
  });

  it('creates the link as primary when primary=true', async () => {
    db.account.findFirst.mockResolvedValue(accountRow());
    db.contact.findFirst
      .mockResolvedValueOnce(contactRow({ accountLinks: [] }))
      .mockResolvedValue(contactRow({ accountLinks: [link({ primary: true })] }));
    await addAccountLink('acc-1', { contactId: 'con-1', primary: true }, actor);
    expect(db.contactAccountLink.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ primary: true }),
    });
  });

  it('updates the existing link instead of creating a duplicate', async () => {
    db.account.findFirst.mockResolvedValue(accountRow());
    db.contact.findFirst
      .mockResolvedValueOnce(
        contactRow({ accountLinks: [link({ primary: false, role: 'Old role' })] }),
      )
      .mockResolvedValue(contactRow({ accountLinks: [link({ primary: true, role: 'Champion' })] }));
    const result = await addAccountLink(
      'acc-1',
      { contactId: 'con-1', primary: true, role: 'Champion' },
      actor,
    );
    expect(db.contactAccountLink.create).not.toHaveBeenCalled();
    expect(db.contactAccountLink.update).toHaveBeenCalledWith({
      where: { contactId_accountId: { contactId: 'con-1', accountId: 'acc-1' } },
      data: { primary: true, role: 'Champion' },
    });
    expect(result.accountLinks).toEqual([{ accountId: 'acc-1', primary: true, role: 'Champion' }]);
  });

  it('keeps the existing primary/role when those fields are not supplied', async () => {
    db.account.findFirst.mockResolvedValue(accountRow());
    db.contact.findFirst
      .mockResolvedValueOnce(
        contactRow({ accountLinks: [link({ primary: true, role: 'Champion' })] }),
      )
      .mockResolvedValue(contactRow());
    await addAccountLink('acc-1', { contactId: 'con-1' }, actor);
    expect(db.contactAccountLink.update).toHaveBeenCalledWith({
      where: { contactId_accountId: { contactId: 'con-1', accountId: 'acc-1' } },
      data: { primary: true, role: 'Champion' },
    });
  });

  it('stamps the contact with updatedBy/updatedAt for the actor', async () => {
    db.account.findFirst.mockResolvedValue(accountRow());
    db.contact.findFirst
      .mockResolvedValueOnce(contactRow({ accountLinks: [] }))
      .mockResolvedValue(contactRow());
    await addAccountLink('acc-1', { contactId: 'con-1' }, actor);
    expect(db.contact.update).toHaveBeenCalledWith({
      where: { id: 'con-1' },
      data: { updatedAt: expect.any(Date), updatedBy: 'user-1' },
    });
  });
});

describe('removeAccountLink', () => {
  it('throws 404 when the contact does not exist', async () => {
    db.contact.findFirst.mockResolvedValue(null);
    await expect(removeAccountLink('acc-1', 'missing', actor)).rejects.toMatchObject({
      status: 404,
      message: 'Contact not found.',
    });
    expect(db.contactAccountLink.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes only the link between the given account and contact', async () => {
    db.contact.findFirst.mockResolvedValue(contactRow());
    await removeAccountLink('acc-1', 'con-1', actor);
    expect(db.contactAccountLink.deleteMany).toHaveBeenCalledWith({
      where: { contactId: 'con-1', accountId: 'acc-1' },
    });
  });

  it('stamps the contact and returns the refreshed serialized contact', async () => {
    db.contact.findFirst
      .mockResolvedValueOnce(contactRow())
      .mockResolvedValue(contactRow({ accountLinks: [] }));
    const result = await removeAccountLink('acc-1', 'con-1', actor);
    expect(db.contact.update).toHaveBeenCalledWith({
      where: { id: 'con-1' },
      data: { updatedAt: expect.any(Date), updatedBy: 'user-1' },
    });
    expect(result.accountLinks).toEqual([]);
  });
});
