// Unit tests for the interaction routes (FR-CC-07). Pure unit tests: the service
// layer is mocked and Prisma is stubbed so the real auth gates load without a
// database. Covers related-entity filters, pagination coercion, the RBAC gates
// and error propagation.
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/db.ts', () => ({
  prisma: { session: { findFirst: vi.fn(), update: vi.fn() } },
}));

vi.mock('../../../src/services/interaction-service.ts', () => ({
  listInteractions: vi.fn(),
  createInteraction: vi.fn(),
  updateInteraction: vi.fn(),
  softDeleteInteraction: vi.fn(),
}));

import * as interactionService from '../../../src/services/interaction-service.ts';
import { requireCanEdit, requireUser } from '../../../src/middleware/auth.ts';
import { interactionRouter } from '../../../src/routes/interaction-routes.ts';
import { call, findRoute, routerGuards } from '../../support/mocks/router.ts';
import type { Interaction, User } from '../../../src/types/domain.ts';

const service = interactionService as unknown as Record<keyof typeof interactionService, Mock>;

const user: User = { id: 'user-1', name: 'Alice', email: 'alice@example.com', role: 'rep' };
const interaction = { id: 'int-1', summary: 'Discovery call' } as unknown as Interaction;
const listResult = { items: [interaction], total: 1, page: 1, pageSize: 25 };

beforeEach(() => {
  vi.clearAllMocks();
  service.listInteractions.mockResolvedValue(listResult);
  service.createInteraction.mockResolvedValue(interaction);
  service.updateInteraction.mockResolvedValue(interaction);
  service.softDeleteInteraction.mockResolvedValue(undefined);
});

describe('route guards', () => {
  it('requires an authenticated user for every interaction route', () => {
    expect(routerGuards(interactionRouter)).toContain(requireUser);
  });

  it('requires edit rights on the mutating routes only', () => {
    expect(findRoute(interactionRouter, 'post', '/').handlers[0]).toBe(requireCanEdit);
    expect(findRoute(interactionRouter, 'patch', '/:id').handlers[0]).toBe(requireCanEdit);
    expect(findRoute(interactionRouter, 'delete', '/:id').handlers[0]).toBe(requireCanEdit);
    expect(findRoute(interactionRouter, 'get', '/').handlers).toHaveLength(1);
  });
});

describe('GET /api/interactions', () => {
  it('forwards the related-entity filters together with the caller', async () => {
    const { res, done } = call(interactionRouter, 'get', '/', {
      user,
      query: {
        contactId: 'con-1',
        accountId: 'acc-1',
        opportunityId: 'opp-1',
        page: '2',
        pageSize: '5',
      },
    });
    await done;

    expect(service.listInteractions).toHaveBeenCalledWith(
      { contactId: 'con-1', accountId: 'acc-1', opportunityId: 'opp-1', page: 2, pageSize: 5 },
      user,
    );
    expect(res.body).toBe(listResult);
  });

  it('leaves every filter undefined for an empty query string', async () => {
    const { done } = call(interactionRouter, 'get', '/', { user });
    await done;

    expect(service.listInteractions).toHaveBeenCalledWith(
      {
        contactId: undefined,
        accountId: undefined,
        opportunityId: undefined,
        page: undefined,
        pageSize: undefined,
      },
      user,
    );
  });

  it('drops non-numeric pagination values', async () => {
    const { done } = call(interactionRouter, 'get', '/', {
      user,
      query: { page: 'one', pageSize: '' },
    });
    await done;

    expect(service.listInteractions).toHaveBeenCalledWith(
      expect.objectContaining({ page: undefined, pageSize: undefined }),
      user,
    );
  });
});

describe('POST /api/interactions', () => {
  it('logs the interaction as the acting user and answers 201', async () => {
    const body = { summary: 'Discovery call', type: 'call' };
    const { res, done } = call(interactionRouter, 'post', '/', { body, user });
    await done;

    expect(service.createInteraction).toHaveBeenCalledWith(body, user);
    expect(res.statusCode).toBe(201);
    expect(res.body).toBe(interaction);
  });

  it('coerces a missing body to an empty object', async () => {
    const { done } = call(interactionRouter, 'post', '/', { user });
    await done;

    expect(service.createInteraction).toHaveBeenCalledWith({}, user);
  });
});

describe('PATCH /api/interactions/:id', () => {
  it('updates the interaction identified by the route param', async () => {
    const body = { summary: 'Follow-up call' };
    const { res, done } = call(interactionRouter, 'patch', '/:id', {
      params: { id: 'int-1' },
      body,
      user,
    });
    await done;

    expect(service.updateInteraction).toHaveBeenCalledWith('int-1', body, user);
    expect(res.body).toBe(interaction);
  });

  it('coerces a missing body to an empty object', async () => {
    const { done } = call(interactionRouter, 'patch', '/:id', { params: { id: 'int-1' }, user });
    await done;

    expect(service.updateInteraction).toHaveBeenCalledWith('int-1', {}, user);
  });
});

describe('DELETE /api/interactions/:id', () => {
  it('soft deletes the interaction for the acting user', async () => {
    const { res, done } = call(interactionRouter, 'delete', '/:id', {
      params: { id: 'int-1' },
      user,
    });
    await done;

    expect(service.softDeleteInteraction).toHaveBeenCalledWith('int-1', user);
    expect(res.body).toEqual({ ok: true });
  });

  it('propagates not-found failures', async () => {
    const failure = new Error('Resource not found.');
    service.softDeleteInteraction.mockRejectedValue(failure);
    const { done } = call(interactionRouter, 'delete', '/:id', { params: { id: 'missing' }, user });

    await expect(done).rejects.toBe(failure);
  });
});
