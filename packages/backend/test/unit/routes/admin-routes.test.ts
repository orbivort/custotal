// Unit tests for the admin routes (user management, pipeline stages, trash).
// Pure unit tests: the service layer is mocked and Prisma is stubbed so the real
// requireAdmin gate loads without a database. Covers the admin gate, status
// codes, orderedIds coercion and every trash restore/purge endpoint.
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/db.ts', () => ({
  prisma: { session: { findFirst: vi.fn(), update: vi.fn() } },
}));

vi.mock('../../../src/services/admin-service.ts', () => ({
  listUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  createStage: vi.fn(),
  updateStage: vi.fn(),
  deleteStage: vi.fn(),
  reorderStages: vi.fn(),
  listTrash: vi.fn(),
  restoreTrashContact: vi.fn(),
  restoreTrashAccount: vi.fn(),
  restoreTrashOpportunity: vi.fn(),
  restoreTrashTask: vi.fn(),
  restoreTrashInteraction: vi.fn(),
  purgeTrashContact: vi.fn(),
  purgeTrashAccount: vi.fn(),
  purgeTrashOpportunity: vi.fn(),
  purgeTrashTask: vi.fn(),
  purgeTrashInteraction: vi.fn(),
}));

import * as adminService from '../../../src/services/admin-service.ts';
import { requireAdmin } from '../../../src/middleware/auth.ts';
import { adminRouter } from '../../../src/routes/admin-routes.ts';
import { call, routerGuards } from '../../support/mocks/router.ts';
import type { Stage, User } from '../../../src/types/domain.ts';

const service = adminService as unknown as Record<keyof typeof adminService, Mock>;

const admin: User = { id: 'admin-1', name: 'Root', email: 'root@example.com', role: 'admin' };
const managed: User = { id: 'user-2', name: 'Bob', email: 'bob@example.com', role: 'rep' };
const stage = { id: 'stg-1', name: 'Qualified', order: 1 } as unknown as Stage;
const trash = { contacts: [], accounts: [], opportunities: [], tasks: [], interactions: [] };

beforeEach(() => {
  vi.clearAllMocks();
  service.listUsers.mockResolvedValue([managed]);
  service.createUser.mockResolvedValue(managed);
  service.updateUser.mockResolvedValue(managed);
  service.deleteUser.mockResolvedValue(undefined);
  service.createStage.mockResolvedValue(stage);
  service.updateStage.mockResolvedValue(stage);
  service.deleteStage.mockResolvedValue(undefined);
  service.reorderStages.mockResolvedValue([stage]);
  service.listTrash.mockResolvedValue(trash);
  for (const key of Object.keys(service)) {
    if (key.startsWith('restoreTrash') || key.startsWith('purgeTrash')) {
      service[key as keyof typeof service].mockResolvedValue(undefined);
    }
  }
});

describe('route guards', () => {
  it('requires administrator access for every admin route', () => {
    expect(routerGuards(adminRouter)).toContain(requireAdmin);
  });
});

describe('user management', () => {
  it('lists users wrapped in an items envelope', async () => {
    const { res, done } = call(adminRouter, 'get', '/users', { user: admin });
    await done;

    expect(service.listUsers).toHaveBeenCalledTimes(1);
    expect(res.body).toEqual({ items: [managed] });
  });

  it('creates a user and answers 201', async () => {
    const body = { name: 'Bob', email: 'bob@example.com', role: 'rep' };
    const { res, done } = call(adminRouter, 'post', '/users', { body, user: admin });
    await done;

    expect(service.createUser).toHaveBeenCalledWith(body);
    expect(res.statusCode).toBe(201);
    expect(res.body).toBe(managed);
  });

  it('coerces a missing create body to an empty object', async () => {
    const { done } = call(adminRouter, 'post', '/users', { user: admin });
    await done;

    expect(service.createUser).toHaveBeenCalledWith({});
  });

  it('updates the user identified by the route param', async () => {
    const body = { role: 'manager' };
    const { res, done } = call(adminRouter, 'patch', '/users/:id', {
      params: { id: 'user-2' },
      body,
      user: admin,
    });
    await done;

    expect(service.updateUser).toHaveBeenCalledWith('user-2', body);
    expect(res.body).toBe(managed);
  });

  it('coerces a missing user patch body to an empty object', async () => {
    const { done } = call(adminRouter, 'patch', '/users/:id', {
      params: { id: 'user-2' },
      user: admin,
    });
    await done;

    expect(service.updateUser).toHaveBeenCalledWith('user-2', {});
  });

  it('deletes a user and records the acting admin', async () => {
    const { res, done } = call(adminRouter, 'delete', '/users/:id', {
      params: { id: 'user-2' },
      user: admin,
    });
    await done;

    expect(service.deleteUser).toHaveBeenCalledWith('user-2', admin);
    expect(res.body).toEqual({ ok: true });
  });

  it('propagates self-deletion / last-admin failures', async () => {
    const failure = new Error('Cannot delete the last administrator.');
    service.deleteUser.mockRejectedValue(failure);
    const { done } = call(adminRouter, 'delete', '/users/:id', {
      params: { id: 'admin-1' },
      user: admin,
    });

    await expect(done).rejects.toBe(failure);
  });
});

