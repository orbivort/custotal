import { http } from 'msw';
import type { AccountLink, Contact } from '../../types/domain';
import { getDB, persist } from '../db/store';
import { canEdit, err, genId, json, nowISO, requireUser } from './helpers';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateContact(body: Partial<Contact>): { field: string; message: string }[] {
  const details: { field: string; message: string }[] = [];
  if (body.email && !EMAIL_RE.test(body.email)) {
    details.push({ field: 'email', message: 'Invalid email format.' });
  }
  if (!body.email && !body.phone) {
    details.push({ field: 'phone', message: 'At least one of email or phone is required.' });
  }
  return details;
}

function buildContact(body: Partial<Contact>, existing?: Contact): Contact {
  const now = nowISO();
  const links: AccountLink[] = body.accountLinks ?? existing?.accountLinks ?? [];
  return {
    id: existing?.id ?? genId('c'),
    firstName: body.firstName?.trim() ?? existing?.firstName ?? '',
    lastName: body.lastName?.trim() ?? existing?.lastName ?? '',
    email: body.email?.trim() || existing?.email || undefined,
    phone: body.phone?.trim() || existing?.phone || undefined,
    jobTitle: body.jobTitle?.trim() || existing?.jobTitle || undefined,
    company: body.company?.trim() || existing?.company || undefined,
    address: body.address?.trim() || existing?.address || undefined,
    notes: body.notes?.trim() || existing?.notes || undefined,
    status: body.status ?? existing?.status ?? 'active',
    accountLinks: links,
    createdAt: existing?.createdAt ?? now,
    createdBy: existing?.createdBy ?? requireUser()?.id ?? '',
    updatedAt: now,
    updatedBy: requireUser()?.id ?? '',
  };
}

export const contactHandlers = [
  http.get('/api/contacts', ({ request }) => {
    const user = requireUser();
    if (!user) return err(401, 'unauthorized', 'Authentication required.');
    const params = new URL(request.url).searchParams;
    const q = (params.get('q') ?? '').toLowerCase();
    const status = params.get('status') ?? '';
    const owner = params.get('owner') ?? '';
    const page = Number(params.get('page') ?? 1);
    const pageSize = Number(params.get('pageSize') ?? 25);

    const db = getDB();
    let items = db.contacts.filter((c) => !c.deletedAt);
    if (q) {
      items = items.filter((c) =>
        `${c.firstName} ${c.lastName} ${c.email ?? ''} ${c.company ?? ''}`
          .toLowerCase()
          .includes(q),
      );
    }
    if (status) items = items.filter((c) => c.status === status);
    if (owner) {
      const ownedAccountIds = new Set(
        db.accounts.filter((a) => !a.deletedAt && a.ownerId === owner).map((a) => a.id),
      );
      items = items.filter((c) => c.accountLinks.some((l) => ownedAccountIds.has(l.accountId)));
    }

    const total = items.length;
    const start = (page - 1) * pageSize;
    return json({ items: items.slice(start, start + pageSize), total, page, pageSize });
  }),

  http.get('/api/contacts/:id', ({ params }) => {
    const user = requireUser();
    if (!user) return err(401, 'unauthorized', 'Authentication required.');
    const db = getDB();
    const contact = db.contacts.find((c) => c.id === params.id && !c.deletedAt);
    if (!contact) return err(404, 'not_found', 'Contact not found.');
    return json(contact);
  }),

  http.post('/api/contacts', async ({ request }) => {
    const user = requireUser();
    if (!user) return err(401, 'unauthorized', 'Authentication required.');
    if (!canEdit(user))
      return err(403, 'forbidden', 'You do not have permission to create contacts.');
    const body = (await request.json()) as Partial<Contact>;
    const details = validateContact(body);
    if (details.length)
      return err(400, 'validation', 'Please correct the highlighted fields.', details);

    const db = getDB();
    const contact = buildContact(body);
    db.contacts.push(contact);
    persist();
    return json(contact, 201);
  }),

  http.patch('/api/contacts/:id', async ({ request, params }) => {
    const user = requireUser();
    if (!user) return err(401, 'unauthorized', 'Authentication required.');
    if (!canEdit(user))
      return err(403, 'forbidden', 'You do not have permission to edit contacts.');
    const db = getDB();
    const index = db.contacts.findIndex((c) => c.id === params.id && !c.deletedAt);
    if (index < 0) return err(404, 'not_found', 'Contact not found.');

    const body = (await request.json()) as Partial<Contact> & { updatedAt?: string };
    const existing = db.contacts[index];
    if (body.updatedAt && existing.updatedAt !== body.updatedAt) {
      return err(
        409,
        'conflict',
        'This contact was modified by someone else. Reload and re-apply your changes.',
      );
    }
    const details = validateContact({ ...existing, ...body });
    if (details.length)
      return err(400, 'validation', 'Please correct the highlighted fields.', details);

    const updated = buildContact({ ...existing, ...body }, existing);
    db.contacts[index] = updated;
    persist();
    return json(updated);
  }),

  http.delete('/api/contacts/:id', ({ params }) => {
    const user = requireUser();
    if (!user) return err(401, 'unauthorized', 'Authentication required.');
    if (!canEdit(user))
      return err(403, 'forbidden', 'You do not have permission to delete contacts.');
    const db = getDB();
    const contact = db.contacts.find((c) => c.id === params.id && !c.deletedAt);
    if (!contact) return err(404, 'not_found', 'Contact not found.');
    contact.deletedAt = nowISO();
    persist();
    return json({ ok: true });
  }),

  http.get('/api/contacts/:id/export', ({ params }) => {
    const user = requireUser();
    if (!user) return err(401, 'unauthorized', 'Authentication required.');
    const db = getDB();
    const contact = db.contacts.find((c) => c.id === params.id);
    if (!contact) return err(404, 'not_found', 'Contact not found.');
    const interactions = db.interactions.filter((i) => i.contactId === contact.id);
    const opportunities = db.opportunities.filter((o) => o.contactId === contact.id);
    const tasks = db.tasks.filter((t) => t.contactId === contact.id);
    return json({ contact, interactions, opportunities, tasks });
  }),
];
