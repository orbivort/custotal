import { http } from 'msw';
import type { Task } from '../../types/domain';
import { getDB, persist } from '../db/store';
import { canEdit, canViewOwnerScoped, err, genId, json, nowISO, requireUser } from './helpers';

function today(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildTask(body: Partial<Task>, existing?: Task): Task {
  const now = nowISO();
  return {
    id: existing?.id ?? genId('t'),
    title: body.title?.trim() ?? existing?.title ?? '',
    description: body.description?.trim() || existing?.description || undefined,
    dueDate: body.dueDate || existing?.dueDate || undefined,
    priority: body.priority ?? existing?.priority ?? 'medium',
    status: body.status ?? existing?.status ?? 'open',
    assigneeId: body.assigneeId ?? existing?.assigneeId ?? requireUser()?.id ?? '',
    contactId: body.contactId || existing?.contactId || undefined,
    accountId: body.accountId || existing?.accountId || undefined,
    opportunityId: body.opportunityId || existing?.opportunityId || undefined,
    completedAt: existing?.completedAt,
    completedBy: existing?.completedBy,
    createdAt: existing?.createdAt ?? now,
    createdBy: existing?.createdBy ?? requireUser()?.id ?? '',
    updatedAt: now,
    updatedBy: requireUser()?.id ?? '',
  };
}

export const taskHandlers = [
  http.get('/api/tasks/summary', () => {
    const user = requireUser();
    if (!user) return err(401, 'unauthorized', 'Authentication required.');
    const db = getDB();
    const t = today();
    const mine = db.tasks.filter((task) => task.assigneeId === user.id && task.status === 'open');
    return json({
      dueToday: mine.filter((task) => task.dueDate === t).length,
      overdue: mine.filter((task) => task.dueDate && task.dueDate < t).length,
    });
  }),

  http.get('/api/tasks', ({ request }) => {
    const user = requireUser();
    if (!user) return err(401, 'unauthorized', 'Authentication required.');
    const params = new URL(request.url).searchParams;
    const scope = params.get('scope') ?? 'mine';
    const status = params.get('status') ?? '';
    const priority = params.get('priority') ?? '';
    const owner = params.get('owner') ?? '';
    const related = params.get('related') ?? '';

    const db = getDB();
    let items =
      scope === 'mine'
        ? db.tasks.filter((task) => task.assigneeId === user.id)
        : db.tasks.filter((task) => canViewOwnerScoped(user, task.assigneeId));
    if (status) items = items.filter((task) => task.status === status);
    if (priority) items = items.filter((task) => task.priority === priority);
    if (owner) items = items.filter((task) => task.assigneeId === owner);
    if (related === 'contact') items = items.filter((task) => Boolean(task.contactId));
    else if (related === 'account') items = items.filter((task) => Boolean(task.accountId));
    else if (related === 'opportunity') items = items.filter((task) => Boolean(task.opportunityId));
    else if (related === 'none') {
      items = items.filter((task) => !task.contactId && !task.accountId && !task.opportunityId);
    }
    return json({ items, total: items.length });
  }),

  http.post('/api/tasks', async ({ request }) => {
    const user = requireUser();
    if (!user) return err(401, 'unauthorized', 'Authentication required.');
    if (!canEdit(user)) return err(403, 'forbidden', 'You do not have permission to create tasks.');
    const body = (await request.json()) as Partial<Task>;
    if (!body.title?.trim()) {
      return err(400, 'validation', 'Title is required.', [
        { field: 'title', message: 'Title is required.' },
      ]);
    }
    const db = getDB();
    const task = buildTask(body);
    db.tasks.push(task);
    persist();
    return json(task, 201);
  }),

  http.patch('/api/tasks/:id', async ({ request, params }) => {
    const user = requireUser();
    if (!user) return err(401, 'unauthorized', 'Authentication required.');
    if (!canEdit(user)) return err(403, 'forbidden', 'You do not have permission to edit tasks.');
    const db = getDB();
    const index = db.tasks.findIndex((t) => t.id === params.id);
    if (index < 0) return err(404, 'not_found', 'Task not found.');
    const body = (await request.json()) as Partial<Task>;
    const updated = buildTask({ ...db.tasks[index], ...body }, db.tasks[index]);
    db.tasks[index] = updated;
    persist();
    return json(updated);
  }),

  http.delete('/api/tasks/:id', ({ params }) => {
    const user = requireUser();
    if (!user) return err(401, 'unauthorized', 'Authentication required.');
    if (!canEdit(user)) return err(403, 'forbidden', 'You do not have permission to delete tasks.');
    const db = getDB();
    const index = db.tasks.findIndex((t) => t.id === params.id);
    if (index < 0) return err(404, 'not_found', 'Task not found.');
    db.tasks.splice(index, 1);
    persist();
    return json({ ok: true });
  }),

  http.post('/api/tasks/:id/complete', ({ params }) => {
    const user = requireUser();
    if (!user) return err(401, 'unauthorized', 'Authentication required.');
    if (!canEdit(user))
      return err(403, 'forbidden', 'You do not have permission to complete tasks.');
    const db = getDB();
    const task = db.tasks.find((t) => t.id === params.id);
    if (!task) return err(404, 'not_found', 'Task not found.');
    task.status = 'completed';
    task.completedAt = nowISO();
    task.completedBy = user.id;
    task.updatedAt = nowISO();
    task.updatedBy = user.id;
    persist();
    return json(task);
  }),

  http.post('/api/tasks/:id/reopen', ({ params }) => {
    const user = requireUser();
    if (!user) return err(401, 'unauthorized', 'Authentication required.');
    if (!canEdit(user)) return err(403, 'forbidden', 'You do not have permission to reopen tasks.');
    const db = getDB();
    const task = db.tasks.find((t) => t.id === params.id);
    if (!task) return err(404, 'not_found', 'Task not found.');
    task.status = 'open';
    task.completedAt = undefined;
    task.completedBy = undefined;
    task.updatedAt = nowISO();
    task.updatedBy = user.id;
    persist();
    return json(task);
  }),
];
