// Tasks: CRUD, My/All scopes, filters, complete/reopen with retained completion
// history (FR-TA-01..04), soft delete, and assignee-scoped mutation rules.
import { prisma } from '../db.ts';
import { errors } from '../lib/errors.ts';
import { assertNoConflict, optionalString, TASK_PRIORITIES } from '../lib/validation.ts';
import { parseDateOnly, todayInTimezone } from '../lib/time.ts';
import { toTask } from '../serializers.ts';
import type { Task, User } from '../types/domain.ts';
import { env } from '../config.ts';

export interface TaskListParams {
  scope?: string;
  status?: string;
  priority?: string;
  owner?: string;
  related?: string;
}

export async function getTaskSummary(user: User) {
  const today = todayInTimezone(env.tenantTimezone);
  const open = await prisma.task.findMany({
    where: { assigneeId: user.id, status: 'open', deletedAt: null },
    select: { dueDate: true },
  });
  let dueToday = 0;
  let overdue = 0;
  for (const t of open) {
    if (!t.dueDate) continue;
    const due = t.dueDate.toISOString().slice(0, 10);
    if (due === today) dueToday += 1;
    else if (due < today) overdue += 1;
  }
  return { dueToday, overdue };
}

export async function listTasks(user: User, params: TaskListParams) {
  const scope = params.scope === 'all' ? 'all' : 'mine';
  const status = optionalString(params.status);
  const priority = optionalString(params.priority);
  const owner = optionalString(params.owner);
  const related = optionalString(params.related);

  const base = scope === 'mine' || user.role === 'rep' ? { assigneeId: user.id } : {};

  const where = {
    deletedAt: null,
    ...base,
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
    ...(owner ? { assigneeId: owner } : {}),
    ...(related === 'contact'
      ? { contactId: { not: null } }
      : related === 'account'
        ? { accountId: { not: null } }
        : related === 'opportunity'
          ? { opportunityId: { not: null } }
          : related === 'none'
            ? { contactId: null, accountId: null, opportunityId: null }
            : {}),
  };

  const [items, total] = await Promise.all([
    prisma.task.findMany({ where, orderBy: { createdAt: 'desc' } }),
    prisma.task.count({ where }),
  ]);
  return { items: items.map(toTask), total };
}

function assertCanMutate(user: User, assigneeId: string): void {
  if (user.role === 'admin' || user.role === 'manager') return;
  if (assigneeId === user.id) return;
  throw errors.forbidden('You do not have permission to modify this task.');
}

export async function createTask(body: Partial<Task>, user: User) {
  const title = optionalString(body.title);
  if (!title) {
    throw errors.validation([{ field: 'title', message: 'Title is required.' }]);
  }
  const priority = TASK_PRIORITIES.includes(body.priority as (typeof TASK_PRIORITIES)[number])
    ? (body.priority as string)
    : 'medium';
  const now = new Date();
  const row = await prisma.task.create({
    data: {
      title,
      description: optionalString(body.description) ?? null,
      dueDate: parseDateOnly(body.dueDate as string | undefined),
      priority,
      status: 'open',
      assigneeId: optionalString(body.assigneeId) ?? user.id,
      contactId: optionalString(body.contactId) ?? null,
      accountId: optionalString(body.accountId) ?? null,
      opportunityId: optionalString(body.opportunityId) ?? null,
      createdBy: user.id,
      updatedBy: user.id,
      createdAt: now,
      updatedAt: now,
    },
  });
  return toTask(row);
}

