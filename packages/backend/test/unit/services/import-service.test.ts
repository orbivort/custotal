// Unit tests for the CSV import service (FR-IN-01).
// Pure unit tests: the Prisma client is mocked at the module boundary, no
// database is required. Real validation helpers, serializers and error
// factories are used so wire-shape mapping and error envelopes are exercised.
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the Prisma singleton before importing the service under test.
vi.mock('../../../src/db.ts', () => ({
  prisma: {
    contact: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    account: {
      create: vi.fn(),
    },
    importMappingTemplate: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { prisma } from '../../../src/db.ts';
import type {
  DuplicatePolicy,
  ImportDryRunResult,
  ImportMappingTemplate,
} from '../../../src/types/domain.ts';
import type { User } from '../../../src/types/domain.ts';
import {
  commitImport,
  deleteTemplate,
  dryRun,
  listTemplates,
  saveTemplate,
} from '../../../src/services/import-service.ts';

// Structurally-typed view over the mocked prisma for ergonomic assertions.
type Mock = ReturnType<typeof vi.fn>;

interface PrismaMock {
  contact: {
    findMany: Mock;
    findUnique: Mock;
    create: Mock;
    update: Mock;
  };
  user: { findUnique: Mock };
  account: { create: Mock };
  importMappingTemplate: {
    findMany: Mock;
    findUnique: Mock;
    update: Mock;
    create: Mock;
    delete: Mock;
  };
}

const db = prisma as unknown as PrismaMock;

const admin: User = { id: 'user-1', name: 'Alice', email: 'alice@example.com', role: 'admin' };

let now: Date;

function templateRow(overrides: Partial<ImportMappingTemplate> & { id?: string } = {}) {
  return {
    id: 'tpl-1',
    entity: 'contact',
    name: 'Standard contacts',
    mapping: { 'First Name': 'firstName', Email: 'email' },
    ownerColumn: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** Default: no existing contacts, no owner users, no templates. */
function primeDefaults(): void {
  db.contact.findMany.mockResolvedValue([]);
  db.contact.findUnique.mockResolvedValue(null);
  db.user.findUnique.mockResolvedValue(null);
  db.importMappingTemplate.findMany.mockResolvedValue([]);
  db.importMappingTemplate.findUnique.mockResolvedValue(null);
}

beforeEach(() => {
  vi.clearAllMocks();
  now = new Date('2026-01-15T10:00:00.000Z');
  primeDefaults();
});

// ---- Mapping templates -----------------------------------------------------

describe('listTemplates', () => {
  it('queries all templates ordered by name when no entity is given', async () => {
    const row = templateRow();
    db.importMappingTemplate.findMany.mockResolvedValue([row]);

    const result = await listTemplates();

    expect(db.importMappingTemplate.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { name: 'asc' },
    });
    expect(result).toEqual([
      {
        id: 'tpl-1',
        entity: 'contact',
        name: 'Standard contacts',
        mapping: { 'First Name': 'firstName', Email: 'email' },
        ownerColumn: undefined, // null on the row becomes undefined on the wire
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    ]);
  });

  it('filters by entity when one is provided', async () => {
    db.importMappingTemplate.findMany.mockResolvedValue([]);
    await listTemplates('account');
    expect(db.importMappingTemplate.findMany).toHaveBeenCalledWith({
      where: { entity: 'account' },
      orderBy: { name: 'asc' },
    });
  });
});

describe('saveTemplate', () => {
  it('rejects an unknown entity with a validation error on the entity field', async () => {
    await expect(
      saveTemplate({ entity: 'deal', name: 'T', mapping: { A: 'name' } }),
    ).rejects.toMatchObject({
      status: 400,
      code: 'validation',
      details: [{ field: 'entity', message: 'Unknown import entity.' }],
    });
  });

  it('defaults the entity to contact when omitted', async () => {
    const created = templateRow({ entity: 'contact' });
    db.importMappingTemplate.create.mockResolvedValue(created);

    const result = await saveTemplate({ name: 'T', mapping: { Email: 'email' } });

    expect(db.importMappingTemplate.create).toHaveBeenCalledWith({
      data: { entity: 'contact', name: 'T', mapping: { Email: 'email' }, ownerColumn: null },
    });
    expect(result.entity).toBe('contact');
  });

  it.each([undefined, '   '])('rejects a missing or blank name (name=%p)', async (name) => {
    await expect(saveTemplate({ name, mapping: { A: 'firstName' } })).rejects.toMatchObject({
      status: 400,
      details: [{ field: 'name', message: 'Template name is required.' }],
    });
  });

  it('rejects an empty mapping', async () => {
    await expect(saveTemplate({ name: 'T', mapping: {} })).rejects.toMatchObject({
      status: 400,
      details: [{ field: 'mapping', message: 'Map at least one column before saving.' }],
    });
  });

  it('updates the existing template when entity+name already exist', async () => {
    const existing = templateRow({ id: 'tpl-9' });
    const updated = templateRow({ id: 'tpl-9', ownerColumn: 'Owner' });
    db.importMappingTemplate.findUnique.mockResolvedValue(existing);
    db.importMappingTemplate.update.mockResolvedValue(updated);

    const result = await saveTemplate({
      entity: 'contact',
      name: 'Standard contacts',
      mapping: { Email: 'email' },
      ownerColumn: 'Owner',
    });

    expect(db.importMappingTemplate.findUnique).toHaveBeenCalledWith({
      where: { entity_name: { entity: 'contact', name: 'Standard contacts' } },
    });
    expect(db.importMappingTemplate.update).toHaveBeenCalledWith({
      where: { id: 'tpl-9' },
      data: { mapping: { Email: 'email' }, ownerColumn: 'Owner', updatedAt: expect.any(Date) },
    });
    expect(db.importMappingTemplate.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: 'tpl-9', ownerColumn: 'Owner' });
  });

  it('creates a new template when none exists, nulling a missing ownerColumn', async () => {
    const created = templateRow({ id: 'tpl-2' });
    db.importMappingTemplate.create.mockResolvedValue(created);

    const result = await saveTemplate({
      entity: 'account',
      name: 'Accounts',
      mapping: { Name: 'name' },
    });

    expect(db.importMappingTemplate.create).toHaveBeenCalledWith({
      data: { entity: 'account', name: 'Accounts', mapping: { Name: 'name' }, ownerColumn: null },
    });
    expect(db.importMappingTemplate.update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: 'tpl-2' });
  });
});

describe('deleteTemplate', () => {
  it('throws 404 when the template does not exist', async () => {
    await expect(deleteTemplate('missing')).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    });
    expect(db.importMappingTemplate.delete).not.toHaveBeenCalled();
  });

  it('deletes the template when it exists', async () => {
    db.importMappingTemplate.findUnique.mockResolvedValue(templateRow({ id: 'tpl-1' }));
    db.importMappingTemplate.delete.mockResolvedValue(undefined);

    await expect(deleteTemplate('tpl-1')).resolves.toBeUndefined();

    expect(db.importMappingTemplate.delete).toHaveBeenCalledWith({ where: { id: 'tpl-1' } });
  });
});

// ---- Dry run ---------------------------------------------------------------

describe('dryRun — contact', () => {
  it('classifies valid rows and reports counts, indexing rows from 1', async () => {
    const result = await dryRun('contact', [
      { firstName: 'Bob', lastName: 'Builder', email: 'bob@example.com' },
      { firstName: 'Ann', lastName: 'Lee', phone: '+1-555-0100' },
    ]);

    expect(db.contact.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null, email: { not: null } },
      select: { id: true, email: true },
    });
    expect(result.entity).toBe('contact');
    expect(result.validCount).toBe(2);
    expect(result.errorCount).toBe(0);
    expect(result.rows[0]).toMatchObject({ index: 1, valid: true, reasons: [] });
    expect(result.rows[0].duplicate).toBeUndefined();
    expect(result.rows[1]).toMatchObject({ index: 2, valid: true });
  });

  it('collects all validation reasons for an invalid row', async () => {
    const result: ImportDryRunResult = await dryRun('contact', [
      { email: 'not-an-email', status: 'maybe' },
    ]);

    const row = result.rows[0];
    expect(row.valid).toBe(false);
    expect(row.reasons).toEqual([
      'First name is required.',
      'Last name is required.',
      'Invalid email format.',
      'Status must be "active" or "inactive".',
    ]);
  });

  it('keeps a row valid when phone substitutes for a missing email', async () => {
    const result = await dryRun('contact', [{ firstName: 'A', lastName: 'B', phone: '123' }]);
    expect(result.rows[0].valid).toBe(true);
    expect(result.validCount).toBe(1);
  });

  it('drops columns that are not import fields', async () => {
    const result = await dryRun('contact', [
      { firstName: 'A', lastName: 'B', email: 'a@b.co', secretColumn: 'x' },
    ]);
    expect(result.rows[0].data).toEqual({
      firstName: 'A',
      lastName: 'B',
      email: 'a@b.co',
    });
  });

  it('marks rows duplicating an existing contact email (case-insensitive)', async () => {
    db.contact.findMany.mockResolvedValue([{ id: 'con-1', email: 'BOB@Example.com' }]);

    const result = await dryRun('contact', [
      { firstName: 'Bob', lastName: 'Builder', email: 'bob@example.com' },
      { firstName: 'Ann', lastName: 'Lee', phone: '+1-555-0101' },
    ]);

    expect(result.rows[0].duplicate).toBe(true);
    expect(result.rows[1].duplicate).toBeUndefined();
    // Duplicates still count as "not valid for import".
    expect(result.validCount).toBe(1);
    expect(result.errorCount).toBe(1);
  });

  it('marks in-batch duplicates: the second row with the same email', async () => {
    const result = await dryRun('contact', [
      { firstName: 'Bob', lastName: 'Builder', email: 'bob@example.com' },
      { firstName: 'Bob 2', lastName: 'Builder', email: 'Bob@Example.com' },
    ]);

    expect(result.rows[0].duplicate).toBeUndefined();
    expect(result.rows[1].duplicate).toBe(true);
    expect(result.validCount).toBe(1);
  });

  it('ignores blank emails when matching duplicates', async () => {
    db.contact.findMany.mockResolvedValue([{ id: 'con-1', email: null }]);
    const result = await dryRun('contact', [{ firstName: 'A', lastName: 'B', phone: '123' }]);
    expect(result.rows[0].duplicate).toBeUndefined();
  });
});

