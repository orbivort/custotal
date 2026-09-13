// Unit tests for the account routes (FR-CC-05) including the
// contact <-> account link endpoints. Pure unit tests: the service layer is
// mocked and Prisma is stubbed so the real auth gates load without a database.
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/db.ts', () => ({
  prisma: { session: { findFirst: vi.fn(), update: vi.fn() } },
}));

vi.mock('../../../src/services/account-service.ts', () => ({
  listAccounts: vi.fn(),
  getAccount: vi.fn(),
  createAccount: vi.fn(),
  updateAccount: vi.fn(),
  softDeleteAccount: vi.fn(),
  addAccountLink: vi.fn(),
  removeAccountLink: vi.fn(),
}));

import * as accountService from '../../../src/services/account-service.ts';
import { requireCanEdit, requireUser } from '../../../src/middleware/auth.ts';
import { accountRouter } from '../../../src/routes/account-routes.ts';
import { call, findRoute, routerGuards } from '../../support/mocks/router.ts';
import type { Account, Contact, User } from '../../../src/types/domain.ts';

const service = accountService as unknown as Record<keyof typeof accountService, Mock>;

const user: User = { id: 'user-1', name: 'Alice', email: 'alice@example.com', role: 'manager' };
const account = { id: 'acc-1', name: 'Globex' } as unknown as Account;
const contact = { id: 'con-1', firstName: 'Ada' } as unknown as Contact;
const listResult = { items: [account], total: 1, page: 1, pageSize: 25 };

beforeEach(() => {
  vi.clearAllMocks();
  service.listAccounts.mockResolvedValue(listResult);
  service.getAccount.mockResolvedValue(account);
  service.createAccount.mockResolvedValue(account);
  service.updateAccount.mockResolvedValue(account);
  service.softDeleteAccount.mockResolvedValue(undefined);
  service.addAccountLink.mockResolvedValue(contact);
  service.removeAccountLink.mockResolvedValue(contact);
});

describe('route guards', () => {
  it('requires an authenticated user for every account route', () => {
    expect(routerGuards(accountRouter)).toContain(requireUser);
  });

  it('requires edit rights on every mutating route', () => {
    const mutating: [string, string][] = [
      ['post', '/'],
      ['patch', '/:id'],
      ['delete', '/:id'],
      ['post', '/:id/links'],
      ['delete', '/:id/links/:contactId'],
    ];
    for (const [method, path] of mutating) {
      expect(findRoute(accountRouter, method, path).handlers[0]).toBe(requireCanEdit);
    }
  });
});

describe('GET /api/accounts', () => {
  it('forwards filters and parses pagination numbers', async () => {
    const { res, done } = call(accountRouter, 'get', '/', {
      query: { q: 'Globex', owner: 'u1', letter: 'G', sort: 'name', page: '3', pageSize: '50' },
    });
    await done;

    expect(service.listAccounts).toHaveBeenCalledWith({
      q: 'Globex',
      owner: 'u1',
      letter: 'G',
      sort: 'name',
      page: 3,
      pageSize: 50,
    });
    expect(res.body).toBe(listResult);
  });

  it('leaves every filter undefined for an empty query string', async () => {
    const { done } = call(accountRouter, 'get', '/');
    await done;

    expect(service.listAccounts).toHaveBeenCalledWith({
      q: undefined,
      owner: undefined,
      letter: undefined,
      sort: undefined,
      page: undefined,
      pageSize: undefined,
    });
  });

  it('drops non-numeric pagination values', async () => {
    const { done } = call(accountRouter, 'get', '/', { query: { page: 'x', pageSize: 'many' } });
    await done;

    expect(service.listAccounts).toHaveBeenCalledWith(
      expect.objectContaining({ page: undefined, pageSize: undefined }),
    );
  });
});

describe('GET /api/accounts/:id', () => {
  it('returns the account for the route param', async () => {
    const { res, done } = call(accountRouter, 'get', '/:id', { params: { id: 'acc-1' } });
    await done;

    expect(service.getAccount).toHaveBeenCalledWith('acc-1');
    expect(res.body).toBe(account);
  });

  it('propagates not-found failures', async () => {
    const failure = new Error('Resource not found.');
    service.getAccount.mockRejectedValue(failure);
    const { done } = call(accountRouter, 'get', '/:id', { params: { id: 'missing' } });

    await expect(done).rejects.toBe(failure);
  });
});

describe('POST /api/accounts', () => {
  it('creates the account as the acting user and answers 201', async () => {
    const body = { name: 'Globex', industry: 'Software' };
    const { res, done } = call(accountRouter, 'post', '/', { body, user });
    await done;

    expect(service.createAccount).toHaveBeenCalledWith(body, user);
    expect(res.statusCode).toBe(201);
    expect(res.body).toBe(account);
  });

  it('coerces a missing body to an empty object', async () => {
    const { done } = call(accountRouter, 'post', '/', { user });
    await done;

    expect(service.createAccount).toHaveBeenCalledWith({}, user);
  });
});

describe('PATCH /api/accounts/:id', () => {
  it('updates the account identified by the route param', async () => {
    const body = { industry: 'Hardware' };
    const { res, done } = call(accountRouter, 'patch', '/:id', {
      params: { id: 'acc-1' },
      body,
      user,
    });
    await done;

    expect(service.updateAccount).toHaveBeenCalledWith('acc-1', body, user);
    expect(res.body).toBe(account);
  });

  it('coerces a missing body to an empty object', async () => {
    const { done } = call(accountRouter, 'patch', '/:id', { params: { id: 'acc-1' }, user });
    await done;

    expect(service.updateAccount).toHaveBeenCalledWith('acc-1', {}, user);
  });
});

describe('DELETE /api/accounts/:id', () => {
  it('soft deletes the account and acknowledges', async () => {
    const { res, done } = call(accountRouter, 'delete', '/:id', { params: { id: 'acc-1' }, user });
    await done;

    expect(service.softDeleteAccount).toHaveBeenCalledWith('acc-1');
    expect(res.body).toEqual({ ok: true });
  });
});

describe('account links', () => {
  it('adds a link and returns the updated contact', async () => {
    const body = { contactId: 'con-1', primary: true, role: 'employee' };
    const { res, done } = call(accountRouter, 'post', '/:id/links', {
      params: { id: 'acc-1' },
      body,
      user,
    });
    await done;

    expect(service.addAccountLink).toHaveBeenCalledWith('acc-1', body, user);
    expect(res.body).toBe(contact);
  });

  it('coerces a missing link body to an empty object', async () => {
    const { done } = call(accountRouter, 'post', '/:id/links', { params: { id: 'acc-1' }, user });
    await done;

    expect(service.addAccountLink).toHaveBeenCalledWith('acc-1', {}, user);
  });

  it('removes the link identified by account and contact', async () => {
    const { res, done } = call(accountRouter, 'delete', '/:id/links/:contactId', {
      params: { id: 'acc-1', contactId: 'con-1' },
      user,
    });
    await done;

    expect(service.removeAccountLink).toHaveBeenCalledWith('acc-1', 'con-1', user);
    expect(res.body).toBe(contact);
  });

  it('propagates link failures to the error handler', async () => {
    const failure = new Error('Resource not found.');
    service.addAccountLink.mockRejectedValue(failure);
    const { done } = call(accountRouter, 'post', '/:id/links', {
      params: { id: 'acc-1' },
      body: {},
      user,
    });

    await expect(done).rejects.toBe(failure);
  });
});
