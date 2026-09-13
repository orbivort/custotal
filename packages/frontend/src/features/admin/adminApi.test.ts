// Unit tests for the admin API service (users, stages, trash/recovery).
//
// Only the HTTP transport (`lib/api`.api) is mocked. Every test asserts the
// verb, path, and body each function sends, plus that the decoded response is
// returned untouched. `toQueryString` is kept real where used so the
// query-serialization contract stays exercised end to end.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Account,
  Contact,
  Interaction,
  Opportunity,
  Stage,
  Task,
  TrashPayload,
  User,
} from '../../types/domain';
import {
  createStage,
  createUser,
  deleteStage,
  deleteUser,
  listTrash,
  listUsers,
  purgeTrashAccount,
  purgeTrashContact,
  purgeTrashInteraction,
  purgeTrashOpportunity,
  purgeTrashTask,
  reorderStages,
  restoreTrashAccount,
  restoreTrashContact,
  restoreTrashInteraction,
  restoreTrashOpportunity,
  restoreTrashTask,
  updateStage,
  updateUser,
} from './adminApi';

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
    ApiError: actual.ApiError,
    api: { get: h.get, post: h.post, patch: h.patch, del: h.del },
  };
});

const USER: User = { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin' };

const STAGE: Stage = {
  id: 's1',
  name: 'Discovery',
  order: 1,
  winProbability: 20,
  classification: 'open',
};

const CONTACT: Contact = {
  id: 'c1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  status: 'active',
  accountLinks: [],
  createdAt: '2026-01-01T00:00:00Z',
  createdBy: 'u1',
  updatedAt: '2026-01-02T00:00:00Z',
  updatedBy: 'u1',
};

const ACCOUNT: Account = {
  id: 'a1',
  name: 'Acme Corp',
  ownerId: 'u1',
  createdAt: '2026-01-01T00:00:00Z',
  createdBy: 'u1',
  updatedAt: '2026-01-02T00:00:00Z',
  updatedBy: 'u1',
};

const OPPORTUNITY: Opportunity = {
  id: 'o1',
  name: 'Big deal',
  accountId: 'a1',
  valueMinor: 10000,
  currency: 'USD',
  expectedCloseDate: '2026-06-30',
  stageId: 's1',
  probability: 50,
  probabilityManual: false,
  ownerId: 'u1',
  createdAt: '2026-01-01T00:00:00Z',
  createdBy: 'u1',
  updatedAt: '2026-01-02T00:00:00Z',
  updatedBy: 'u1',
};

const TASK: Task = {
  id: 't1',
  title: 'Call back',
  priority: 'medium',
  status: 'open',
  assigneeId: 'u1',
  createdAt: '2026-01-01T00:00:00Z',
  createdBy: 'u1',
  updatedAt: '2026-01-02T00:00:00Z',
  updatedBy: 'u1',
};

const INTERACTION: Interaction = {
  id: 'i1',
  type: 'call',
  dateTime: '2026-01-05T10:00:00Z',
  summary: 'Intro call',
  contactId: 'c1',
  responsibleUserId: 'u1',
  createdAt: '2026-01-01T00:00:00Z',
  createdBy: 'u1',
  updatedAt: '2026-01-02T00:00:00Z',
  updatedBy: 'u1',
};

const TRASH: TrashPayload = {
  contacts: [],
  accounts: [],
  opportunities: [],
  tasks: [],
  interactions: [],
};

describe('adminApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.get.mockResolvedValue(undefined);
    h.post.mockResolvedValue(undefined);
    h.patch.mockResolvedValue(undefined);
    h.del.mockResolvedValue({ ok: true });
  });

  describe('listUsers', () => {
    it('unwraps the items envelope from the users endpoint', async () => {
      const users = [USER];
      h.get.mockResolvedValueOnce({ items: users });

      const result = await listUsers();

      expect(h.get).toHaveBeenCalledWith('/api/admin/users');
      expect(result).toBe(users);
    });

    it('propagates transport failures to the caller', async () => {
      h.get.mockRejectedValueOnce(new Error('unreachable'));

      await expect(listUsers()).rejects.toThrow('unreachable');
    });
  });

  describe('createUser', () => {
    it('posts the input to the users collection and returns the invite result envelope', async () => {
      const envelope = { user: USER, inviteSent: true };
      h.post.mockResolvedValueOnce(envelope);
      const input = { name: 'Grace Hopper', email: 'grace@example.com', role: 'rep' as const };

      const result = await createUser(input);

      expect(h.post).toHaveBeenCalledWith('/api/admin/users', input);
      expect(result).toBe(envelope);
    });
  });

  describe('updateUser', () => {
    it('patches the item endpoint with the partial input', async () => {
      h.patch.mockResolvedValueOnce({ ...USER, role: 'manager' });

      const result = await updateUser('u1', { role: 'manager' });

      expect(h.patch).toHaveBeenCalledWith('/api/admin/users/u1', { role: 'manager' });
      expect(result).toEqual({ ...USER, role: 'manager' });
    });
  });

  describe('deleteUser', () => {
    it('deletes the item endpoint and resolves without a value', async () => {
      await expect(deleteUser('u1')).resolves.toBeUndefined();

      expect(h.del).toHaveBeenCalledWith('/api/admin/users/u1');
    });

    it('propagates permission failures', async () => {
      h.del.mockRejectedValueOnce(new Error('Forbidden'));

      await expect(deleteUser('u1')).rejects.toThrow('Forbidden');
    });
  });

  describe('createStage', () => {
    it('posts the input to the stages collection', async () => {
      h.post.mockResolvedValueOnce(STAGE);
      const input = { name: 'Discovery', winProbability: 20, classification: 'open' as const };

      const result = await createStage(input);

      expect(h.post).toHaveBeenCalledWith('/api/admin/stages', input);
      expect(result).toBe(STAGE);
    });

    it('accepts a minimal input with no options set', async () => {
      h.post.mockResolvedValueOnce(STAGE);

      await createStage({});

      expect(h.post).toHaveBeenCalledWith('/api/admin/stages', {});
    });
  });

  describe('updateStage', () => {
    it('patches the stage endpoint with the partial input', async () => {
      h.patch.mockResolvedValueOnce({ ...STAGE, winProbability: 30 });

      await updateStage('s1', { winProbability: 30 });

      expect(h.patch).toHaveBeenCalledWith('/api/admin/stages/s1', { winProbability: 30 });
    });
  });

  describe('deleteStage', () => {
    it('deletes the stage endpoint and resolves without a value', async () => {
      await expect(deleteStage('s1')).resolves.toBeUndefined();

      expect(h.del).toHaveBeenCalledWith('/api/admin/stages/s1');
    });
  });

  describe('reorderStages', () => {
    it('posts the ordered ids and returns the stages in their new order', async () => {
      const stages = [STAGE, { ...STAGE, id: 's2', name: 'Proposal' }];
      h.post.mockResolvedValueOnce({ items: stages });

      const result = await reorderStages(['s2', 's1']);

      expect(h.post).toHaveBeenCalledWith('/api/admin/stages/reorder', {
        orderedIds: ['s2', 's1'],
      });
      expect(result).toBe(stages);
    });
  });

  describe('listTrash', () => {
    it('returns the trash payload untouched', async () => {
      h.get.mockResolvedValueOnce(TRASH);

      const result = await listTrash();

      expect(h.get).toHaveBeenCalledWith('/api/admin/trash');
      expect(result).toBe(TRASH);
    });
  });

  describe('trash restore helpers', () => {
    it.each([
      ['restoreTrashContact', 'contacts', CONTACT],
      ['restoreTrashAccount', 'accounts', ACCOUNT],
      ['restoreTrashOpportunity', 'opportunities', OPPORTUNITY],
      ['restoreTrashTask', 'tasks', TASK],
      ['restoreTrashInteraction', 'interactions', INTERACTION],
    ] as const)(
      '%s posts to the restore endpoint and returns the record',
      async (fn, kind, record) => {
        h.post.mockResolvedValueOnce(record);

        const restore = {
          restoreTrashContact,
          restoreTrashAccount,
          restoreTrashOpportunity,
          restoreTrashTask,
          restoreTrashInteraction,
        }[fn];

        const result = await restore('x1');

        expect(h.post).toHaveBeenCalledWith(`/api/admin/trash/${kind}/x1/restore`);
        expect(result).toBe(record);
      },
    );
  });

  describe('trash purge helpers', () => {
    it.each([
      ['purgeTrashContact', 'contacts'],
      ['purgeTrashAccount', 'accounts'],
      ['purgeTrashOpportunity', 'opportunities'],
      ['purgeTrashTask', 'tasks'],
      ['purgeTrashInteraction', 'interactions'],
    ] as const)('%s deletes the endpoint and resolves without a value', async (fn, kind) => {
      const purge = {
        purgeTrashContact,
        purgeTrashAccount,
        purgeTrashOpportunity,
        purgeTrashTask,
        purgeTrashInteraction,
      }[fn];

      await expect(purge('x1')).resolves.toBeUndefined();

      expect(h.del).toHaveBeenCalledWith(`/api/admin/trash/${kind}/x1`);
    });

    it('propagates failures so callers can surface an error toast', async () => {
      h.del.mockRejectedValueOnce(new Error('Purge failed'));

      await expect(purgeTrashContact('c1')).rejects.toThrow('Purge failed');
    });
  });
});