export async function updateTask(
  id: string,
  body: Partial<Task> & { updatedAt?: string },
  user: User,
) {
  const existing = await prisma.task.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw errors.notFound('not_found', 'Task not found.');
  assertNoConflict(body.updatedAt, existing.updatedAt);
  assertCanMutate(user, existing.assigneeId);

  const now = new Date();
  let status = existing.status;
  let completedAt = existing.completedAt;
  let completedBy = existing.completedBy;
  if (body.status === 'completed' && existing.status !== 'completed') {
    status = 'completed';
    completedAt = now;
    completedBy = user.id;
  } else if (body.status === 'open' && existing.status === 'completed') {
    status = 'open';
    completedAt = null;
    completedBy = null;
  }

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({
      where: { id },
      data: {
        title: optionalString(body.title) ?? existing.title,
        description: optionalString(body.description) ?? existing.description,
        dueDate:
          body.dueDate !== undefined
            ? parseDateOnly(body.dueDate as string | undefined)
            : existing.dueDate,
        priority: TASK_PRIORITIES.includes(body.priority as (typeof TASK_PRIORITIES)[number])
          ? (body.priority as string)
          : existing.priority,
        status,
        assigneeId: optionalString(body.assigneeId) ?? existing.assigneeId,
        contactId:
          body.contactId !== undefined
            ? (optionalString(body.contactId) ?? null)
            : existing.contactId,
        accountId:
          body.accountId !== undefined
            ? (optionalString(body.accountId) ?? null)
            : existing.accountId,
        opportunityId:
          body.opportunityId !== undefined
            ? (optionalString(body.opportunityId) ?? null)
            : existing.opportunityId,
        completedAt,
        completedBy,
        updatedAt: now,
        updatedBy: user.id,
      },
    });
    if (status === 'completed' && existing.status !== 'completed') {
      await tx.taskCompletion.create({
        data: { taskId: id, completedAt: now, completedBy: user.id },
      });
    }
    return updated;
  });
  return toTask(row);
}

export async function softDeleteTask(id: string, user: User): Promise<void> {
  const existing = await prisma.task.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw errors.notFound('not_found', 'Task not found.');
  assertCanMutate(user, existing.assigneeId);
  await prisma.task.update({
    where: { id },
    data: { deletedAt: new Date(), updatedAt: new Date(), updatedBy: user.id },
  });
}

async function requireLiveTask(id: string, user: User) {
  const task = await prisma.task.findFirst({ where: { id, deletedAt: null } });
  if (!task) throw errors.notFound('not_found', 'Task not found.');
  assertCanMutate(user, task.assigneeId);
  return task;
}

export async function completeTask(id: string, user: User) {
  const task = await requireLiveTask(id, user);
  if (task.status === 'completed') return toTask(task);
  const now = new Date();
  const row = await prisma.$transaction([
    prisma.task.update({
      where: { id },
      data: {
        status: 'completed',
        completedAt: now,
        completedBy: user.id,
        updatedAt: now,
        updatedBy: user.id,
      },
    }),
    prisma.taskCompletion.create({ data: { taskId: id, completedAt: now, completedBy: user.id } }),
  ]);
  return toTask(row[0]);
}

export async function reopenTask(id: string, user: User) {
  const task = await requireLiveTask(id, user);
  if (task.status === 'open') return toTask(task);
  const now = new Date();
  const row = await prisma.task.update({
    where: { id },
    data: {
      status: 'open',
      completedAt: null,
      completedBy: null,
      updatedAt: now,
      updatedBy: user.id,
    },
  });
  // Completion history stays in TaskCompletion even though current state is open.
  return toTask(row);
}

/** Append-only completion history for a task (FR-TA-03), newest first. */
export async function listTaskCompletions(id: string, user: User) {
  const task = await prisma.task.findFirst({ where: { id, deletedAt: null } });
  if (!task) throw errors.notFound('not_found', 'Task not found.');
  // Read visibility mirrors list scoping: reps only see their own tasks.
  if (user.role === 'rep' && task.assigneeId !== user.id) {
    throw errors.notFound('not_found', 'Task not found.');
  }
  const rows = await prisma.taskCompletion.findMany({
    where: { taskId: id },
    orderBy: { completedAt: 'desc' },
  });
  return {
    items: rows.map((c) => ({
      id: c.id,
      taskId: c.taskId,
      completedAt: c.completedAt.toISOString(),
      completedBy: c.completedBy,
    })),
    total: rows.length,
  };
}
