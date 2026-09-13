// Unit tests for the task service (FR-TA-01..04).
// Pure unit tests: the Prisma client is mocked at the module boundary, no
// database is required. Real serializers, validation and error factories are
// used so wire-shape mapping and error envelopes are exercised for real.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Fixed tenant timezone and clock so dueToday/overdue math is deterministic.
vi.mock('../../../src/config.ts', () => ({
  env: { tenantTimezone: 'UTC' },
}));

// Mock the Prisma singleton before importing the service under test.
vi.mock('../../../src/db.ts', () => ({
  prisma: {
    task: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    taskCompletion: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from '../../../src/db.ts';
import { errors } from '../../../src/lib/errors.ts';
import type { TaskRow } from '../../../src/serializers.ts';
import type { User } from '../../../src/types/domain.ts';
import {
  completeTask,
  createTask,
  getTaskSummary,
  listTaskCompletions,
  listTasks,
  reopenTask,
  softDeleteTask,
  updateTask,
} from '../../../src/services/task-service.ts';

// Structurally-typed view over the mocked prisma for ergonomic assertions.
interface TaskModelMock {
  findMany: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}
interface PrismaMock {
  task: TaskModelMock;
  taskCompletion: {
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
}

const db = prisma as unknown as PrismaMock;

// The service reads today via `todayInTimezone('UTC')`; pin the clock to a
// fixed instant so "today" is always 2026-03-10.
const now = new Date('2026-03-10T10:00:00.000Z');
const TODAY = '2026-03-10';
const due = (day: string) => new Date(`${day}T00:00:00.000Z`);

const admin: User = { id: 'user-1', name: 'Alice', email: 'alice@example.com', role: 'admin' };
const manager: User = { id: 'user-2', name: 'Bob', email: 'bob@example.com', role: 'manager' };
const sales: User = { id: 'user-4', name: 'Dave', email: 'dave@example.com', role: 'rep' };
const stranger: User = { id: 'user-99', name: 'Eve', email: 'eve@example.com', role: 'rep' };

function taskRow(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: 'task-1',
    title: 'Follow up',
    description: null,
    dueDate: due(TODAY),
    priority: 'medium',
    status: 'open',
    assigneeId: sales.id,
    contactId: 'con-1',
    accountId: null,
    opportunityId: null,
    completedAt: null,
    completedBy: null,
    createdAt: now,
    createdBy: sales.id,
    updatedAt: now,
    updatedBy: sales.id,
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(now);
  db.task.findMany.mockResolvedValue([]);
  db.task.count.mockResolvedValue(0);
  db.task.findFirst.mockResolvedValue(null);
  db.task.create.mockImplementation(async (args: { data: Record<string, unknown> }) =>
    taskRow({ ...(args.data as Partial<TaskRow>) }),
  );
  db.task.update.mockImplementation(
    async (args: { where: { id: string }; data: Record<string, unknown> }) =>
      taskRow({ id: args.where.id, ...(args.data as Partial<TaskRow>) }),
  );
  db.taskCompletion.findMany.mockResolvedValue([]);
  db.taskCompletion.create.mockResolvedValue({ id: 'tc-1' });
  // Support both transaction shapes: callback (updateTask) and array (completeTask).
  db.$transaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: unknown) => Promise<unknown>)({
        task: db.task,
        taskCompletion: db.taskCompletion,
      });
    }
    return Promise.all(arg as Promise<unknown>[]);
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getTaskSummary', () => {
  it('counts open tasks due today as dueToday and past-due as overdue', async () => {
    db.task.findMany.mockResolvedValue([
      taskRow({ id: 'a', dueDate: due(TODAY) }),
      taskRow({ id: 'b', dueDate: due('2026-03-09') }),
      taskRow({ id: 'c', dueDate: due('2026-03-01') }),
    ]);
    const result = await getTaskSummary(sales);
    expect(result).toEqual({ dueToday: 1, overdue: 2 });
    expect(db.task.findMany).toHaveBeenCalledWith({
      where: { assigneeId: sales.id, status: 'open', deletedAt: null },
      select: { dueDate: true },
    });
  });

  it('ignores tasks without a due date and tasks due in the future', async () => {
    db.task.findMany.mockResolvedValue([
      taskRow({ id: 'a', dueDate: null }),
      taskRow({ id: 'b', dueDate: due('2026-03-11') }),
    ]);
    const result = await getTaskSummary(sales);
    expect(result).toEqual({ dueToday: 0, overdue: 0 });
  });

  it('ignores completed tasks in the where clause entirely', async () => {
    await getTaskSummary(sales);
    const where = db.task.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('open');
    expect(where.assigneeId).toBe(sales.id);
  });
});

describe('listTasks', () => {
  it('defaults scope to "mine" and scopes by assignee', async () => {
    await listTasks(sales, {});
    const where = db.task.findMany.mock.calls[0][0].where;
    expect(where.assigneeId).toBe(sales.id);
    expect(where.deletedAt).toBeNull();
    expect(db.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
    expect(db.task.count).toHaveBeenCalledWith(expect.objectContaining({ where }));
  });

  it('uses scope "all" for privileged users without an assignee filter', async () => {
    await listTasks(admin, { scope: 'all' });
    const where = db.task.findMany.mock.calls[0][0].where;
    expect(where.assigneeId).toBeUndefined();
  });

  it('forces the "mine" scope for reps even when scope=all is requested', async () => {
    await listTasks(sales, { scope: 'all' });
    const where = db.task.findMany.mock.calls[0][0].where;
    expect(where.assigneeId).toBe(sales.id);
  });

  it('treats unknown scope values as "mine"', async () => {
    await listTasks(admin, { scope: 'bogus' });
    const where = db.task.findMany.mock.calls[0][0].where;
    expect(where.assigneeId).toBe(admin.id);
  });

  it.each(['admin', 'manager'] as const)('does not scope by owner for role %p', async (role) => {
    await listTasks({ ...admin, role }, { scope: 'all' });
    const where = db.task.findMany.mock.calls[0][0].where;
    expect(where.assigneeId).toBeUndefined();
  });

  it('applies status, priority and trimmed owner filters', async () => {
    await listTasks(admin, { status: ' open ', priority: ' high ', owner: ' user-9 ' });
    const where = db.task.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('open');
    expect(where.priority).toBe('high');
    expect(where.assigneeId).toBe('user-9');
  });

  it('ignores blank status/priority/owner filters', async () => {
    await listTasks(admin, { scope: 'all', status: '   ', priority: '', owner: undefined });
    const where = db.task.findMany.mock.calls[0][0].where;
    expect(where.status).toBeUndefined();
    expect(where.priority).toBeUndefined();
    expect(where.assigneeId).toBeUndefined();
  });

  it.each([
    ['contact', { contactId: { not: null } }],
    ['account', { accountId: { not: null } }],
    ['opportunity', { opportunityId: { not: null } }],
    ['none', { contactId: null, accountId: null, opportunityId: null }],
  ] as const)('maps related=%p into the expected where clause', async (related, expected) => {
    await listTasks(admin, { related });
    const where = db.task.findMany.mock.calls[0][0].where;
    expect(where).toEqual(expect.objectContaining(expected));
  });

  it('ignores an unknown related value', async () => {
    await listTasks(admin, { related: 'whatever' });
    const where = db.task.findMany.mock.calls[0][0].where as Record<string, unknown>;
    expect(where.contactId).toBeUndefined();
    expect(where.accountId).toBeUndefined();
    expect(where.opportunityId).toBeUndefined();
  });

  it('returns serialized items plus total', async () => {
    db.task.findMany.mockResolvedValue([
      taskRow({ id: 'a', description: 'Notes', accountId: 'acc-1' }),
      taskRow({ id: 'b', status: 'completed', completedAt: now, completedBy: sales.id }),
    ]);
    db.task.count.mockResolvedValue(2);
    const result = await listTasks(admin, {});
    expect(result).toEqual({
      items: [
        expect.objectContaining({
          id: 'a',
          description: 'Notes',
          accountId: 'acc-1',
          deletedAt: undefined,
        }),
        expect.objectContaining({ id: 'b', status: 'completed', completedAt: now.toISOString() }),
      ],
      total: 2,
    });
  });
});

describe('createTask', () => {
  it.each([undefined, '', '   '])(
    'rejects a missing/blank title (%p) with a validation error',
    async (title) => {
      await expect(createTask({ title }, admin)).rejects.toMatchObject({
        status: 400,
        code: 'validation',
        details: [{ field: 'title', message: 'Title is required.' }],
      });
      expect(db.task.create).not.toHaveBeenCalled();
    },
  );

  it('creates with defaults: open status, medium priority, current timestamps', async () => {
    const result = await createTask({ title: 'New task' }, sales);
    expect(db.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: 'New task',
        description: null,
        dueDate: null,
        priority: 'medium',
        status: 'open',
        assigneeId: sales.id,
        contactId: null,
        accountId: null,
        opportunityId: null,
        createdBy: sales.id,
        updatedBy: sales.id,
        createdAt: now,
        updatedAt: now,
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({ id: 'task-1', title: 'New task', priority: 'medium' }),
    );
  });

  it.each(['high', 'low'] as const)('keeps the valid priority %p', async (priority) => {
    await createTask({ title: 'T', priority }, admin);
    expect(db.task.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ priority }) }),
    );
  });

  it.each([undefined, 'urgent', '', 42 as unknown as string])(
    'defaults an invalid/missing priority (%p) to medium',
    async (priority) => {
      await createTask({ title: 'T', priority: priority as 'high' }, admin);
      expect(db.task.create).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ priority: 'medium' }) }),
      );
    },
  );

  it('parses a valid date-only dueDate and nulls an invalid one', async () => {
    await createTask({ title: 'T', dueDate: '2026-04-01' }, admin);
    expect(db.task.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ dueDate: due('2026-04-01') }) }),
    );
    await createTask({ title: 'T', dueDate: 'not-a-date' }, admin);
    expect(db.task.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ dueDate: null }) }),
    );
  });

  it('defaults the assignee to the acting user and honors an explicit assignee', async () => {
    await createTask({ title: 'T' }, sales);
    expect(db.task.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ assigneeId: sales.id }) }),
    );
    await createTask({ title: 'T', assigneeId: '  user-9  ' }, sales);
    expect(db.task.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ assigneeId: 'user-9' }) }),
    );
  });

  it('trims the title and description and links related records', async () => {
    await createTask(
      {
        title: '  Trimmed  ',
        description: '  Desc  ',
        contactId: ' con-1 ',
        accountId: ' acc-1 ',
        opportunityId: ' opp-1 ',
      },
      admin,
    );
    expect(db.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: 'Trimmed',
        description: 'Desc',
        contactId: 'con-1',
        accountId: 'acc-1',
        opportunityId: 'opp-1',
      }),
    });
  });

  it('nulls blank optional string fields', async () => {
    await createTask({ title: 'T', description: '   ', contactId: '  ', assigneeId: '' }, admin);
    expect(db.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description: null,
        contactId: null,
        accountId: null,
        opportunityId: null,
        assigneeId: admin.id,
      }),
    });
  });
});

