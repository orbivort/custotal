// Unit tests for the accounts API service.
//
// Only the HTTP transport (`lib/api`.api) is mocked: every test asserts the
// verb, path, query string, and body a function sends, plus that the decoded
// response is returned untouched. `toQueryString` is kept real so the
// filter-serialization contract (empty values dropped, values encoded) is
// exercised end to end rather than re-implemented in a stub.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account, AccountDetailPayload, Contact, PaginatedResult } from '../../types/domain';
import {
  addAccountLink,
  createAccount,
  deleteAccount,
  getAccount,
  listAccounts,
  removeAccountLink,
  updateAccount,
} from './accountsApi';

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

const ACCOUNT: Account = {
  id: 'a1',
  name: 'Acme Corp',
  industry: 'SaaS',
  website: 'https://acme.test',
  phone: '555-0100',
  billingAddress: '1 Main St',
  ownerId: 'u1',
  notes: 'Key account',
  createdAt: '2026-01-01T00:00:00Z',
  createdBy: 'u1',
  updatedAt: '2026-01-02T00:00:00Z',
  updatedBy: 'u1',
};

const CONTACT: Contact = {
  id: 'c1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  status: 'active',
  accountLinks: [{ accountId: 'a1', primary: true, role: 'Decision maker' }],
  createdAt: '2026-01-01T00:00:00Z',
  createdBy: 'u1',
  updatedAt: '2026-01-02T00:00:00Z',
  updatedBy: 'u1',
};

const LIST: PaginatedResult<Account> = { items: [ACCOUNT], total: 1, page: 1, pageSize: 25 };

const DETAIL: AccountDetailPayload = { account: ACCOUNT, contacts: [], opportunities: [] };

describe('accountsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.get.mockResolvedValue(LIST);
    h.post.mockResolvedValue(ACCOUNT);
    h.patch.mockResolvedValue(ACCOUNT);
    h.del.mockResolvedValue({ ok: true });
  });

  describe('listAccounts', () => {
    it('serializes every filter into the query string in declaration order', async () => {
      const result = await listAccounts({
        q: 'acme',
        owner: 'u1',
        letter: 'A',
        sort: 'name_desc',
        page: 2,
        pageSize: 25,
      });

      expect(h.get).toHaveBeenCalledWith(
        '/api/accounts?q=acme&owner=u1&letter=A&sort=name_desc&page=2&pageSize=25',
      );
      expect(result).toBe(LIST);
    });

    it('omits empty and undefined filters so cleared UI state sends no param', async () => {
      await listAccounts({ q: '', owner: '', letter: undefined, sort: 'name', page: 1 });

      expect(h.get).toHaveBeenCalledWith('/api/accounts?sort=name&page=1');
    });

    it('produces a bare path when no filters are supplied', async () => {
      await listAccounts({});

      expect(h.get).toHaveBeenCalledWith('/api/accounts');
    });

    it('percent-encodes search terms containing reserved characters', async () => {
      await listAccounts({ q: 'a&b c' });

      expect(h.get).toHaveBeenCalledWith('/api/accounts?q=a%26b+c');
    });

    it('propagates transport failures to the caller', async () => {
      h.get.mockRejectedValueOnce(new Error('unreachable'));

      await expect(listAccounts({})).rejects.toThrow('unreachable');
    });
  });

  describe('getAccount', () => {
    it('requests the detail endpoint for the given id', async () => {
      h.get.mockResolvedValueOnce(DETAIL);

      const result = await getAccount('a1');

      expect(h.get).toHaveBeenCalledWith('/api/accounts/a1');
      expect(result).toBe(DETAIL);
    });

    it('still builds a path when the id is an empty string', async () => {
      h.get.mockResolvedValueOnce(DETAIL);

      await getAccount('');

      expect(h.get).toHaveBeenCalledWith('/api/accounts/');
    });
  });

  describe('createAccount', () => {
    it('posts the input to the collection endpoint and returns the account', async () => {
      const input = { name: 'Globex', industry: 'Manufacturing', ownerId: 'u2' };

      const result = await createAccount(input);

      expect(h.post).toHaveBeenCalledWith('/api/accounts', input);
      expect(result).toBe(ACCOUNT);
    });

    it('propagates validation failures from the server', async () => {
      h.post.mockRejectedValueOnce(new Error('Account name is required.'));

      await expect(createAccount({})).rejects.toThrow('Account name is required.');
    });
  });

  describe('updateAccount', () => {
    it('patches the item endpoint including the optimistic-lock token', async () => {
      const input = { name: 'Acme Corporation', updatedAt: '2026-01-02T00:00:00Z' };

      const result = await updateAccount('a1', input);

      expect(h.patch).toHaveBeenCalledWith('/api/accounts/a1', input);
      expect(result).toBe(ACCOUNT);
    });

    it('propagates conflict errors', async () => {
      h.patch.mockRejectedValueOnce(new Error('The record changed since you loaded it.'));

      await expect(updateAccount('a1', {})).rejects.toThrow(
        'The record changed since you loaded it.',
      );
    });
  });

  describe('deleteAccount', () => {
    it('deletes the item endpoint and resolves without a value', async () => {
      await expect(deleteAccount('a1')).resolves.toBeUndefined();

      expect(h.del).toHaveBeenCalledWith('/api/accounts/a1');
    });

    it('propagates permission failures', async () => {
      h.del.mockRejectedValueOnce(new Error('Forbidden'));

      await expect(deleteAccount('a1')).rejects.toThrow('Forbidden');
    });
  });

  describe('addAccountLink', () => {
    it('posts the link payload to the nested links collection', async () => {
      h.post.mockResolvedValueOnce(CONTACT);
      const input = { contactId: 'c1', primary: true, role: 'Decision maker' };

      const result = await addAccountLink('a1', input);

      expect(h.post).toHaveBeenCalledWith('/api/accounts/a1/links', input);
      expect(result).toBe(CONTACT);
    });

    it('accepts a minimal payload without primary/role', async () => {
      h.post.mockResolvedValueOnce(CONTACT);

      await addAccountLink('a1', { contactId: 'c1' });

      expect(h.post).toHaveBeenCalledWith('/api/accounts/a1/links', { contactId: 'c1' });
    });
  });

  describe('removeAccountLink', () => {
    it('deletes the nested link resource and returns the updated contact', async () => {
      h.del.mockResolvedValueOnce(CONTACT);

      const result = await removeAccountLink('a1', 'c1');

      expect(h.del).toHaveBeenCalledWith('/api/accounts/a1/links/c1');
      expect(result).toBe(CONTACT);
    });

    it('propagates failures so callers can surface a toast', async () => {
      h.del.mockRejectedValueOnce(new Error('Unlink failed'));

      await expect(removeAccountLink('a1', 'c1')).rejects.toThrow('Unlink failed');
    });
  });
});
