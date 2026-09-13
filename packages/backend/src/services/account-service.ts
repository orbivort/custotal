// Accounts: CRUD, soft delete, contact links with primary flag (FR-CM-02/03),
// and the account detail payload (account + linked contacts + opportunities).
import { prisma } from '../db.ts';
import { errors } from '../lib/errors.ts';
import { assertNoConflict, optionalString } from '../lib/validation.ts';
import { toAccount, toContact, toOpportunity } from '../serializers.ts';
import type { User } from '../types/domain.ts';

export interface AccountListParams {
  q?: string;
  owner?: string;
  /** First-letter filter on the account name (single A-Z character). */
  letter?: string;
  /** 'name' | 'name_desc' sort on account name; anything else sorts by updatedAt desc. */
  sort?: string;
  page?: number;
  pageSize?: number;
}

/** Builds the ORDER BY for the accounts list (FR-CM-05: name/modified sort). */
function accountOrderBy(sort?: string) {
  if (sort === 'name') return [{ name: 'asc' as const }, { updatedAt: 'desc' as const }];
  if (sort === 'name_desc') return [{ name: 'desc' as const }, { updatedAt: 'desc' as const }];
  if (sort === 'updated') return [{ updatedAt: 'asc' as const }];
  return [{ updatedAt: 'desc' as const }];
}

export async function listAccounts(params: AccountListParams) {
  const page = Number.isFinite(params.page) ? Math.max(1, Math.trunc(params.page ?? 1)) : 1;
  const pageSize = Number.isFinite(params.pageSize)
    ? Math.min(100, Math.max(1, Math.trunc(params.pageSize ?? 25)))
    : 25;
  const q = optionalString(params.q)?.toLowerCase();
  const owner = optionalString(params.owner);
  // FR-CM-05 first-letter filter: only a single A-Z character applies.
  const letter = optionalString(params.letter)?.trim();
  const letterMatch = letter && /^[a-z]$/i.test(letter) ? letter.toUpperCase() : null;

  const where = {
    deletedAt: null,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' as const } },
            { industry: { contains: q, mode: 'insensitive' as const } },
            { website: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...(letterMatch ? { name: { startsWith: letterMatch, mode: 'insensitive' as const } } : {}),
    ...(owner ? { ownerId: owner } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.account.count({ where }),
    prisma.account.findMany({
      where,
      orderBy: accountOrderBy(params.sort),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { items: rows.map(toAccount), total, page, pageSize };
}

async function getAccountRow(id: string) {
  const row = await prisma.account.findFirst({ where: { id, deletedAt: null } });
  if (!row) throw errors.notFound('not_found', 'Account not found.');
  return row;
}

export async function getAccount(id: string) {
  const row = await getAccountRow(id);
  const [contacts, opportunities] = await Promise.all([
    prisma.contact.findMany({
      where: { deletedAt: null, accountLinks: { some: { accountId: id } } },
      include: { accountLinks: true },
    }),
    prisma.opportunity.findMany({ where: { accountId: id, deletedAt: null } }),
  ]);
  return {
    account: toAccount(row),
    contacts: contacts.map((c) => ({
      ...toContact(c),
      link: c.accountLinks.find((l) => l.accountId === id) ?? null,
    })),
    opportunities: opportunities.map(toOpportunity),
  };
}

export async function createAccount(
  body: {
    name?: unknown;
    industry?: unknown;
    website?: unknown;
    phone?: unknown;
    billingAddress?: unknown;
    notes?: unknown;
    ownerId?: unknown;
  },
  actor: User,
) {
  const name = optionalString(body.name);
  if (!name) {
    throw errors.validation([{ field: 'name', message: 'Account name is required.' }]);
  }
  const now = new Date();
  const row = await prisma.account.create({
    data: {
      name,
      industry: optionalString(body.industry) ?? null,
      website: optionalString(body.website) ?? null,
      phone: optionalString(body.phone) ?? null,
      billingAddress: optionalString(body.billingAddress) ?? null,
      notes: optionalString(body.notes) ?? null,
      ownerId: optionalString(body.ownerId) ?? actor.id,
      createdBy: actor.id,
      updatedBy: actor.id,
      createdAt: now,
      updatedAt: now,
    },
  });
  return toAccount(row);
}

export async function updateAccount(
  id: string,
  body: Partial<Record<string, unknown>> & { updatedAt?: string },
  actor: User,
) {
  const existing = await getAccountRow(id);
  assertNoConflict(body.updatedAt, existing.updatedAt);

  const now = new Date();
  const row = await prisma.account.update({
    where: { id },
    data: {
      name: optionalString(body.name) ?? existing.name,
      industry: optionalString(body.industry) ?? existing.industry,
      website: optionalString(body.website) ?? existing.website,
      phone: optionalString(body.phone) ?? existing.phone,
      billingAddress: optionalString(body.billingAddress) ?? existing.billingAddress,
      notes: optionalString(body.notes) ?? existing.notes,
      ownerId: (optionalString(body.ownerId) ?? existing.ownerId) as string,
      updatedBy: actor.id,
      updatedAt: now,
    },
  });
  return toAccount(row);
}

export async function softDeleteAccount(id: string): Promise<void> {
  await getAccountRow(id);
  await prisma.account.update({ where: { id }, data: { deletedAt: new Date() } });
}

async function getLiveContact(contactId: string) {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, deletedAt: null },
    include: { accountLinks: true },
  });
  if (!contact) throw errors.notFound('not_found', 'Contact not found.');
  return contact;
}

export async function addAccountLink(
  accountId: string,
  body: { contactId?: unknown; primary?: unknown; role?: unknown },
  actor: User,
) {
  await getAccountRow(accountId);
  const contactId = optionalString(body.contactId);
  if (!contactId)
    throw errors.validation([{ field: 'contactId', message: 'A contact is required.' }]);
  const contact = await getLiveContact(contactId);

  const existing = contact.accountLinks.find((l) => l.accountId === accountId);
  const now = new Date();
  if (existing) {
    existing.primary = typeof body.primary === 'boolean' ? body.primary : existing.primary;
    existing.role = optionalString(body.role) ?? existing.role;
    await prisma.contactAccountLink.update({
      where: { contactId_accountId: { contactId, accountId } },
      data: { primary: existing.primary, role: existing.role },
    });
  } else {
    await prisma.contactAccountLink.create({
      data: {
        contactId,
        accountId,
        primary: body.primary === true,
        role: optionalString(body.role) ?? '',
      },
    });
  }
  await prisma.contact.update({
    where: { id: contactId },
    data: { updatedAt: now, updatedBy: actor.id },
  });
  const updated = await getLiveContact(contactId);
  return toContact(updated);
}

export async function removeAccountLink(accountId: string, contactId: string, actor: User) {
  const contact = await getLiveContact(contactId);
  const now = new Date();
  await prisma.contactAccountLink.deleteMany({ where: { contactId, accountId } });
  await prisma.contact.update({
    where: { id: contact.id },
    data: { updatedAt: now, updatedBy: actor.id },
  });
  const updated = await getLiveContact(contactId);
  return toContact(updated);
}