describe('updateTask', () => {
  it('rejects when the task does not exist or is soft-deleted', async () => {
    db.task.findFirst.mockResolvedValue(null);
    await expect(updateTask('task-1', {}, admin)).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
      message: 'Task not found.',
    });
    expect(db.task.findFirst).toHaveBeenCalledWith({ where: { id: 'task-1', deletedAt: null } });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('rejects with a 409 when the client updatedAt token is stale', async () => {
    db.task.findFirst.mockResolvedValue(taskRow());
    await expect(
      updateTask('task-1', { updatedAt: '2020-01-01T00:00:00.000Z' }, admin),
    ).rejects.toMatchObject({ status: 409, code: 'conflict', message: errors.conflict().message });
  });

  it('accepts the exact current updatedAt token and skips the check when omitted', async () => {
    db.task.findFirst.mockResolvedValue(taskRow());
    await expect(
      updateTask('task-1', { updatedAt: now.toISOString() }, admin),
    ).resolves.toBeDefined();
    await expect(updateTask('task-1', {}, admin)).resolves.toBeDefined();
  });

  it('forbids a rep who is not the assignee', async () => {
    db.task.findFirst.mockResolvedValue(taskRow({ assigneeId: 'someone-else' }));
    await expect(updateTask('task-1', {}, stranger)).rejects.toMatchObject({
      status: 403,
      code: 'forbidden',
      message: 'You do not have permission to modify this task.',
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('allows a rep to update their own task and admins/managers any task', async () => {
    db.task.findFirst.mockResolvedValue(taskRow({ assigneeId: sales.id }));
    await expect(updateTask('task-1', {}, sales)).resolves.toBeDefined();
    db.task.findFirst.mockResolvedValue(taskRow({ assigneeId: 'someone-else' }));
    await expect(updateTask('task-1', {}, admin)).resolves.toBeDefined();
    await expect(updateTask('task-1', {}, manager)).resolves.toBeDefined();
  });

  it('completing an open task stamps completion fields and records TaskCompletion in the transaction', async () => {
    db.task.findFirst.mockResolvedValue(taskRow({ status: 'open' }));
    await updateTask('task-1', { status: 'completed' }, admin);
    expect(db.task.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: expect.objectContaining({
        status: 'completed',
        completedAt: now,
        completedBy: admin.id,
      }),
    });
    expect(db.taskCompletion.create).toHaveBeenCalledWith({
      data: { taskId: 'task-1', completedAt: now, completedBy: admin.id },
    });
  });

  it('updating an already-completed task without toggling status does not duplicate completion history', async () => {
    db.task.findFirst.mockResolvedValue(
      taskRow({ status: 'completed', completedAt: now, completedBy: sales.id }),
    );
    await updateTask('task-1', { title: 'Edited' }, admin);
    expect(db.task.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: expect.objectContaining({
        status: 'completed',
        completedAt: now,
        completedBy: sales.id,
      }),
    });
    expect(db.taskCompletion.create).not.toHaveBeenCalled();
  });

  it('reopening a completed task clears completion fields and writes no history', async () => {
    db.task.findFirst.mockResolvedValue(
      taskRow({ status: 'completed', completedAt: now, completedBy: sales.id }),
    );
    await updateTask('task-1', { status: 'open' }, admin);
    expect(db.task.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: expect.objectContaining({ status: 'open', completedAt: null, completedBy: null }),
    });
    expect(db.taskCompletion.create).not.toHaveBeenCalled();
  });

  it('does not clear completion fields when the status is unchanged (open -> open)', async () => {
    db.task.findFirst.mockResolvedValue(taskRow({ status: 'open' }));
    await updateTask('task-1', { status: 'open' }, admin);
    expect(db.taskCompletion.create).not.toHaveBeenCalled();
    expect(db.task.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: expect.objectContaining({ status: 'open', completedAt: null, completedBy: null }),
    });
  });

  it('preserves fields the body omits and applies trimmed provided values', async () => {
    db.task.findFirst.mockResolvedValue(
      taskRow({ title: 'Old', description: 'Old desc', priority: 'low', contactId: 'con-1' }),
    );
    await updateTask('task-1', { description: '  New desc  ' }, admin);
    expect(db.task.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: expect.objectContaining({
        title: 'Old',
        description: 'New desc',
        priority: 'low',
        contactId: 'con-1',
        updatedBy: admin.id,
      }),
    });
  });

  it('falls back to the existing priority for an invalid value and keeps dueDate when the key is absent', async () => {
    db.task.findFirst.mockResolvedValue(taskRow({ priority: 'high', dueDate: due('2026-05-01') }));
    await updateTask('task-1', { priority: 'urgent' as unknown as 'high' }, admin);
    expect(db.task.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: expect.objectContaining({ priority: 'high', dueDate: due('2026-05-01') }),
    });
  });

  it('clears a relation when the key is present but blank, keeps it when the key is absent', async () => {
    db.task.findFirst.mockResolvedValue(taskRow({ contactId: 'con-1', accountId: 'acc-1' }));
    await updateTask('task-1', { contactId: '   ' }, admin);
    expect(db.task.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: expect.objectContaining({ contactId: null, accountId: 'acc-1' }),
    });
  });

  it('parses a newly provided dueDate', async () => {
    db.task.findFirst.mockResolvedValue(taskRow({ dueDate: null }));
    await updateTask('task-1', { dueDate: '2026-06-15' }, admin);
    expect(db.task.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: expect.objectContaining({ dueDate: due('2026-06-15') }),
    });
  });

  it('allows reassigning the task and returns the serialized updated row', async () => {
    db.task.findFirst.mockResolvedValue(taskRow({ assigneeId: sales.id }));
    db.task.update.mockResolvedValue(taskRow({ title: 'Fresh', assigneeId: 'user-9' }));
    const result = await updateTask('task-1', { title: 'Fresh', assigneeId: 'user-9' }, sales);
    expect(db.task.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: expect.objectContaining({ title: 'Fresh', assigneeId: 'user-9', updatedBy: sales.id }),
    });
    expect(result).toEqual(
      expect.objectContaining({ id: 'task-1', title: 'Fresh', assigneeId: 'user-9' }),
    );
  });
});

