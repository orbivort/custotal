// Unit tests for the task routes (FR-CC-08) including summary, completion and
// reopen endpoints. Pure unit tests: the service layer is mocked and Prisma is
// stubbed so the real auth gates load without a database.
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/db.ts', () => ({
  prisma: { session: { findFirst: vi.fn(), update: vi.fn() } },
}));

vi.mock('../../../src/services/task-service.ts', () => ({
  getTaskSummary: vi.fn(),
  listTasks: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  softDeleteTask: vi.fn(),
  completeTask: vi.fn(),
  reopenTask: vi.fn(),
  listTaskCompletions: vi.fn(),
}));

import * as taskService from '../../../src/services/task-service.ts';
import { requireCanEdit, requireUser } from '../../../src/middleware/auth.ts';
import { taskRouter } from '../../../src/routes/task-routes.ts';
import { call, findRoute, routerGuards } from '../../support/mocks/router.ts';
import type { Task, User } from '../../../src/types/domain.ts';

const service = taskService as unknown as Record<keyof typeof taskService, Mock>;

const user: User = { id: 'user-1', name: 'Alice', email: 'alice@example.com', role: 'rep' };
const task = { id: 'task-1', title: 'Send quote' } as unknown as Task;
const summary = { overdue: 1, dueToday: 2, open: 5, completed: 3 };

beforeEach(() => {
  vi.clearAllMocks();
  service.getTaskSummary.mockResolvedValue(summary);
  service.listTasks.mockResolvedValue([task]);
  service.createTask.mockResolvedValue(task);
  service.updateTask.mockResolvedValue(task);
  service.softDeleteTask.mockResolvedValue(undefined);
  service.completeTask.mockResolvedValue(task);
  service.reopenTask.mockResolvedValue(task);
  service.listTaskCompletions.mockResolvedValue([]);
});

describe('route guards', () => {
  it('requires an authenticated user for every task route', () => {
    expect(routerGuards(taskRouter)).toContain(requireUser);
  });

  it('requires edit rights on the mutating routes only', () => {
    const mutating: [string, string][] = [
      ['post', '/'],
      ['patch', '/:id'],
      ['delete', '/:id'],
      ['post', '/:id/complete'],
      ['post', '/:id/reopen'],
    ];
    for (const [method, path] of mutating) {
      expect(findRoute(taskRouter, method, path).handlers[0]).toBe(requireCanEdit);
    }
    expect(findRoute(taskRouter, 'get', '/').handlers).toHaveLength(1);
    expect(findRoute(taskRouter, 'get', '/summary').handlers).toHaveLength(1);
  });
});

describe('GET /api/tasks/summary', () => {
  it('returns the badge counts for the caller', async () => {
    const { res, done } = call(taskRouter, 'get', '/summary', { user });
    await done;

    expect(service.getTaskSummary).toHaveBeenCalledWith(user);
    expect(res.body).toBe(summary);
  });
});

describe('GET /api/tasks', () => {
  it('forwards the task filters for the caller', async () => {
    const { res, done } = call(taskRouter, 'get', '/', {
      user,
      query: { scope: 'mine', status: 'open', priority: 'high', owner: 'user-1', related: 'con-1' },
    });
    await done;

    expect(service.listTasks).toHaveBeenCalledWith(user, {
      scope: 'mine',
      status: 'open',
      priority: 'high',
      owner: 'user-1',
      related: 'con-1',
    });
    expect(res.body).toEqual([task]);
  });

  it('sends undefined filters for an empty query string', async () => {
    const { done } = call(taskRouter, 'get', '/', { user });
    await done;

    expect(service.listTasks).toHaveBeenCalledWith(user, {
      scope: undefined,
      status: undefined,
      priority: undefined,
      owner: undefined,
      related: undefined,
    });
  });
});

describe('POST /api/tasks', () => {
  it('creates the task as the acting user and answers 201', async () => {
    const body = { title: 'Send quote', priority: 'high' };
    const { res, done } = call(taskRouter, 'post', '/', { body, user });
    await done;

    expect(service.createTask).toHaveBeenCalledWith(body, user);
    expect(res.statusCode).toBe(201);
    expect(res.body).toBe(task);
  });

  it('coerces a missing body to an empty object', async () => {
    const { done } = call(taskRouter, 'post', '/', { user });
    await done;

    expect(service.createTask).toHaveBeenCalledWith({}, user);
  });
});

describe('PATCH /api/tasks/:id', () => {
  it('updates the task identified by the route param', async () => {
    const body = { status: 'in_progress' };
    const { res, done } = call(taskRouter, 'patch', '/:id', {
      params: { id: 'task-1' },
      body,
      user,
    });
    await done;

    expect(service.updateTask).toHaveBeenCalledWith('task-1', body, user);
    expect(res.body).toBe(task);
  });

  it('coerces a missing body to an empty object', async () => {
    const { done } = call(taskRouter, 'patch', '/:id', { params: { id: 'task-1' }, user });
    await done;

    expect(service.updateTask).toHaveBeenCalledWith('task-1', {}, user);
  });
});

describe('DELETE /api/tasks/:id', () => {
  it('soft deletes the task for the acting user', async () => {
    const { res, done } = call(taskRouter, 'delete', '/:id', { params: { id: 'task-1' }, user });
    await done;

    expect(service.softDeleteTask).toHaveBeenCalledWith('task-1', user);
    expect(res.body).toEqual({ ok: true });
  });
});

describe('task completion', () => {
  it('completes a task', async () => {
    const { res, done } = call(taskRouter, 'post', '/:id/complete', {
      params: { id: 'task-1' },
      user,
    });
    await done;

    expect(service.completeTask).toHaveBeenCalledWith('task-1', user);
    expect(res.body).toBe(task);
  });

  it('reopens a completed task', async () => {
    const { res, done } = call(taskRouter, 'post', '/:id/reopen', {
      params: { id: 'task-1' },
      user,
    });
    await done;

    expect(service.reopenTask).toHaveBeenCalledWith('task-1', user);
    expect(res.body).toBe(task);
  });

  it('lists the completion history without requiring edit rights', async () => {
    const { res, done } = call(taskRouter, 'get', '/:id/completions', {
      params: { id: 'task-1' },
      user,
    });
    await done;

    expect(service.listTaskCompletions).toHaveBeenCalledWith('task-1', user);
    expect(res.body).toEqual([]);
  });

  it('propagates completion failures', async () => {
    const failure = new Error('Task is already completed.');
    service.completeTask.mockRejectedValue(failure);
    const { done } = call(taskRouter, 'post', '/:id/complete', { params: { id: 'task-1' }, user });

    await expect(done).rejects.toBe(failure);
  });
});
