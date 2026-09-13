// Unit tests for the contact service (FR-CM-01/04/05, FR-CC-13/16).
// Pure unit tests: the Prisma client is mocked at the module boundary, so no
// database is required. Covers list filtering/pagination/sorting, get, create
// validation + account-link resolution, optimistic-concurrency updates,
// soft delete, and the single-contact export.
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  createContact,
  exportContact,
  getContact,
  listContacts,
  softDeleteContact,
  updateContact,
} from '../../../src/services/contact-service.ts';
import type { User } from '../../../src/types/domain.ts';

vi.mock('../../../src/db.ts', () => ({
  prisma: {
    contact: {
      count: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    account: { findFirst: vi.fn(), findMany: vi.fn() },
    contactAccountLink: { deleteMany: vi.fn(), createMany: vi.fn() },
    interaction: { findMany: vi.fn() },
    opportunity: { findMany: vi.fn() },
    task: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

// The mocked db module replaces the real one, so config/env is never loaded.
const { prisma } = (await import('../../../src/db.ts')) as unknown as {
  prisma: Record<string, Record<string, Mock>> & { $transaction: Mock };
};

const actor: User = { id: 'u1', name: 'Admin', email: 'admin@example.com', role: 'admin' };

const NOW = new Date('2026-01-15T10:00:00.000Z');

function contactRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    phone: null,
    jobTitle: 'Engineer',
    company: 'Analytical Engines',
    address: null,
    notes: null,
    status: 'active',
    createdAt: NOW,
    createdBy: 'u1',
    updatedAt: NOW,
    updatedBy: 'u1',
    deletedAt: null,
    accountLinks: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default $transaction implementation: run the callback with the mock itself as tx.
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
});

describe('listContacts', () => {
  it('applies default pagination (page 1, pageSize 25) and updatedAt desc order', async () => {
    prisma.contact.count.mockResolvedValue(1);
    prisma.contact.findMany.mockResolvedValue([contactRow()]);

    const result = await listContacts({});

    expect(prisma.contact.count).toHaveBeenCalledWith({ where: { deletedAt: null } });
    expect(prisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null },
        orderBy: [{ updatedAt: 'desc' }],
        skip: 0,
        take: 25,
        include: { accountLinks: true },
      }),
    );
    expect(result).toMatchObject({ total: 1, page: 1, pageSize: 25 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 'c1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      phone: undefined, // null coerced to undefined on the wire type
      status: 'active',
      updatedAt: NOW.toISOString(),
    });
  });

  it.each([
    [0, 500, 1, 100], // clamped low/high
    [-3, -1, 1, 1],
    [Number.NaN, Number.NaN, 1, 25],
    [3, 10, 3, 10],
  ])(
    'clamps page=%s/pageSize=%s to page=%s/pageSize=%s',
    async (page, pageSize, expPage, expSize) => {
      prisma.contact.count.mockResolvedValue(0);
      prisma.contact.findMany.mockResolvedValue([]);

      const result = await listContacts({ page, pageSize });

      expect(prisma.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: (expPage - 1) * expSize, take: expSize }),
      );
      expect(result).toMatchObject({ page: expPage, pageSize: expSize });
    },
  );

  it('builds a case-insensitive OR search across the four searchable fields', async () => {
    prisma.contact.count.mockResolvedValue(0);
    prisma.contact.findMany.mockResolvedValue([]);

    await listContacts({ q: '  Ada  ' });

    const { where } = prisma.contact.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(where.OR).toEqual([
      { firstName: { contains: 'ada', mode: 'insensitive' } },
      { lastName: { contains: 'ada', mode: 'insensitive' } },
      { email: { contains: 'ada', mode: 'insensitive' } },
      { company: { contains: 'ada', mode: 'insensitive' } },
    ]);
  });

  it('combines status, first-letter and owner filters', async () => {
    prisma.contact.count.mockResolvedValue(0);
    prisma.contact.findMany.mockResolvedValue([]);

    await listContacts({ status: 'active', letter: 'b', owner: 'u9' });

    const { where } = prisma.contact.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(where).toMatchObject({
      deletedAt: null,
      status: 'active',
      lastName: { startsWith: 'B', mode: 'insensitive' },
      accountLinks: { some: { account: { ownerId: 'u9', deletedAt: null } } },
    });
  });

  it('ignores a non-single-character letter filter', async () => {
    prisma.contact.count.mockResolvedValue(0);
    prisma.contact.findMany.mockResolvedValue([]);

    await listContacts({ letter: 'AB' });

    const { where } = prisma.contact.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(where).not.toHaveProperty('lastName');
  });

  it.each([
    ['name', [{ lastName: 'asc' }, { firstName: 'asc' }, { updatedAt: 'desc' }]],
    ['name_desc', [{ lastName: 'desc' }, { firstName: 'desc' }, { updatedAt: 'desc' }]],
    ['updated', [{ updatedAt: 'asc' }]],
    ['bogus', [{ updatedAt: 'desc' }]],
  ])('maps sort=%s to the expected ORDER BY', async (sort, orderBy) => {
    prisma.contact.count.mockResolvedValue(0);
    prisma.contact.findMany.mockResolvedValue([]);

    await listContacts({ sort });

    expect(prisma.contact.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy }));
  });
});

