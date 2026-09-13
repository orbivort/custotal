// Unit tests for the tasks API service.
//
// Only the HTTP transport (`lib/api`.api) is mocked: every test asserts the
// verb, path, query string, and body a function sends, plus that the decoded
// response is returned untouched. `toQueryString` is kept real so the
// filter-serialization contract (empty values dropped, values encoded) is
// exercised end to end rather than re-implemented in a stub.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ListResult, Task, TaskSummary } from '../../types/domain';
import {
  completeTask,
  createTask,
  deleteTask,
  getTaskSummary,
  listTaskCompletions,
  listTasks,
  reopenTask,
  updateTask,
} from './tasksApi';

const h = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}));

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return {
    toQueryString: actual.toQueryString,
    api: { get: h.get, post: h.post, patch: h.patch, del: h.del },
  };
});

const TASK: Task = {
  id: 't1',
  title: 'Send proposal',
  description: 'Draft and email the renewal proposal',
  dueDate: '2026-09-01',
  priority: 'high',
  status: 'open',
  assigneeId: 'u1',
  contactId: 'c1',
  accountId: 'a1',
  opportunityId: 'o1',
  createdAt: '2026-08-20T09:00:00.000Z',
  createdBy: 'u1',
  updatedAt: '2026-08-21T09:00:00.000Z',
  updatedBy: 'u1',
};

const LIST: ListResult<Task> = { items: [TASK], total: 1 };

const SUMMARY: TaskSummary = { dueToday: 2, overdue: 5 };

const COMPLETIONS = {
  items: [
    {
      id: 'tc1',
      taskId: 't1',
      completedAt: '2026-08-25T10:15:00.000Z',
      completedBy: 'u1',
    },
  ],
  total: 1,
};

describe('tasksApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.get.mockResolvedValue(LIST);
    h.post.mockResolvedValue(TASK);
    h.patch.mockResolvedValue(TASK);
    h.del.mockResolvedValue({ ok: true });
  });

  describe('listTasks', () => {
    it('serializes every filter into the query string in declaration order', async () => {
      const result = await listTasks({
        scope: 'all',
        status: 'open',
        priority: 'high',
        owner: 'u2',
        related: 'contact',
      });

      expect(h.get).toHaveBeenCalledWith(
        '/api/tasks?scope=all&status=open&priority=high&owner=u2&related=contact',
      );
      expect(result).toBe(LIST);
    });

    it('omits empty and undefined filters so unrelated scopes send no param', async () => {
      await listTasks({ scope: 'mine', status: '', priority: undefined, owner: '', related: '' });

      expect(h.get).toHaveBeenCalledWith('/api/tasks?scope=mine');
    });

    it('produces a bare path when no filters are supplied', async () => {
      await listTasks({});

      expect(h.get).toHaveBeenCalledWith('/api/tasks');
    });

    it('percent-encodes filter values containing reserved characters', async () => {
      await listTasks({ owner: 'u&2 x' });

      expect(h.get).toHaveBeenCalledWith('/api/tasks?owner=u%262+x');
    });

    it('propagates transport failures to the caller', async () => {
      h.get.mockRejectedValueOnce(new Error('unreachable'));

      await expect(listTasks({ scope: 'mine' })).rejects.toThrow('unreachable');
    });
  });

  describe('getTaskSummary', () => {
    it('reads the badge-count endpoint and returns the decoded payload', async () => {
      h.get.mockResolvedValue(SUMMARY);

      const result = await getTaskSummary();

      expect(h.get).toHaveBeenCalledWith('/api/tasks/summary');
      expect(result).toBe(SUMMARY);
    });

    it('propagates authorization failures so pages can fall back', async () => {
      h.get.mockRejectedValueOnce(new Error('Forbidden'));

      await expect(getTaskSummary()).rejects.toThrow('Forbidden');
    });
  });

  describe('createTask', () => {
    it('posts the input to the collection endpoint and returns the new task', async () => {
      const input = {
        title: 'Send proposal',
        description: 'Draft and email it',
        dueDate: '2026-09-01',
        priority: 'high' as const,
        assigneeId: 'u1',
      };

      const result = await createTask(input);

      expect(h.post).toHaveBeenCalledWith('/api/tasks', input);
      expect(result).toBe(TASK);
    });

    it('posts a minimal payload without optional fields', async () => {
      await createTask({ title: 'Follow up', assigneeId: 'u1' });

      expect(h.post).toHaveBeenCalledWith('/api/tasks', {
        title: 'Follow up',
        assigneeId: 'u1',
      });
    });

    it('propagates validation failures from the server', async () => {
      h.post.mockRejectedValueOnce(new Error('Title is required.'));

      await expect(createTask({})).rejects.toThrow('Title is required.');
    });
  });

  describe('updateTask', () => {
    it('patches the task endpoint and returns the updated task', async () => {
      const input = { title: 'Renamed task', priority: 'low' as const };

      const result = await updateTask('t1', input);

      expect(h.patch).toHaveBeenCalledWith('/api/tasks/t1', input);
      expect(result).toBe(TASK);
    });

    it('patches partial status changes without touching other fields', async () => {
      await updateTask('t1', { status: 'completed' });

      expect(h.patch).toHaveBeenCalledWith('/api/tasks/t1', { status: 'completed' });
    });

    it('propagates not-found errors', async () => {
      h.patch.mockRejectedValueOnce(new Error('Task not found'));

      await expect(updateTask('missing', { title: 'x' })).rejects.toThrow('Task not found');
    });
  });

  describe('deleteTask', () => {
    it('deletes the task endpoint and resolves without a value', async () => {
      await expect(deleteTask('t1')).resolves.toBeUndefined();

      expect(h.del).toHaveBeenCalledWith('/api/tasks/t1');
    });

    it('propagates permission failures', async () => {
      h.del.mockRejectedValueOnce(new Error('Forbidden'));

      await expect(deleteTask('t1')).rejects.toThrow('Forbidden');
    });
  });

  describe('completeTask / reopenTask', () => {
    it('posts to the complete sub-resource with no body', async () => {
      const result = await completeTask('t1');

      expect(h.post).toHaveBeenCalledWith('/api/tasks/t1/complete');
      expect(result).toBe(TASK);
    });

    it('posts to the reopen sub-resource with no body', async () => {
      const result = await reopenTask('t1');

      expect(h.post).toHaveBeenCalledWith('/api/tasks/t1/reopen');
      expect(result).toBe(TASK);
    });

    it('propagates already-completed conflicts', async () => {
      h.post.mockRejectedValueOnce(new Error('Task is already completed'));

      await expect(completeTask('t1')).rejects.toThrow('Task is already completed');
    });
  });

  describe('listTaskCompletions', () => {
    it('reads the completion-history endpoint and returns the decoded payload', async () => {
      h.get.mockResolvedValue(COMPLETIONS);

      const result = await listTaskCompletions('t1');

      expect(h.get).toHaveBeenCalledWith('/api/tasks/t1/completions');
      expect(result).toBe(COMPLETIONS);
    });

    it('propagates failures so the history modal can render its error state', async () => {
      h.get.mockRejectedValueOnce(new Error('Failed to load history'));

      await expect(listTaskCompletions('t1')).rejects.toThrow('Failed to load history');
    });
  });
});