describe('softDeleteTask', () => {
  it('rejects when the task does not exist', async () => {
    db.task.findFirst.mockResolvedValue(null);
    await expect(softDeleteTask('task-1', admin)).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
      message: 'Task not found.',
    });
    expect(db.task.update).not.toHaveBeenCalled();
  });

  it('forbids a rep who is not the assignee', async () => {
    db.task.findFirst.mockResolvedValue(taskRow({ assigneeId: 'someone-else' }));
    await expect(softDeleteTask('task-1', stranger)).rejects.toMatchObject({
      status: 403,
      code: 'forbidden',
      message: 'You do not have permission to modify this task.',
    });
    expect(db.task.update).not.toHaveBeenCalled();
  });

  it('sets deletedAt and stamps the mutator for authorized users', async () => {
    db.task.findFirst.mockResolvedValue(taskRow({ assigneeId: sales.id }));
    await softDeleteTask('task-1', sales);
    expect(db.task.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: { deletedAt: now, updatedAt: now, updatedBy: sales.id },
    });
  });

  it('allows admins and managers regardless of ownership', async () => {
    db.task.findFirst.mockResolvedValue(taskRow({ assigneeId: 'someone-else' }));
    for (const user of [admin, manager]) {
      await expect(softDeleteTask('task-1', user)).resolves.toBeUndefined();
    }
  });
});