describe('getContact', () => {
  it('returns the serialized contact when found (soft-deleted rows excluded)', async () => {
    const row = contactRow();
    prisma.contact.findFirst.mockResolvedValue(row);

    const contact = await getContact('c1');

    expect(prisma.contact.findFirst).toHaveBeenCalledWith({
      where: { id: 'c1', deletedAt: null },
      include: { accountLinks: true },
    });
    expect(contact.id).toBe('c1');
    expect(contact.accountLinks).toEqual([]);
  });

  it('throws 404 not_found when the contact does not exist', async () => {
    prisma.contact.findFirst.mockResolvedValue(null);

    await expect(getContact('missing')).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
      message: 'Contact not found.',
    });
  });
});

describe('createContact', () => {
  it('requires both first and last name, reporting both fields', async () => {
    const err = await createContact({ email: 'x@example.com' }, actor).catch((e) => e);
    expect(err.status).toBe(400);
    expect(err.details).toEqual([
      { field: 'firstName', message: 'First name is required.' },
      { field: 'lastName', message: 'Last name is required.' },
    ]);
    expect(prisma.contact.create).not.toHaveBeenCalled();
  });

  it('rejects whitespace-only names', async () => {
    await expect(createContact({ firstName: '   ', lastName: '\t' }, actor)).rejects.toMatchObject({
      status: 400,
      code: 'validation',
    });
  });

  it('rejects a malformed email with the standard field message', async () => {
    const err = await createContact(
      { firstName: 'Ada', lastName: 'Lovelace', email: 'not-an-email', phone: '123' },
      actor,
    ).catch((e) => e);
    expect(err.status).toBe(400);
    expect(err.details).toEqual([{ field: 'email', message: 'Invalid email format.' }]);
  });

  it('requires at least one of email or phone', async () => {
    const err = await createContact({ firstName: 'Ada', lastName: 'Lovelace' }, actor).catch(
      (e) => e,
    );
    expect(err.details).toEqual([
      { field: 'phone', message: 'At least one of email or phone is required.' },
    ]);
  });

  it('rejects a status outside active/inactive', async () => {
    const err = await createContact(
      {
        firstName: 'Ada',
        lastName: 'Lovelace',
        phone: '123',
        status: 'archived' as unknown as 'inactive',
      },
      actor,
    ).catch((e) => e);
    expect(err.details).toEqual([
      { field: 'status', message: 'Status must be "active" or "inactive".' },
    ]);
  });

  it('creates the contact with defaults: trims names, nulls empty fields, active status, actor stamps', async () => {
    prisma.contact.create.mockResolvedValue(contactRow({ firstName: 'Grace', lastName: 'Hopper' }));

    const contact = await createContact(
      {
        firstName: '  Grace  ',
        lastName: 'Hopper',
        email: '  ',
        notes: '',
        jobTitle: 'Rear Admiral',
        phone: '555-0100',
      },
      actor,
    );

    expect(prisma.contact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        firstName: 'Grace',
        lastName: 'Hopper',
        email: null, // whitespace-only becomes null
        phone: '555-0100',
        jobTitle: 'Rear Admiral',
        company: null,
        address: null,
        notes: null,
        status: 'active',
        createdBy: 'u1',
        updatedBy: 'u1',
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
      include: { accountLinks: true },
    });
    expect(contact).toMatchObject({ firstName: 'Grace', lastName: 'Hopper', status: 'active' });
  });

  it('honors the inactive status', async () => {
    prisma.contact.create.mockResolvedValue(contactRow({ status: 'inactive' }));

    await createContact({ firstName: 'A', lastName: 'B', phone: '1', status: 'inactive' }, actor);

    expect(prisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'inactive' }) }),
    );
  });

  it('resolves account links: dedupes, drops unknown accounts, applies primary/role defaults', async () => {
    prisma.contact.create.mockResolvedValue(contactRow());
    // a1 exists, a2 is soft-deleted/missing, the duplicate and blank id are skipped.
    prisma.account.findMany.mockResolvedValue([{ id: 'a1' }]);

    await createContact(
      {
        firstName: 'Ada',
        lastName: 'Lovelace',
        phone: '1',
        accountLinks: [
          { accountId: 'a1' },
          { accountId: 'a1', primary: true }, // duplicate ignored
          { accountId: 'a2', primary: true, role: 'Owner' }, // account missing
          { accountId: '   ' }, // blank ignored
        ],
      },
      actor,
    );

    // Both candidate ids are queried in one batch; only the existing one survives.
    expect(prisma.account.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['a1', 'a2'] }, deletedAt: null },
      select: { id: true },
    });
    expect(prisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountLinks: { create: [{ accountId: 'a1', primary: false, role: '' }] },
        }),
      }),
    );
  });
});

