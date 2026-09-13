// Contacts: CRUD, soft delete, server-side list filtering (FR-CM-01/04/05),
// account-link replacement, and the single-contact data export (FR-CC-16).
import { prisma } from '../db.ts';
import { errors, FIELD_MESSAGES, type FieldError } from '../lib/errors.ts';
import { assertNoConflict, CONTACT_STATUSES, EMAIL_RE, optionalString } from '../lib/validation.ts';
import { toContact } from '../serializers.ts';
import type { Contact, User } from '../types/domain.ts';

export interface ContactListParams {
  q?: string;
  status?: string;
  owner?: string;
  /** First-letter filter on the last name (single A-Z character). */
  letter?: string;
  /** 'name' | 'name_desc' sort on last name; anything else sorts by updatedAt desc. */
  sort?: string;
  page?: number;
  pageSize?: number;
}

/** Builds the ORDER BY for the contacts list (FR-CM-05: name/modified sort). */
function contactOrderBy(sort?: string) {
  if (sort === 'name')
    return [
      { lastName: 'asc' as const },
      { firstName: 'asc' as const },
      { updatedAt: 'desc' as const },
    ];
  if (sort === 'name_desc')
    return [
      { lastName: 'desc' as const },
      { firstName: 'desc' as const },
      { updatedAt: 'desc' as const },
    ];
  if (sort === 'updated') return [{ updatedAt: 'asc' as const }];
  return [{ updatedAt: 'desc' as const }];
}

function cleanPagination(page?: number, pageSize?: number): { page: number; pageSize: number } {
  const p = Number.isFinite(page) ? Math.max(1, Math.trunc(page ?? 1)) : 1;
  const ps = Number.isFinite(pageSize)
    ? Math.min(100, Math.max(1, Math.trunc(pageSize ?? 25)))
    : 25;
  return { page: p, pageSize: ps };
}

function validateContact(body: {
  email?: unknown;
  phone?: unknown;
  status?: unknown;
}): FieldError[] {
  const details: FieldError[] = [];
  const email = optionalString(body.email);
  if (email && !EMAIL_RE.test(email)) {
    details.push({ field: 'email', message: FIELD_MESSAGES.invalidEmail });
  }
  if (!email && !optionalString(body.phone)) {
    details.push({ field: 'phone', message: FIELD_MESSAGES.emailOrPhoneRequired });
  }
  if (
    body.status !== undefined &&
    !CONTACT_STATUSES.includes(body.status as (typeof CONTACT_STATUSES)[number])
  ) {
    details.push({ field: 'status', message: 'Status must be "active" or "inactive".' });
  }
  return details;
}

