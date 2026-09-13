import { http } from 'msw';
import type { Interaction } from '../../types/domain';
import { getDB, persist } from '../db/store';
import { canEdit, canViewOwnerScoped, err, genId, json, nowISO, requireUser } from './helpers';

export const interactionHandlers = [
  http.get('/api/interactions', ({ request }) => {
    const user = requireUser();
    if (!user) return err(401, 'unauthorized', 'Authentication required.');
    const params = new URL(request.url).searchParams;
    const contactId = params.get('contactId');
    const accountId = params.get('accountId');
    const opportunityId = params.get('opportunityId');
    const page = Number(params.get('page') ?? 1);
    const pageSize = Number(params.get('pageSize') ?? 20);

    const db = getDB();
    let items = db.interactions.filter(
      (i) => !i.deletedAt && canViewOwnerScoped(user, i.responsibleUserId),
    );
    if (contactId) items = items.filter((i) => i.contactId === contactId);
    if (accountId) items = items.filter((i) => i.accountId === accountId);
    if (opportunityId) items = items.filter((i) => i.opportunityId === opportunityId);
    items.sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());

    const total = items.length;
    const start = (page - 1) * pageSize;
    return json({ items: items.slice(start, start + pageSize), total, page, pageSize });
  }),

  http.post('/api/interactions', async ({ request }) => {
    const user = requireUser();
    if (!user) return err(401, 'unauthorized', 'Authentication required.');
    if (!canEdit(user))
      return err(403, 'forbidden', 'You do not have permission to log interactions.');
    const body = (await request.json()) as Partial<Interaction>;

    if (!body.contactId) {
      return err(400, 'validation', 'A contact is required.', [
        { field: 'contactId', message: 'A contact is required.' },
      ]);
    }
    if (!body.summary?.trim()) {
      return err(400, 'validation', 'A summary is required.', [
        { field: 'summary', message: 'A summary is required.' },
      ]);
    }

    const db = getDB();
    const now = nowISO();
    const interaction: Interaction = {
      id: genId('i'),
      type: body.type ?? 'note',
      dateTime: body.dateTime ?? now,
      channel: body.channel || undefined,
      direction: body.type === 'note' ? undefined : (body.direction ?? 'outbound'),
      summary: body.summary.trim(),
      contactId: body.contactId,
      accountId: body.accountId || undefined,
      opportunityId: body.opportunityId || undefined,
      taskId: body.taskId || undefined,
      responsibleUserId: body.responsibleUserId ?? user.id,
      createdAt: now,
      createdBy: user.id,
      updatedAt: now,
      updatedBy: user.id,
    };
    db.interactions.push(interaction);
    persist();
    return json(interaction, 201);
  }),

  http.patch('/api/interactions/:id', async ({ request, params }) => {
    const user = requireUser();
    if (!user) return err(401, 'unauthorized', 'Authentication required.');
    if (!canEdit(user))
      return err(403, 'forbidden', 'You do not have permission to edit interactions.');
    const db = getDB();
    const index = db.interactions.findIndex((i) => i.id === params.id && !i.deletedAt);
    if (index < 0) return err(404, 'not_found', 'Interaction not found.');
    const body = (await request.json()) as Partial<Interaction>;
    const existing = db.interactions[index];
    db.interactions[index] = {
      ...existing,
      ...body,
      summary: body.summary?.trim() ?? existing.summary,
      updatedAt: nowISO(),
      updatedBy: user.id,
    };
    persist();
    return json(db.interactions[index]);
  }),

  http.delete('/api/interactions/:id', ({ params }) => {
    const user = requireUser();
    if (!user) return err(401, 'unauthorized', 'Authentication required.');
    if (!canEdit(user))
      return err(403, 'forbidden', 'You do not have permission to delete interactions.');
    const db = getDB();
    const interaction = db.interactions.find((i) => i.id === params.id && !i.deletedAt);
    if (!interaction) return err(404, 'not_found', 'Interaction not found.');
    interaction.deletedAt = nowISO();
    persist();
    return json({ ok: true });
  }),
];