describe('completeTask', () => {
  it('rejects when the task does not exist or is soft-deleted', async () => {
    db.task.findFirst.mockResolvedValue(null);
    await expect(completeTask('task-1', admin)).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
      message: 'Task not found.',
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('forbids a rep who is not the assignee', async () => {
    db.task.findFirst.mockResolvedValue(taskRow({ assigneeId: 'someone-else' }));
    await expect(completeTask('task-1', stranger)).rejects.toMatchObject({
      status: 403,
      code: 'forbidden',
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('returns the task unchanged when it is already completed (idempotent)', async () => {
    db.task.findFirst.mockResolvedValue(
      taskRow({ status: 'completed', completedAt: now, completedBy: sales.id }),
    );
    const result = await completeTask('task-1', admin);
    expect(result).toEqual(expect.objectContaining({ id: 'task-1', status: 'completed' }));
    expect(db.task.update).not.toHaveBeenCalled();
    expect(db.taskCompletion.create).not.toHaveBeenCalled();
  });

  it('completes an open task: updates status, records completion history atomically', async () => {
    db.task.findFirst.mockResolvedValue(taskRow({ status: 'open', assigneeId: sales.id }));
    db.task.update.mockResolvedValue(
      taskRow({ status: 'completed', completedAt: now, completedBy: sales.id }),
    );
    const result = await completeTask('task-1', sales);
    expect(db.task.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: {
        status: 'completed',
        completedAt: now,
        completedBy: sales.id,
        updatedAt: now,
        updatedBy: sales.id,
      },
    });
    expect(db.taskCompletion.create).toHaveBeenCalledWith({
      data: { taskId: 'task-1', completedAt: now, completedBy: sales.id },
    });
    expect(db.$transaction).toHaveBeenCalledWith(expect.anything());
    expect(result).toEqual(
      expect.objectContaining({ id: 'task-1', status: 'completed', completedBy: sales.id }),
    );
  });
});

describe('reopenTask', () => {
  it('rejects when the task does not exist or is soft-deleted', async () => {
    db.task.findFirst.mockResolvedValue(null);
    await expect(reopenTask('task-1', admin)).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
      message: 'Task not found.',
    });
    expect(db.task.update).not.toHaveBeenCalled();
  });

  it('forbids a rep who is not the assignee', async () => {
    db.task.findFirst.mockResolvedValue(taskRow({ assigneeId: 'someone-else' }));
    await expect(reopenTask('task-1', stranger)).rejects.toMatchObject({
      status: 403,
      code: 'forbidden',
    });
    expect(db.task.update).not.toHaveBeenCalled();
  });

  it('returns the task unchanged when it is already open (idempotent)', async () => {
    db.task.findFirst.mockResolvedValue(taskRow({ status: 'open' }));
    const result = await reopenTask('task-1', admin);
    expect(result).toEqual(expect.objectContaining({ id: 'task-1', status: 'open' }));
    expect(db.task.update).not.toHaveBeenCalled();
  });

  it('reopens a completed task and clears completion fields', async () => {
    db.task.findFirst.mockResolvedValue(
      taskRow({ status: 'completed', completedAt: now, completedBy: sales.id }),
    );
    const result = await reopenTask('task-1', admin);
    expect(db.task.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: {
        status: 'open',
        completedAt: null,
        completedBy: null,
        updatedAt: now,
        updatedBy: admin.id,
      },
    });
    expect(result).toEqual(expect.objectContaining({ id: 'task-1', status: 'open' }));
    expect(db.taskCompletion.create).not.toHaveBeenCalled();
  });
});

describe('listTaskCompletions', () => {
  it('rejects when the task does not exist or is soft-deleted', async () => {
    db.task.findFirst.mockResolvedValue(null);
    await expect(listTaskCompletions('task-1', admin)).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
      message: 'Task not found.',
    });
    expect(db.taskCompletion.findMany).not.toHaveBeenCalled();
  });

  it('hides other users\u2019 tasks from reps with a 404 (no information leak)', async () => {
    db.task.findFirst.mockResolvedValue(taskRow({ assigneeId: 'someone-else' }));
    await expect(listTaskCompletions('task-1', stranger)).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
      message: 'Task not found.',
    });
    expect(db.taskCompletion.findMany).not.toHaveBeenCalled();
  });

  it('lets a rep read completion history for their own task', async () => {
    db.task.findFirst.mockResolvedValue(taskRow({ assigneeId: sales.id }));
    await expect(listTaskCompletions('task-1', sales)).resolves.toBeDefined();
    expect(db.taskCompletion.findMany).toHaveBeenCalledWith({
      where: { taskId: 'task-1' },
      orderBy: { completedAt: 'desc' },
    });
  });

  it('lets admins read completion history for any task', async () => {
    db.task.findFirst.mockResolvedValue(taskRow({ assigneeId: 'someone-else' }));
    await expect(listTaskCompletions('task-1', admin)).resolves.toBeDefined();
  });

  it('returns completion history newest first with ISO timestamps and total', async () => {
    db.task.findFirst.mockResolvedValue(taskRow({ assigneeId: sales.id }));
    const older = new Date('2026-01-01T08:00:00.000Z');
    const newer = new Date('2026-02-01T08:00:00.000Z');
    db.taskCompletion.findMany.mockResolvedValue([
      { id: 'tc-2', taskId: 'task-1', completedAt: newer, completedBy: sales.id },
      { id: 'tc-1', taskId: 'task-1', completedAt: older, completedBy: admin.id },
    ]);
    const result = await listTaskCompletions('task-1', sales);
    expect(result).toEqual({
      items: [
        { id: 'tc-2', taskId: 'task-1', completedAt: newer.toISOString(), completedBy: sales.id },
        { id: 'tc-1', taskId: 'task-1', completedAt: older.toISOString(), completedBy: admin.id },
      ],
      total: 2,
    });
  });

  it('returns an empty history for a never-completed task', async () => {
    db.task.findFirst.mockResolvedValue(taskRow({ assigneeId: sales.id }));
    const result = await listTaskCompletions('task-1', sales);
    expect(result).toEqual({ items: [], total: 0 });
  });
});
