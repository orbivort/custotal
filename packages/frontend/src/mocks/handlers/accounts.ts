import { http } from 'msw';
import type { Account } from '../../types/domain';
import { getDB, persist } from '../db/store';
import { canEdit, err, genId, json, nowISO, requireUser } from './helpers';

function buildAccount(body: Partial<Account>, existing?: Account): Account {
  const now = nowISO();
  return {
    id: existing?.id ?? genId('a'),
    name: body.name?.trim() ?? existing?.name ?? '',
    industry: body.industry?.trim() || existing?.industry || undefined,
    website: body.website?.trim() || existing?.website || undefined,
    phone: body.phone?.trim() || existing?.phone || undefined,
    billingAddress: body.billingAddress?.trim() || existing?.billingAddress || undefined,
    ownerId: body.ownerId ?? existing?.ownerId ?? requireUser()?.id ?? '',
    notes: body.notes?.trim() || existing?.notes || undefined,
    createdAt: existing?.createdAt ?? now,
    createdBy: existing?.createdBy ?? requireUser()?.id ?? '',
    updatedAt: now,
    updatedBy: requireUser()?.id ?? '',
  };
}

export const accountHandlers = [
  http.get('/api/accounts', ({ request }) => {
    const user = requireUser();
    if (!user) return err(401, 'unauthorized', 'Authentication required.');
    const params = new URL(request.url).searchParams;
    const q = (params.get('q') ?? '').toLowerCase();
    const owner = params.get('owner') ?? '';
    const page = Number(params.get('page') ?? 1);
    const pageSize = Number(params.get('pageSize') ?? 25);

    const db = getDB();
    let items = db.accounts.filter((a) => !a.deletedAt);
    if (q)
      items = items.filter((a) =>
        `${a.name} ${a.industry ?? ''} ${a.website ?? ''}`.toLowerCase().includes(q),
      );
    if (owner) items = items.filter((a) => a.ownerId === owner);

    const total = items.length;
    const start = (page - 1) * pageSize;
    return json({ items: items.slice(start, start + pageSize), total, page, pageSize });
  }),

  http.get('/api/accounts/:id', ({ params }) => {
    const user = requireUser();
    if (!user) return err(401, 'unauthorized', 'Authentication required.');
    const db = getDB();
    const account = db.accounts.find((a) => a.id === params.id && !a.deletedAt);
    if (!account) return err(404, 'not_found', 'Account not found.');

    const contacts = db.contacts
      .filter((c) => !c.deletedAt && c.accountLinks.some((l) => l.accountId === account.id))
      .map((c) => ({
        ...c,
        link: c.accountLinks.find((l) => l.accountId === account.id),
      }));
    const opportunities = db.opportunities.filter((o) => o.accountId === account.id);
    return json({ account, contacts, opportunities });
  }),

  http.post('/api/accounts', async ({ request }) => {
    const user = requireUser();
    if (!user) return err(401, 'unauthorized', 'Authentication required.');
    if (!canEdit(user))
      return err(403, 'forbidden', 'You do not have permission to create accounts.');
    const body = (await request.json()) as Partial<Account>;
    if (!body.name?.trim()) {
      return err(400, 'validation', 'Account name is required.', [
        { field: 'name', message: 'Account name is required.' },
      ]);
    }
    const db = getDB();
    const account = buildAccount(body);
    db.accounts.push(account);
    persist();
    return json(account, 201);
  }),

  http.patch('/api/accounts/:id', async ({ request, params }) => {
    const user = requireUser();
    if (!user) return err(401, 'unauthorized', 'Authentication required.');
    if (!canEdit(user))
      return err(403, 'forbidden', 'You do not have permission to edit accounts.');
    const db = getDB();
    const index = db.accounts.findIndex((a) => a.id === params.id && !a.deletedAt);
    if (index < 0) return err(404, 'not_found', 'Account not found.');

    const body = (await request.json()) as Partial<Account> & { updatedAt?: string };
    const existing = db.accounts[index];
    if (body.updatedAt && existing.updatedAt !== body.updatedAt) {
      return err(
        409,
        'conflict',
        'This account was modified by someone else. Reload and re-apply your changes.',
      );
    }
    const updated = buildAccount({ ...existing, ...body }, existing);
    db.accounts[index] = updated;
    persist();
    return json(updated);
  }),

  http.delete('/api/accounts/:id', ({ params }) => {
    const user = requireUser();
    if (!user) return err(401, 'unauthorized', 'Authentication required.');
    if (!canEdit(user))
      return err(403, 'forbidden', 'You do not have permission to delete accounts.');
    const db = getDB();
    const account = db.accounts.find((a) => a.id === params.id && !a.deletedAt);
    if (!account) return err(404, 'not_found', 'Account not found.');
    account.deletedAt = nowISO();
    persist();
    return json({ ok: true });
  }),

  http.post('/api/accounts/:id/links', async ({ request, params }) => {
    const user = requireUser();
    if (!user) return err(401, 'unauthorized', 'Authentication required.');
    if (!canEdit(user)) return err(403, 'forbidden', 'You do not have permission to modify links.');
    const db = getDB();
    const account = db.accounts.find((a) => a.id === params.id && !a.deletedAt);
    if (!account) return err(404, 'not_found', 'Account not found.');
    const body = (await request.json()) as { contactId: string; primary?: boolean; role?: string };
    const contact = db.contacts.find((c) => c.id === body.contactId && !c.deletedAt);
    if (!contact) return err(404, 'not_found', 'Contact not found.');

    const existing = contact.accountLinks.find((l) => l.accountId === account.id);
    if (existing) {
      existing.primary = body.primary ?? existing.primary;
      existing.role = body.role ?? existing.role;
    } else {
      contact.accountLinks.push({
        accountId: account.id,
        primary: body.primary ?? false,
        role: body.role ?? '',
      });
    }
    contact.updatedAt = nowISO();
    contact.updatedBy = user.id;
    persist();
    return json(contact);
  }),

  http.delete('/api/accounts/:id/links/:contactId', ({ params }) => {
    const user = requireUser();
    if (!user) return err(401, 'unauthorized', 'Authentication required.');
    if (!canEdit(user)) return err(403, 'forbidden', 'You do not have permission to modify links.');
    const db = getDB();
    const contact = db.contacts.find((c) => c.id === params.contactId && !c.deletedAt);
    if (!contact) return err(404, 'not_found', 'Contact not found.');
    contact.accountLinks = contact.accountLinks.filter((l) => l.accountId !== params.id);
    contact.updatedAt = nowISO();
    contact.updatedBy = user.id;
    persist();
    return json(contact);
  }),
];