describe('updateContact', () => {
  const existing = contactRow({ updatedAt: new Date('2026-01-10T09:00:00.000Z') });

  it('throws 404 when the contact does not exist', async () => {
    prisma.contact.findFirst.mockResolvedValue(null);

    await expect(updateContact('missing', { firstName: 'X' }, actor)).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    });
  });

  it('throws 409 conflict on an updatedAt token mismatch (FR-CC-13)', async () => {
    prisma.contact.findFirst.mockResolvedValue(existing);

    await expect(
      updateContact('c1', { firstName: 'X', updatedAt: '2020-01-01T00:00:00.000Z' }, actor),
    ).rejects.toMatchObject({ status: 409, code: 'conflict' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('skips the conflict check when no updatedAt token is sent', async () => {
    prisma.contact.findFirst.mockResolvedValue(existing);
    prisma.contact.findUniqueOrThrow.mockResolvedValue(existing);

    await updateContact('c1', { firstName: 'X' }, actor);

    expect(prisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ firstName: 'X' }) }),
    );
  });

  it('merges partial input over existing values and stamps updatedBy/updatedAt', async () => {
    prisma.contact.findFirst.mockResolvedValue(existing);
    prisma.contact.findUniqueOrThrow.mockResolvedValue(existing);

    await updateContact('c1', { jobTitle: 'CTO' }, actor);

    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: expect.objectContaining({
        firstName: 'Ada', // unchanged
        lastName: 'Lovelace',
        email: 'ada@example.com',
        jobTitle: 'CTO', // changed
        status: 'active', // existing status preserved
        updatedBy: 'u1',
        updatedAt: expect.any(Date),
      }),
    });
  });

  it('keeps the existing status for an unrecognized status value', async () => {
    prisma.contact.findFirst.mockResolvedValue(existing);
    prisma.contact.findUniqueOrThrow.mockResolvedValue(existing);

    await updateContact('c1', { status: 'archived' as unknown as 'active' }, actor);

    expect(prisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'active' }) }),
    );
  });

  it('rejects a merged result with neither email nor phone', async () => {
    // Existing record has no email and no phone, so keeping both is invalid.
    prisma.contact.findFirst.mockResolvedValue(contactRow({ email: null, phone: null }));

    await expect(updateContact('c1', { notes: 'note' }, actor)).rejects.toMatchObject({
      status: 400,
      code: 'validation',
      details: [{ field: 'phone', message: 'At least one of email or phone is required.' }],
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('replaces account links inside a transaction when accountLinks is provided', async () => {
    prisma.contact.findFirst.mockResolvedValue(existing);
    prisma.account.findMany.mockResolvedValue([{ id: 'a1' }]);
    prisma.contactAccountLink.createMany.mockResolvedValue({ count: 1 });
    const updated = contactRow({
      accountLinks: [{ accountId: 'a1', primary: true, role: 'Owner' }],
    });
    prisma.contact.findUniqueOrThrow.mockResolvedValue(updated);

    const contact = await updateContact(
      'c1',
      { firstName: 'Ada', accountLinks: [{ accountId: 'a1', primary: true, role: 'Owner' }] },
      actor,
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.contactAccountLink.deleteMany).toHaveBeenCalledWith({
      where: { contactId: 'c1' },
    });
    expect(prisma.contactAccountLink.createMany).toHaveBeenCalledWith({
      data: [{ accountId: 'a1', primary: true, role: 'Owner', contactId: 'c1' }],
    });
    expect(contact.accountLinks).toEqual([{ accountId: 'a1', primary: true, role: 'Owner' }]);
  });

  it('deletes all links without creating new ones when the replacement list is empty', async () => {
    prisma.contact.findFirst.mockResolvedValue(existing);
    prisma.contact.findUniqueOrThrow.mockResolvedValue(existing);

    await updateContact('c1', { accountLinks: [] }, actor);

    expect(prisma.contactAccountLink.deleteMany).toHaveBeenCalled();
    expect(prisma.contactAccountLink.createMany).not.toHaveBeenCalled();
  });

  it('does not touch links when accountLinks is omitted', async () => {
    prisma.contact.findFirst.mockResolvedValue(existing);
    prisma.contact.findUniqueOrThrow.mockResolvedValue(existing);

    await updateContact('c1', { notes: 'note' }, actor);

    expect(prisma.contactAccountLink.deleteMany).not.toHaveBeenCalled();
    expect(prisma.contactAccountLink.createMany).not.toHaveBeenCalled();
  });
});

describe('softDeleteContact', () => {
  it('throws 404 when the contact does not exist', async () => {
    prisma.contact.findFirst.mockResolvedValue(null);

    await expect(softDeleteContact('missing')).rejects.toMatchObject({
      status: 404,
      message: 'Contact not found.',
    });
    expect(prisma.contact.update).not.toHaveBeenCalled();
  });

  it('stamps deletedAt/updatedAt while preserving updatedBy', async () => {
    const existing = contactRow({ updatedBy: 'u7' });
    prisma.contact.findFirst.mockResolvedValue(existing);
    prisma.contact.update.mockResolvedValue({ ...existing, deletedAt: NOW });

    await softDeleteContact('c1');

    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { deletedAt: expect.any(Date), updatedAt: expect.any(Date), updatedBy: 'u7' },
    });
  });
});