describe('dryRun — account', () => {
  it('validates accounts by required name and never touches contacts', async () => {
    const result = await dryRun('account', [
      { name: 'Acme' },
      { industry: 'Tech' }, // no name -> invalid
    ]);

    expect(db.contact.findMany).not.toHaveBeenCalled();
    expect(result.rows[0]).toMatchObject({ index: 1, valid: true, reasons: [] });
    expect(result.rows[1]).toMatchObject({
      index: 2,
      valid: false,
      reasons: ['Account name is required.'],
    });
    expect(result.validCount).toBe(1);
    expect(result.errorCount).toBe(1);
  });
});

// ---- Commit ----------------------------------------------------------------

describe('commitImport — contact', () => {
  const policy: DuplicatePolicy = 'skip';

  it('creates valid rows with normalized fields and admin attribution', async () => {
    db.contact.create.mockResolvedValue({ id: 'con-new' });

    const summary = await commitImport(
      'contact',
      [
        {
          firstName: ' Bob ',
          lastName: 'Builder',
          email: 'BOB@Example.com',
          status: 'inactive',
          notes: 'hi',
        },
      ],
      policy,
      admin,
    );

    expect(db.contact.create).toHaveBeenCalledTimes(1);
    const { data } = db.contact.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data).toMatchObject({
      firstName: 'Bob', // trimmed
      lastName: 'Builder',
      email: 'bob@example.com', // lowercased
      phone: null, // missing -> null, not undefined
      status: 'inactive',
      createdBy: 'user-1',
      updatedBy: 'user-1',
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
    });
    expect(summary).toEqual({ entity: 'contact', created: 1, updated: 0, skipped: 0, failed: 0 });
  });

  it('defaults status to active when absent', async () => {
    db.contact.create.mockResolvedValue({ id: 'con-new' });
    await commitImport('contact', [{ firstName: 'A', lastName: 'B', phone: '1' }], policy, admin);
    const { data } = db.contact.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data.status).toBe('active');
    expect(data.email).toBeNull();
  });

  it('counts invalid rows as failed without creating them', async () => {
    const summary = await commitImport(
      'contact',
      [{ lastName: 'NoFirstName' }, { firstName: 'A', lastName: 'B', phone: '1' }],
      policy,
      admin,
    );

    expect(db.contact.create).toHaveBeenCalledTimes(1);
    expect(summary.failed).toBe(1);
    expect(summary.created).toBe(1);
  });

  it('skips duplicates under the skip policy', async () => {
    db.contact.findMany.mockResolvedValue([{ id: 'con-1', email: 'bob@example.com' }]);

    const summary = await commitImport(
      'contact',
      [{ firstName: 'Bob', lastName: 'Builder', email: 'bob@example.com' }],
      'skip',
      admin,
    );

    expect(db.contact.create).not.toHaveBeenCalled();
    expect(db.contact.update).not.toHaveBeenCalled();
    expect(summary).toEqual({ entity: 'contact', created: 0, updated: 0, skipped: 1, failed: 0 });
  });

  it('overwrites duplicates under the overwrite policy, keeping blank incoming fields', async () => {
    db.contact.findMany.mockResolvedValue([{ id: 'con-1', email: 'bob@example.com' }]);
    db.contact.findUnique.mockResolvedValue({
      id: 'con-1',
      firstName: 'Bob',
      lastName: 'Builder',
      phone: '+1-555-0100',
      jobTitle: null,
      company: 'Old Corp',
      address: null,
      notes: null,
      status: 'inactive',
    });
    db.contact.update.mockResolvedValue({ id: 'con-1' });

    const summary = await commitImport(
      'contact',
      [
        {
          firstName: 'Robert',
          lastName: 'Builder',
          email: 'bob@example.com',
          jobTitle: 'CTO',
          status: 'active',
        },
      ], // no phone on purpose
      'overwrite',
      admin,
    );

    expect(db.contact.update).toHaveBeenCalledWith({
      where: { id: 'con-1' },
      data: expect.objectContaining({
        firstName: 'Robert', // non-empty incoming value wins
        lastName: 'Builder', // blank incoming value keeps existing
        phone: '+1-555-0100',
        jobTitle: 'CTO',
        company: 'Old Corp',
        status: 'active',
        updatedBy: 'user-1',
        updatedAt: expect.any(Date),
      }),
    });
    // Email itself is never updated by the import.
    const call = db.contact.update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data).not.toHaveProperty('email');
    expect(summary.updated).toBe(1);
    expect(summary.created).toBe(0);
  });

  it('rejects a row with an invalid status even under the overwrite policy', async () => {
    db.contact.findMany.mockResolvedValue([{ id: 'con-1', email: 'bob@example.com' }]);

    const summary = await commitImport(
      'contact',
      [{ firstName: 'B', lastName: 'B', email: 'bob@example.com', status: 'weird' }],
      'overwrite',
      admin,
    );

    // Validation happens before any overwrite, so the update is never reached.
    expect(db.contact.update).not.toHaveBeenCalled();
    expect(summary.failed).toBe(1);
    expect(summary.updated).toBe(0);
  });

  it('silently ignores an overwrite when the target contact disappeared', async () => {
    db.contact.findMany.mockResolvedValue([{ id: 'con-1', email: 'bob@example.com' }]);
    db.contact.findUnique.mockResolvedValue(null); // deleted between the two reads

    const summary = await commitImport(
      'contact',
      [{ firstName: 'Bob', lastName: 'Builder', email: 'bob@example.com' }],
      'overwrite',
      admin,
    );

    expect(db.contact.update).not.toHaveBeenCalled();
    expect(summary.updated).toBe(1); // counted as updated despite the miss
  });

  it('deduplicates rows created within the same run', async () => {
    db.contact.create.mockResolvedValue({ id: 'con-new' });

    const summary = await commitImport(
      'contact',
      [
        { firstName: 'Bob', lastName: 'Builder', email: 'bob@example.com' },
        { firstName: 'Bob 2', lastName: 'Builder', email: 'bob@example.com' },
      ],
      'skip',
      admin,
    );

    expect(db.contact.create).toHaveBeenCalledTimes(1);
    expect(summary.created).toBe(1);
    expect(summary.skipped).toBe(1);
  });

  it('overwrites a contact created earlier in the same run', async () => {
    db.contact.create
      .mockResolvedValueOnce({ id: 'con-new' })
      .mockResolvedValueOnce({ id: 'con-new-2' });
    db.contact.findUnique.mockResolvedValue({
      id: 'con-new',
      firstName: 'Bob',
      lastName: 'Builder',
    });

    const summary = await commitImport(
      'contact',
      [
        { firstName: 'Bob', lastName: 'Builder', email: 'bob@example.com' },
        { firstName: 'Robert', lastName: 'Builder', email: 'bob@example.com' },
      ],
      'overwrite',
      admin,
    );

    expect(db.contact.create).toHaveBeenCalledTimes(1);
    expect(db.contact.update).toHaveBeenCalledWith({
      where: { id: 'con-new' },
      data: expect.objectContaining({ firstName: 'Robert' }),
    });
    expect(summary.created).toBe(1);
    expect(summary.updated).toBe(1);
  });

  it('always creates rows without an email, even under the skip policy', async () => {
    db.contact.create.mockResolvedValue({ id: 'con-new' });

    const summary = await commitImport(
      'contact',
      [
        { firstName: 'A', lastName: 'B', phone: '1' },
        { firstName: 'C', lastName: 'D', phone: '2' },
      ],
      'skip',
      admin,
    );

    expect(db.contact.create).toHaveBeenCalledTimes(2);
    expect(summary.created).toBe(2);
    expect(summary.skipped).toBe(0);
  });
});