describe('pipeline stages', () => {
  it('creates a stage and answers 201', async () => {
    const body = { name: 'Qualified', winProbability: 50, classification: 'open' };
    const { res, done } = call(adminRouter, 'post', '/stages', { body, user: admin });
    await done;

    expect(service.createStage).toHaveBeenCalledWith(body);
    expect(res.statusCode).toBe(201);
    expect(res.body).toBe(stage);
  });

  it('coerces a missing stage create body to an empty object', async () => {
    const { done } = call(adminRouter, 'post', '/stages', { user: admin });
    await done;

    expect(service.createStage).toHaveBeenCalledWith({});
  });

  it('updates the stage identified by the route param', async () => {
    const body = { name: 'Renamed' };
    const { res, done } = call(adminRouter, 'patch', '/stages/:id', {
      params: { id: 'stg-1' },
      body,
      user: admin,
    });
    await done;

    expect(service.updateStage).toHaveBeenCalledWith('stg-1', body);
    expect(res.body).toBe(stage);
  });

  it('coerces a missing stage patch body to an empty object', async () => {
    const { done } = call(adminRouter, 'patch', '/stages/:id', {
      params: { id: 'stg-1' },
      user: admin,
    });
    await done;

    expect(service.updateStage).toHaveBeenCalledWith('stg-1', {});
  });

  it('deletes a stage and acknowledges', async () => {
    const { res, done } = call(adminRouter, 'delete', '/stages/:id', {
      params: { id: 'stg-1' },
      user: admin,
    });
    await done;

    expect(service.deleteStage).toHaveBeenCalledWith('stg-1');
    expect(res.body).toEqual({ ok: true });
  });

  it('reorders stages from the submitted id list', async () => {
    const { res, done } = call(adminRouter, 'post', '/stages/reorder', {
      body: { orderedIds: ['stg-2', 'stg-1'] },
      user: admin,
    });
    await done;

    expect(service.reorderStages).toHaveBeenCalledWith(['stg-2', 'stg-1']);
    expect(res.body).toEqual({ items: [stage] });
  });

  it('stringifies non-string ids in the reorder payload', async () => {
    const { done } = call(adminRouter, 'post', '/stages/reorder', {
      body: { orderedIds: [1, 2] },
      user: admin,
    });
    await done;

    expect(service.reorderStages).toHaveBeenCalledWith(['1', '2']);
  });

  it('treats a missing or non-array orderedIds payload as an empty list', async () => {
    await call(adminRouter, 'post', '/stages/reorder', { user: admin }).done;
    expect(service.reorderStages).toHaveBeenLastCalledWith([]);

    await call(adminRouter, 'post', '/stages/reorder', {
      body: { orderedIds: 'stg-1' },
      user: admin,
    }).done;
    expect(service.reorderStages).toHaveBeenLastCalledWith([]);
  });
});

describe('trash', () => {
  it('lists the recoverable records', async () => {
    const { res, done } = call(adminRouter, 'get', '/trash', { user: admin });
    await done;

    expect(service.listTrash).toHaveBeenCalledTimes(1);
    expect(res.body).toBe(trash);
  });

  const restores: [string, string, keyof typeof adminService][] = [
    ['contact', '/trash/contacts/:id/restore', 'restoreTrashContact'],
    ['account', '/trash/accounts/:id/restore', 'restoreTrashAccount'],
    ['opportunity', '/trash/opportunities/:id/restore', 'restoreTrashOpportunity'],
    ['task', '/trash/tasks/:id/restore', 'restoreTrashTask'],
    ['interaction', '/trash/interactions/:id/restore', 'restoreTrashInteraction'],
  ];

  it.each(restores)(
    'restores a deleted %s and records the acting admin',
    async (_label, path, fn) => {
      const { res, done } = call(adminRouter, 'post', path, {
        params: { id: 'rec-1' },
        user: admin,
      });
      await done;

      expect(service[fn]).toHaveBeenCalledWith('rec-1', admin);
      expect(res.statusCode).toBe(0);
    },
  );

  it.each(restores)('propagates restore failures for a deleted %s', async (_label, path, fn) => {
    const failure = new Error('Resource not found.');
    service[fn].mockRejectedValue(failure);
    const { done } = call(adminRouter, 'post', path, { params: { id: 'missing' }, user: admin });

    await expect(done).rejects.toBe(failure);
  });

  const purges: [string, string, keyof typeof adminService][] = [
    ['contact', '/trash/contacts/:id', 'purgeTrashContact'],
    ['account', '/trash/accounts/:id', 'purgeTrashAccount'],
    ['opportunity', '/trash/opportunities/:id', 'purgeTrashOpportunity'],
    ['task', '/trash/tasks/:id', 'purgeTrashTask'],
    ['interaction', '/trash/interactions/:id', 'purgeTrashInteraction'],
  ];

  it.each(purges)('permanently deletes a %s and acknowledges', async (_label, path, fn) => {
    const { res, done } = call(adminRouter, 'delete', path, {
      params: { id: 'rec-1' },
      user: admin,
    });
    await done;

    expect(service[fn]).toHaveBeenCalledWith('rec-1');
    expect(res.body).toEqual({ ok: true });
  });

  it.each(purges)('propagates purge failures for a %s', async (_label, path, fn) => {
    const failure = new Error('Resource not found.');
    service[fn].mockRejectedValue(failure);
    const { done } = call(adminRouter, 'delete', path, { params: { id: 'missing' }, user: admin });

    await expect(done).rejects.toBe(failure);
  });
});