describe('exportContact', () => {
  it('returns the contact plus its non-deleted interactions, opportunities and tasks', async () => {
    prisma.contact.findFirst.mockResolvedValue(contactRow());
    const interactions = [{ id: 'i1' }];
    const opportunities = [{ id: 'o1' }];
    const tasks = [{ id: 't1' }];
    prisma.interaction.findMany.mockResolvedValue(interactions);
    prisma.opportunity.findMany.mockResolvedValue(opportunities);
    prisma.task.findMany.mockResolvedValue(tasks);

    const result = await exportContact('c1');

    expect(result.contact.id).toBe('c1');
    expect(result.interactions).toBe(interactions);
    expect(result.opportunities).toBe(opportunities);
    expect(result.tasks).toBe(tasks);
    expect(prisma.interaction.findMany).toHaveBeenCalledWith({
      where: { contactId: 'c1', deletedAt: null },
      orderBy: { dateTime: 'desc' },
    });
    expect(prisma.opportunity.findMany).toHaveBeenCalledWith({
      where: { contactId: 'c1', deletedAt: null },
    });
    expect(prisma.task.findMany).toHaveBeenCalledWith({
      where: { contactId: 'c1', deletedAt: null },
    });
  });

  it('propagates 404 when the contact does not exist', async () => {
    prisma.contact.findFirst.mockResolvedValue(null);

    await expect(exportContact('missing')).rejects.toMatchObject({ status: 404 });
    expect(prisma.interaction.findMany).not.toHaveBeenCalled();
  });
});

describe('error envelope sanity', () => {
  it('thrown errors are ApiError instances from the shared factory', async () => {
    prisma.contact.findFirst.mockResolvedValue(null);
    const err = await getContact('x').catch((e) => e);
    expect(err.name).toBe('ApiError');
    expect(err.status).toBe(404);
  });
});
