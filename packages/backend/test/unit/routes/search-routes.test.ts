// Unit tests for the /api/search transport layer (FR-CC-03).
// Pure unit tests: the search service is mocked at the module boundary and the
// Prisma singleton is stubbed, so importing the real auth middleware never opens
// a database connection and no HTTP server is started. Covers route wiring, the
// requireUser / authedUser gate, query parsing (`q` term and `all` flag), the
// JSON response shape, and error propagation from the service.
import type { NextFunction, Request, Response } from 'express';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/db.ts', () => ({
  prisma: { session: { findFirst: vi.fn(), update: vi.fn() } },
}));

vi.mock('../../../src/services/search-service.ts', () => ({
  searchAll: vi.fn(),
}));

import { searchRouter } from '../../../src/routes/search-routes.ts';
import { searchAll } from '../../../src/services/search-service.ts';
import { ApiError } from '../../../src/lib/errors.ts';
import { mockReq, mockRes } from '../../support/mocks/express.ts';
import type { SearchResults, User } from '../../../src/types/domain.ts';

const searchAllMock = searchAll as unknown as Mock;

/** Structural view of an express route layer; avoids importing router internals. */
type RouteLayer = {
  route?: {
    path: string;
    stack: { handle: (req: Request, res: Response, next: NextFunction) => unknown }[];
  };
};

function routeStack() {
  const layer = searchRouter.stack[0] as unknown as RouteLayer;
  const route = layer.route;
  if (!route) throw new Error('searchRouter no longer registers a GET route');
  return route;
}

const [authGate, searchHandler] = routeStack().stack.map((layer) => layer.handle);

const user: User = { id: 'user-1', name: 'Alice', email: 'alice@example.com', role: 'rep' };

const results: SearchResults = {
  contacts: [],
  accounts: [],
  opportunities: [],
  tasks: [],
  interactions: [],
  counts: { contacts: 3, accounts: 1, opportunities: 2, tasks: 4, interactions: 0 },
};

/** Drive the route handler directly with a hand-rolled req/res pair. `null` means unauthenticated. */
function invoke(query: Record<string, unknown>, currentUser: User | null = user) {
  const req = mockReq({ query, user: currentUser ?? undefined } as unknown as Partial<Request>);
  const res = mockRes();
  const next = vi.fn() as unknown as NextFunction;
  const done = searchHandler(req, res as unknown as Response, next) as Promise<void>;
  return { req, res, next, done };
}

beforeEach(() => {
  vi.clearAllMocks();
  searchAllMock.mockResolvedValue(results);
});

describe('route registration', () => {
  it('registers a single GET layer on "/" guarded by requireUser', () => {
    const route = routeStack();
    expect(route.path).toBe('/');
    expect(route.stack).toHaveLength(2);
    expect(route.stack[0]?.handle).toBe(authGate);
    expect(route.stack[1]?.handle).toBe(searchHandler);
  });
});

describe('requireUser gate', () => {
  it('continues to the handler for an authenticated request', () => {
    const req = mockReq({ user } as unknown as Partial<Request>);
    const next = vi.fn() as unknown as NextFunction;

    authGate(req, mockRes() as unknown as Response, next);

    const nextMock = next as unknown as Mock;
    expect(nextMock).toHaveBeenCalledTimes(1);
    expect(nextMock).toHaveBeenCalledWith();
  });

  it('rejects an anonymous request with 401 and never calls the service', () => {
    const req = mockReq({ user: undefined } as unknown as Partial<Request>);
    const next = vi.fn() as unknown as NextFunction;

    authGate(req, mockRes() as unknown as Response, next);

    const error = (next as unknown as Mock).mock.calls[0][0] as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(401);
    expect(error.code).toBe('unauthorized');
    expect(searchAllMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/search query handling', () => {
  it('searches with the q term and the default per-group preview (all=false)', async () => {
    const { res, done } = invoke({ q: 'Ada' });
    await done;

    expect(searchAllMock).toHaveBeenCalledTimes(1);
    expect(searchAllMock).toHaveBeenCalledWith(user, 'Ada', false);
    expect(res.body).toBe(results);
  });

  it('requests full result sets when all=1', async () => {
    const { done } = invoke({ q: 'Globex', all: '1' });
    await done;

    expect(searchAllMock).toHaveBeenCalledWith(user, 'Globex', true);
  });

  it('requests full result sets when all=true', async () => {
    const { done } = invoke({ q: 'Globex', all: 'true' });
    await done;

    expect(searchAllMock).toHaveBeenCalledWith(user, 'Globex', true);
  });

  it.each(['0', 'yes', 'TRUE', ''])('treats all=%j as false (preview mode)', async (all) => {
    const { done } = invoke({ q: 'Globex', all });
    await done;

    expect(searchAllMock).toHaveBeenCalledWith(user, 'Globex', false);
  });

  it('treats a repeated all parameter as false', async () => {
    const { done } = invoke({ q: 'Globex', all: ['1', 'true'] });
    await done;

    expect(searchAllMock).toHaveBeenCalledWith(user, 'Globex', false);
  });

  it('defaults to an empty term when q is missing', async () => {
    const { done } = invoke({});
    await done;

    expect(searchAllMock).toHaveBeenCalledWith(user, '', false);
  });

  it('defaults to an empty term when q is not a string', async () => {
    const { done } = invoke({ q: ['Ada', 'Globex'] });
    await done;

    expect(searchAllMock).toHaveBeenCalledWith(user, '', false);
  });

  it('passes the term through verbatim — trimming and casing belong to the service', async () => {
    const { done } = invoke({ q: '  ADA Lovelace  ' });
    await done;

    expect(searchAllMock).toHaveBeenCalledWith(user, '  ADA Lovelace  ', false);
  });

  it('responds with the service payload as JSON', async () => {
    const { res, done } = invoke({ q: 'Ada' });
    await done;

    expect(res.body).toEqual(results);
    expect(res.statusCode).toBe(0); // handler never sets a status: success is 200
  });
});

describe('GET /api/search failure paths', () => {
  it('rejects with 401 when no user is attached (authedUser guard)', async () => {
    const { res, done } = invoke({ q: 'Ada' }, null);
    const error = (await done.then(
      () => undefined,
      (reason: unknown) => reason,
    )) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(401);
    expect(error.code).toBe('unauthorized');
    expect(searchAllMock).not.toHaveBeenCalled();
    expect(res.body).toBeUndefined();
  });

  it('propagates service failures to the express error handler', async () => {
    const failure = new Error('database unavailable');
    searchAllMock.mockRejectedValue(failure);
    const { res, done } = invoke({ q: 'Ada' });

    await expect(done).rejects.toBe(failure);
    expect(res.body).toBeUndefined();
  });
});