export async function listContacts(params: ContactListParams) {
  const { page, pageSize } = cleanPagination(params.page, params.pageSize);
  const q = optionalString(params.q)?.toLowerCase();
  const status = optionalString(params.status);
  const owner = optionalString(params.owner);
  // FR-CM-05 first-letter filter: only a single A-Z character applies.
  const letter = optionalString(params.letter)?.trim();
  const letterMatch = letter && /^[a-z]$/i.test(letter) ? letter.toUpperCase() : null;

  const where = {
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { firstName: { contains: q, mode: 'insensitive' as const } },
            { lastName: { contains: q, mode: 'insensitive' as const } },
            { email: { contains: q, mode: 'insensitive' as const } },
            { company: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...(letterMatch ? { lastName: { startsWith: letterMatch, mode: 'insensitive' as const } } : {}),
    ...(owner ? { accountLinks: { some: { account: { ownerId: owner, deletedAt: null } } } } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.contact.count({ where }),
    prisma.contact.findMany({
      where,
      orderBy: contactOrderBy(params.sort),
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { accountLinks: true },
    }),
  ]);
  return { items: rows.map(toContact), total, page, pageSize };
}

export async function getContact(id: string): Promise<Contact> {
  const row = await prisma.contact.findFirst({
    where: { id, deletedAt: null },
    include: { accountLinks: true },
  });
  if (!row) throw errors.notFound('not_found', 'Contact not found.');
  return toContact(row);
}

type ContactInput = Partial<
  Pick<
    Contact,
    | 'firstName'
    | 'lastName'
    | 'email'
    | 'phone'
    | 'jobTitle'
    | 'company'
    | 'address'
    | 'notes'
    | 'status'
  > & {
    accountLinks: { accountId: string; primary?: boolean; role?: string }[];
  }
>;

export async function createContact(body: ContactInput, actor: User): Promise<Contact> {
  const firstName = optionalString(body.firstName) ?? '';
  const lastName = optionalString(body.lastName) ?? '';
  if (!firstName || !lastName) {
    throw errors.validation([
      { field: 'firstName', message: 'First name is required.' },
      { field: 'lastName', message: 'Last name is required.' },
    ]);
  }
  const merged = { ...body, firstName, lastName, status: body.status ?? 'active' };
  const details = validateContact(merged);
  if (details.length) throw errors.validation(details);

  const now = new Date();
  const row = await prisma.contact.create({
    data: {
      firstName,
      lastName,
      email: optionalString(body.email) ?? null,
      phone: optionalString(body.phone) ?? null,
      jobTitle: optionalString(body.jobTitle) ?? null,
      company: optionalString(body.company) ?? null,
      address: optionalString(body.address) ?? null,
      notes: optionalString(body.notes) ?? null,
      status: body.status === 'inactive' ? 'inactive' : 'active',
      createdBy: actor.id,
      updatedBy: actor.id,
      createdAt: now,
      updatedAt: now,
      ...(body.accountLinks
        ? { accountLinks: { create: await validateLinks(body.accountLinks) } }
        : {}),
    },
    include: { accountLinks: true },
  });
  return toContact(row);
}

async function validateLinks(
  links: { accountId: string; primary?: boolean; role?: string }[],
): Promise<{ accountId: string; primary: boolean; role: string }[]> {
  const requested: { accountId: string; primary: boolean; role: string }[] = [];
  const seen = new Set<string>();
  for (const link of links) {
    const accountId = optionalString(link.accountId);
    if (!accountId || seen.has(accountId)) continue;
    seen.add(accountId);
    requested.push({ accountId, primary: link.primary ?? false, role: link.role ?? '' });
  }
  if (requested.length === 0) return [];
  // One query for every referenced account replaces the per-link lookup (N+1).
  const accounts = await prisma.account.findMany({
    where: { id: { in: requested.map((link) => link.accountId) }, deletedAt: null },
    select: { id: true },
  });
  const existing = new Set(accounts.map((account) => account.id));
  return requested.filter((link) => existing.has(link.accountId));
}

export async function updateContact(
  id: string,
  body: ContactInput & { updatedAt?: string },
  actor: User,
): Promise<Contact> {
  const existing = await prisma.contact.findFirst({
    where: { id, deletedAt: null },
    include: { accountLinks: true },
  });
  if (!existing) throw errors.notFound('not_found', 'Contact not found.');
  assertNoConflict(body.updatedAt, existing.updatedAt);

  const next = {
    firstName: optionalString(body.firstName) ?? existing.firstName,
    lastName: optionalString(body.lastName) ?? existing.lastName,
    email: optionalString(body.email) ?? existing.email,
    phone: optionalString(body.phone) ?? existing.phone,
    jobTitle: optionalString(body.jobTitle) ?? existing.jobTitle,
    company: optionalString(body.company) ?? existing.company,
    address: optionalString(body.address) ?? existing.address,
    notes: optionalString(body.notes) ?? existing.notes,
    status:
      body.status === 'inactive'
        ? 'inactive'
        : body.status === 'active'
          ? 'active'
          : existing.status,
  };
  const details = validateContact(next);
  if (details.length) throw errors.validation(details);

  const now = new Date();
  const data = { ...next, updatedBy: actor.id, updatedAt: now };

  const row = await prisma.$transaction(async (tx) => {
    if (body.accountLinks) {
      const links = await validateLinks(body.accountLinks);
      await tx.contactAccountLink.deleteMany({ where: { contactId: id } });
      await tx.contact.update({ where: { id }, data });
      if (links.length) {
        await tx.contactAccountLink.createMany({
          data: links.map((l) => ({ ...l, contactId: id })),
        });
      }
    } else {
      await tx.contact.update({ where: { id }, data });
    }
    return tx.contact.findUniqueOrThrow({
      where: { id },
      include: { accountLinks: true },
    });
  });
  return toContact(row);
}

export async function softDeleteContact(id: string): Promise<void> {
  const existing = await prisma.contact.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw errors.notFound('not_found', 'Contact not found.');
  await prisma.contact.update({
    where: { id },
    data: { deletedAt: new Date(), updatedAt: new Date(), updatedBy: existing.updatedBy },
  });
}

export async function exportContact(id: string) {
  const contact = await getContact(id);
  const [interactions, opportunities, tasks] = await Promise.all([
    prisma.interaction.findMany({
      where: { contactId: id, deletedAt: null },
      orderBy: { dateTime: 'desc' },
    }),
    prisma.opportunity.findMany({ where: { contactId: id, deletedAt: null } }),
    prisma.task.findMany({ where: { contactId: id, deletedAt: null } }),
  ]);
  return {
    contact,
    interactions,
    opportunities,
    tasks,
  };
}
