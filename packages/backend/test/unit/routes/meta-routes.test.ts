// Unit tests for the instance metadata routes (GET /api/health, /api/meta, /api/stages).
// Pure unit tests: Prisma and env config are mocked at the module boundary; real
// serializers are used so the wire-shape mapping is exercised for real.
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/db.ts', () => ({
  prisma: {
    user: { findMany: vi.fn() },
    stage: { findMany: vi.fn(), createMany: vi.fn() },
    account: { findMany: vi.fn() },
  },
}));

vi.mock('../../../src/config.ts', () => ({
  env: {
    appVersion: '9.9.9',
    instance: {
      orgName: 'Custotal Test',
      environment: 'staging',
      hostname: 'test.local',
      allowPasswordReset: false,
      setupRequired: true,
    },
  },
}));

import { prisma } from '../../../src/db.ts';
import { ApiError } from '../../../src/lib/errors.ts';
import { DEFAULT_STAGES } from '../../../src/lib/default-stages.ts';
import { metaRouter } from '../../../src/routes/meta-routes.ts';
import { callRoute, findRoute, routeHandler } from '../../support/mocks/router.ts';

const db = prisma as unknown as {
  user: { findMany: Mock };
  stage: { findMany: Mock; createMany: Mock };
  account: { findMany: Mock };
};

const userRow = { id: 'u1', name: 'Ada', email: 'ada@example.com', role: 'admin' };
const stageRow = {
  id: 's1',
  name: 'Qualified',
  order: 2,
  winProbability: 50,
  classification: 'open',
};
const accountRows = [{ id: 'a1', name: 'Globex', ownerId: 'u1' }];

const expectedStage = {
  id: 's1',
  name: 'Qualified',
  order: 2,
  winProbability: 50,
  classification: 'open',
};

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findMany.mockResolvedValue([userRow]);
  db.stage.findMany.mockResolvedValue([stageRow]);
  db.account.findMany.mockResolvedValue(accountRows);
});

describe('GET /api/health', () => {
  it('reports the instance bootstrap info from env', async () => {
    const { res, done } = callRoute(routeHandler(metaRouter, 'get', '/health'));
    await done;

    expect(res.body).toEqual({
      orgName: 'Custotal Test',
      version: '9.9.9',
      environment: 'staging',
      hostname: 'test.local',
      allowPasswordReset: false,
      setupRequired: true,
    });
  });

  it('never touches the database', async () => {
    const { done } = callRoute(routeHandler(metaRouter, 'get', '/health'));
    await done;

    expect(db.user.findMany).not.toHaveBeenCalled();
    expect(db.stage.findMany).not.toHaveBeenCalled();
    expect(db.account.findMany).not.toHaveBeenCalled();
  });
});

describe('GET /api/meta', () => {
  it('returns users, stages and live accounts in one round trip', async () => {
    const { res, done } = callRoute(routeHandler(metaRouter, 'get', '/meta'));
    await done;

    expect(res.body).toEqual({
      users: [{ ...userRow, mustChangePassword: false }],
      stages: [expectedStage],
      accounts: [{ id: 'a1', name: 'Globex', ownerId: 'u1' }],
    });
  });

  it('queries users ordered by name, stages by order and only live accounts', async () => {
    const { done } = callRoute(routeHandler(metaRouter, 'get', '/meta'));
    await done;

    expect(db.user.findMany).toHaveBeenCalledWith({ orderBy: { name: 'asc' } });
    expect(db.stage.findMany).toHaveBeenCalledWith({ orderBy: { order: 'asc' } });
    expect(db.account.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      select: { id: true, name: true, ownerId: true },
    });
  });

  it('propagates database failures to the error handler', async () => {
    const failure = new Error('database unavailable');
    db.user.findMany.mockRejectedValue(failure);
    const { res, done } = callRoute(routeHandler(metaRouter, 'get', '/meta'));

    await expect(done).rejects.toBe(failure);
    expect(res.body).toBeUndefined();
  });
});

describe('GET /api/stages', () => {
  it('returns the pipeline stages in configured order', async () => {
    const { res, done } = callRoute(routeHandler(metaRouter, 'get', '/stages'));
    await done;

    expect(db.stage.findMany).toHaveBeenCalledWith({ orderBy: { order: 'asc' } });
    expect(res.body).toEqual([expectedStage]);
  });

  it('returns an empty list when no stages are configured', async () => {
    db.stage.findMany.mockResolvedValue([]);
    const { res, done } = callRoute(routeHandler(metaRouter, 'get', '/stages'));
    await done;

    expect(res.body).toEqual([]);
  });
});

describe('POST /api/stages/ensure', () => {
  it('provisions the default pipeline when none is configured yet', async () => {
    db.stage.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([...DEFAULT_STAGES]);

    const { res, done } = callRoute(routeHandler(metaRouter, 'post', '/stages/ensure'));
    await done;

    expect(db.stage.createMany).toHaveBeenCalledWith({
      data: DEFAULT_STAGES.map((stage) => ({ ...stage })),
      skipDuplicates: true,
    });
    expect(res.body).toEqual({ created: true, items: DEFAULT_STAGES });
  });

  it('returns the configured pipeline untouched when stages already exist', async () => {
    const { res, done } = callRoute(routeHandler(metaRouter, 'post', '/stages/ensure'));
    await done;

    expect(db.stage.createMany).not.toHaveBeenCalled();
    expect(res.body).toEqual({ created: false, items: [expectedStage] });
  });

  it('registers an authentication guard ahead of the handler', () => {
    const { handlers } = findRoute(metaRouter, 'post', '/stages/ensure');
    expect(handlers.length).toBeGreaterThanOrEqual(2);
  });
});

describe('GET /api/meta access control', () => {
  it('registers an authentication guard ahead of the handler', () => {
    const { handlers } = findRoute(metaRouter, 'get', '/meta');
    expect(handlers.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects anonymous callers with 401 unauthorized', async () => {
    const [guard] = findRoute(metaRouter, 'get', '/meta').handlers;
    const { next, done } = callRoute(guard, { user: null });
    await done;

    const error = (next as unknown as Mock).mock.calls[0][0] as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(401);
    expect(error.code).toBe('unauthorized');
  });
});
