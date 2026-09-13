// Unit tests for the opportunity routes (FR-CC-06) including the stage-move
// endpoint. Pure unit tests: the service layer is mocked and Prisma is stubbed
// so the real auth gates load without a database.
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/db.ts', () => ({
  prisma: { session: { findFirst: vi.fn(), update: vi.fn() } },
}));

vi.mock('../../../src/services/opportunity-service.ts', () => ({
  listOpportunities: vi.fn(),
  getOpportunity: vi.fn(),
  createOpportunity: vi.fn(),
  updateOpportunity: vi.fn(),
  softDeleteOpportunity: vi.fn(),
  moveOpportunityStage: vi.fn(),
}));

import * as opportunityService from '../../../src/services/opportunity-service.ts';
import { requireCanEdit, requireUser } from '../../../src/middleware/auth.ts';
import { opportunityRouter } from '../../../src/routes/opportunity-routes.ts';
import { call, findRoute, routerGuards } from '../../support/mocks/router.ts';
import type { Opportunity, User } from '../../../src/types/domain.ts';

const service = opportunityService as unknown as Record<keyof typeof opportunityService, Mock>;

const user: User = { id: 'user-1', name: 'Alice', email: 'alice@example.com', role: 'rep' };
const opportunity = { id: 'opp-1', name: 'Globex rollout' } as unknown as Opportunity;

beforeEach(() => {
  vi.clearAllMocks();
  service.listOpportunities.mockResolvedValue([opportunity]);
  service.getOpportunity.mockResolvedValue(opportunity);
  service.createOpportunity.mockResolvedValue(opportunity);
  service.updateOpportunity.mockResolvedValue(opportunity);
  service.softDeleteOpportunity.mockResolvedValue(undefined);
  service.moveOpportunityStage.mockResolvedValue(opportunity);
});

describe('route guards', () => {
  it('requires an authenticated user for every opportunity route', () => {
    expect(routerGuards(opportunityRouter)).toContain(requireUser);
  });

  it('requires edit rights on the mutating routes only', () => {
    expect(findRoute(opportunityRouter, 'post', '/').handlers[0]).toBe(requireCanEdit);
    expect(findRoute(opportunityRouter, 'patch', '/:id').handlers[0]).toBe(requireCanEdit);
    expect(findRoute(opportunityRouter, 'delete', '/:id').handlers[0]).toBe(requireCanEdit);
    expect(findRoute(opportunityRouter, 'post', '/:id/stage').handlers[0]).toBe(requireCanEdit);
    expect(findRoute(opportunityRouter, 'get', '/:id').handlers).toHaveLength(1);
  });
});

describe('GET /api/opportunities', () => {
  it('scopes the list to the caller and forwards owner/stage filters', async () => {
    const { res, done } = call(opportunityRouter, 'get', '/', {
      user,
      query: { owner: 'user-1', stage: 'stg-2' },
    });
    await done;

    expect(service.listOpportunities).toHaveBeenCalledWith(user, {
      owner: 'user-1',
      stage: 'stg-2',
    });
    expect(res.body).toEqual([opportunity]);
  });

  it('sends undefined filters for an empty query string', async () => {
    const { done } = call(opportunityRouter, 'get', '/', { user });
    await done;

    expect(service.listOpportunities).toHaveBeenCalledWith(user, {
      owner: undefined,
      stage: undefined,
    });
  });
});

describe('GET /api/opportunities/:id', () => {
  it('returns the opportunity for the caller', async () => {
    const { res, done } = call(opportunityRouter, 'get', '/:id', { params: { id: 'opp-1' }, user });
    await done;

    expect(service.getOpportunity).toHaveBeenCalledWith('opp-1', user);
    expect(res.body).toBe(opportunity);
  });

  it('propagates visibility failures (403) to the error handler', async () => {
    const failure = Object.assign(new Error('forbidden'), { status: 403 });
    service.getOpportunity.mockRejectedValue(failure);
    const { done } = call(opportunityRouter, 'get', '/:id', { params: { id: 'opp-9' }, user });

    await expect(done).rejects.toBe(failure);
  });
});

describe('POST /api/opportunities', () => {
  it('creates the opportunity as the acting user and answers 201', async () => {
    const body = { name: 'Globex rollout', valueMinor: 120000 };
    const { res, done } = call(opportunityRouter, 'post', '/', { body, user });
    await done;

    expect(service.createOpportunity).toHaveBeenCalledWith(body, user);
    expect(res.statusCode).toBe(201);
    expect(res.body).toBe(opportunity);
  });

  it('coerces a missing body to an empty object', async () => {
    const { done } = call(opportunityRouter, 'post', '/', { user });
    await done;

    expect(service.createOpportunity).toHaveBeenCalledWith({}, user);
  });
});

describe('PATCH /api/opportunities/:id', () => {
  it('updates the opportunity identified by the route param', async () => {
    const body = { valueMinor: 90000 };
    const { res, done } = call(opportunityRouter, 'patch', '/:id', {
      params: { id: 'opp-1' },
      body,
      user,
    });
    await done;

    expect(service.updateOpportunity).toHaveBeenCalledWith('opp-1', body, user);
    expect(res.body).toBe(opportunity);
  });

  it('coerces a missing body to an empty object', async () => {
    const { done } = call(opportunityRouter, 'patch', '/:id', { params: { id: 'opp-1' }, user });
    await done;

    expect(service.updateOpportunity).toHaveBeenCalledWith('opp-1', {}, user);
  });
});

describe('DELETE /api/opportunities/:id', () => {
  it('soft deletes the opportunity for the acting user', async () => {
    const { res, done } = call(opportunityRouter, 'delete', '/:id', {
      params: { id: 'opp-1' },
      user,
    });
    await done;

    expect(service.softDeleteOpportunity).toHaveBeenCalledWith('opp-1', user);
    expect(res.body).toEqual({ ok: true });
  });
});

describe('POST /api/opportunities/:id/stage', () => {
  it('moves the opportunity to the requested stage', async () => {
    const body = { stageId: 'stg-3' };
    const { res, done } = call(opportunityRouter, 'post', '/:id/stage', {
      params: { id: 'opp-1' },
      body,
      user,
    });
    await done;

    expect(service.moveOpportunityStage).toHaveBeenCalledWith('opp-1', body, user);
    expect(res.body).toBe(opportunity);
  });

  it('coerces a missing body to an empty object and propagates validation failures', async () => {
    const failure = new Error('Unknown stage.');
    service.moveOpportunityStage.mockRejectedValue(failure);
    const { done } = call(opportunityRouter, 'post', '/:id/stage', {
      params: { id: 'opp-1' },
      user,
    });

    await expect(done).rejects.toBe(failure);
    expect(service.moveOpportunityStage).toHaveBeenCalledWith('opp-1', {}, user);
  });
});