describe('commitImport — account', () => {
  it('creates accounts owned by the admin when no ownerEmail is given', async () => {
    db.account.create.mockResolvedValue({ id: 'acc-new' });

    const summary = await commitImport(
      'account',
      [{ name: 'Acme', industry: 'Tech' }],
      'skip',
      admin,
    );

    expect(db.account.create).toHaveBeenCalledTimes(1);
    const { data } = db.account.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data).toMatchObject({
      name: 'Acme',
      industry: 'Tech',
      website: null,
      phone: null,
      billingAddress: null,
      notes: null,
      ownerId: 'user-1',
      createdBy: 'user-1',
      updatedBy: 'user-1',
    });
    expect(summary).toEqual({ entity: 'account', created: 1, updated: 0, skipped: 0, failed: 0 });
  });

  it('resolves ownerEmail to an existing user id (case-insensitively)', async () => {
    db.user.findUnique.mockResolvedValue({ id: 'user-42', email: 'owner@example.com' });
    db.account.create.mockResolvedValue({ id: 'acc-new' });

    await commitImport(
      'account',
      [{ name: 'Acme', ownerEmail: 'Owner@Example.com' }],
      'skip',
      admin,
    );

    expect(db.user.findUnique).toHaveBeenCalledWith({ where: { email: 'owner@example.com' } });
    const { data } = db.account.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data.ownerId).toBe('user-42');
  });

  it('falls back to the admin id when ownerEmail matches no user', async () => {
    db.account.create.mockResolvedValue({ id: 'acc-new' });

    await commitImport(
      'account',
      [{ name: 'Acme', ownerEmail: 'ghost@example.com' }],
      'skip',
      admin,
    );

    const { data } = db.account.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data.ownerId).toBe('user-1');
  });

  it('counts rows without a name as failed without creating them', async () => {
    const summary = await commitImport('account', [{ website: 'https://x.io' }], 'skip', admin);

    expect(db.account.create).not.toHaveBeenCalled();
    expect(summary.failed).toBe(1);
    expect(summary.created).toBe(0);
  });
});
