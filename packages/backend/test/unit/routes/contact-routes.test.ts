// Unit tests for the contact routes (FR-CC-04). Pure unit tests: the service
// layer is mocked, Prisma is stubbed so the real auth gates load without a
// database. Covers query-string coercion, the requireUser / requireCanEdit
// gates, status codes and error propagation.
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/db.ts', () => ({
  prisma: { session: { findFirst: vi.fn(), update: vi.fn() } },
}));

vi.mock('../../../src/services/contact-service.ts', () => ({
  listContacts: vi.fn(),
  getContact: vi.fn(),
  createContact: vi.fn(),
  updateContact: vi.fn(),
  softDeleteContact: vi.fn(),
  exportContact: vi.fn(),
}));

import * as contactService from '../../../src/services/contact-service.ts';
import { requireCanEdit, requireUser } from '../../../src/middleware/auth.ts';
import { contactRouter } from '../../../src/routes/contact-routes.ts';
import { call, findRoute, routerGuards } from '../../support/mocks/router.ts';
import type { Contact, User } from '../../../src/types/domain.ts';

const service = contactService as unknown as Record<keyof typeof contactService, Mock>;

const user: User = { id: 'user-1', name: 'Alice', email: 'alice@example.com', role: 'rep' };
const contact = { id: 'con-1', firstName: 'Ada', lastName: 'Lovelace' } as unknown as Contact;
const listResult = { items: [contact], total: 1, page: 1, pageSize: 25 };

beforeEach(() => {
  vi.clearAllMocks();
  service.listContacts.mockResolvedValue(listResult);
  service.getContact.mockResolvedValue(contact);
  service.createContact.mockResolvedValue(contact);
  service.updateContact.mockResolvedValue(contact);
  service.softDeleteContact.mockResolvedValue(undefined);
  service.exportContact.mockResolvedValue({ contact });
});

describe('route guards', () => {
  it('requires an authenticated user for every contact route', () => {
    expect(routerGuards(contactRouter)).toContain(requireUser);
  });

  it('requires edit rights on the mutating routes only', () => {
    expect(findRoute(contactRouter, 'post', '/').handlers[0]).toBe(requireCanEdit);
    expect(findRoute(contactRouter, 'patch', '/:id').handlers[0]).toBe(requireCanEdit);
    expect(findRoute(contactRouter, 'delete', '/:id').handlers[0]).toBe(requireCanEdit);
    expect(findRoute(contactRouter, 'get', '/').handlers).toHaveLength(1);
    expect(findRoute(contactRouter, 'get', '/:id').handlers).toHaveLength(1);
  });
});

describe('GET /api/contacts', () => {
  it('forwards the list filters with numbers parsed from the query string', async () => {
    const { res, done } = call(contactRouter, 'get', '/', {
      query: {
        q: 'Ada',
        status: 'active',
        owner: 'u1',
        letter: 'A',
        sort: 'name',
        page: '2',
        pageSize: '10',
      },
    });
    await done;

    expect(service.listContacts).toHaveBeenCalledWith({
      q: 'Ada',
      status: 'active',
      owner: 'u1',
      letter: 'A',
      sort: 'name',
      page: 2,
      pageSize: 10,
    });
    expect(res.body).toBe(listResult);
  });

  it('leaves every filter undefined when the query string is empty', async () => {
    const { done } = call(contactRouter, 'get', '/');
    await done;

    expect(service.listContacts).toHaveBeenCalledWith({
      q: undefined,
      status: undefined,
      owner: undefined,
      letter: undefined,
      sort: undefined,
      page: undefined,
      pageSize: undefined,
    });
  });

  it('drops non-numeric pagination values', async () => {
    const { done } = call(contactRouter, 'get', '/', { query: { page: 'abc', pageSize: '' } });
    await done;

    expect(service.listContacts).toHaveBeenCalledWith(
      expect.objectContaining({ page: undefined, pageSize: undefined }),
    );
  });

  it('uses the first value when a filter is repeated', async () => {
    const { done } = call(contactRouter, 'get', '/', { query: { q: ['Ada', 'Bob'] } });
    await done;

    expect(service.listContacts).toHaveBeenCalledWith(expect.objectContaining({ q: 'Ada' }));
  });
});

describe('GET /api/contacts/:id', () => {
  it('returns the contact for the route param', async () => {
    const { res, done } = call(contactRouter, 'get', '/:id', { params: { id: 'con-1' } });
    await done;

    expect(service.getContact).toHaveBeenCalledWith('con-1');
    expect(res.body).toBe(contact);
  });

  it('propagates not-found failures to the error handler', async () => {
    const failure = new Error('Resource not found.');
    service.getContact.mockRejectedValue(failure);
    const { res, done } = call(contactRouter, 'get', '/:id', { params: { id: 'missing' } });

    await expect(done).rejects.toBe(failure);
    expect(res.body).toBeUndefined();
  });
});

describe('POST /api/contacts', () => {
  it('creates the contact as the acting user and answers 201', async () => {
    const body = { firstName: 'Ada', lastName: 'Lovelace' };
    const { res, done } = call(contactRouter, 'post', '/', { body, user });
    await done;

    expect(service.createContact).toHaveBeenCalledWith(body, user);
    expect(res.statusCode).toBe(201);
    expect(res.body).toBe(contact);
  });

  it('coerces a missing body to an empty object', async () => {
    const { done } = call(contactRouter, 'post', '/', { user });
    await done;

    expect(service.createContact).toHaveBeenCalledWith({}, user);
  });
});

describe('PATCH /api/contacts/:id', () => {
  it('updates the contact identified by the route param', async () => {
    const body = { jobTitle: 'CTO' };
    const { res, done } = call(contactRouter, 'patch', '/:id', {
      params: { id: 'con-1' },
      body,
      user,
    });
    await done;

    expect(service.updateContact).toHaveBeenCalledWith('con-1', body, user);
    expect(res.body).toBe(contact);
  });

  it('coerces a missing body to an empty object', async () => {
    const { done } = call(contactRouter, 'patch', '/:id', { params: { id: 'con-1' }, user });
    await done;

    expect(service.updateContact).toHaveBeenCalledWith('con-1', {}, user);
  });
});

describe('DELETE /api/contacts/:id', () => {
  it('soft deletes the contact and acknowledges', async () => {
    const { res, done } = call(contactRouter, 'delete', '/:id', { params: { id: 'con-1' }, user });
    await done;

    expect(service.softDeleteContact).toHaveBeenCalledWith('con-1');
    expect(res.body).toEqual({ ok: true });
  });

  it('propagates conflict failures', async () => {
    const failure = new Error('This record is still referenced by other records.');
    service.softDeleteContact.mockRejectedValue(failure);
    const { done } = call(contactRouter, 'delete', '/:id', { params: { id: 'con-1' }, user });

    await expect(done).rejects.toBe(failure);
  });
});

describe('GET /api/contacts/:id/export', () => {
  it('exports the contact payload', async () => {
    const { res, done } = call(contactRouter, 'get', '/:id/export', { params: { id: 'con-1' } });
    await done;

    expect(service.exportContact).toHaveBeenCalledWith('con-1');
    expect(res.body).toEqual({ contact });
  });
});
