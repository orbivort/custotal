// Unit tests for the contacts API service.
//
// Only the HTTP transport (`lib/api`.api) is mocked: every test asserts the
// verb, path, query string, and body a function sends, plus that the decoded
// response is returned untouched. `toQueryString` is kept real so the
// filter-serialization contract (empty values dropped, values encoded) is
// exercised end to end rather than re-implemented in a stub.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Contact, ContactExportPayload, PaginatedResult } from '../../types/domain';
import {
  createContact,
  deleteContact,
  exportContact,
  getContact,
  listContacts,
  updateContact,
  type ContactInput,
} from './contactsApi';

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

const CONTACT: Contact = {
  id: 'c1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  phone: '555-0100',
  status: 'active',
  accountLinks: [{ accountId: 'a1', primary: true, role: 'Decision maker' }],
  createdAt: '2026-01-01T00:00:00Z',
  createdBy: 'u1',
  updatedAt: '2026-01-02T00:00:00Z',
  updatedBy: 'u1',
};

const LIST: PaginatedResult<Contact> = { items: [CONTACT], total: 1, page: 1, pageSize: 25 };

const EXPORT_PAYLOAD: ContactExportPayload = {
  contact: CONTACT,
  interactions: [],
  opportunities: [],
  tasks: [],
};

describe('contactsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.get.mockResolvedValue(LIST);
    h.post.mockResolvedValue(CONTACT);
    h.patch.mockResolvedValue(CONTACT);
    h.del.mockResolvedValue({ ok: true });
  });

  describe('listContacts', () => {
    it('serializes every filter into the query string in declaration order', async () => {
      const result = await listContacts({
        q: 'ada',
        status: 'active',
        owner: 'u1',
        letter: 'L',
        sort: 'updated_desc',
        page: 2,
        pageSize: 25,
      });

      expect(h.get).toHaveBeenCalledWith(
        '/api/contacts?q=ada&status=active&owner=u1&letter=L&sort=updated_desc&page=2&pageSize=25',
      );
      expect(result).toBe(LIST);
    });

    it('omits empty and undefined filters so cleared UI state sends no param', async () => {
      await listContacts({
        q: '',
        status: '',
        owner: '',
        letter: undefined,
        sort: 'name',
        page: 1,
      });

      expect(h.get).toHaveBeenCalledWith('/api/contacts?sort=name&page=1');
    });

    it('produces a bare path when no filters are supplied', async () => {
      await listContacts({});

      expect(h.get).toHaveBeenCalledWith('/api/contacts');
    });

    it('sends an explicit page size but no page when exporting', async () => {
      await listContacts({ pageSize: 10000 });

      expect(h.get).toHaveBeenCalledWith('/api/contacts?pageSize=10000');
    });

    it('percent-encodes search terms containing reserved characters', async () => {
      await listContacts({ q: 'ada & grace' });

      expect(h.get).toHaveBeenCalledWith('/api/contacts?q=ada+%26+grace');
    });

    it('propagates transport failures to the caller', async () => {
      h.get.mockRejectedValueOnce(new Error('unreachable'));

      await expect(listContacts({})).rejects.toThrow('unreachable');
    });
  });

  describe('getContact', () => {
    it('requests the item endpoint for the given id', async () => {
      h.get.mockResolvedValueOnce(CONTACT);

      const result = await getContact('c1');

      expect(h.get).toHaveBeenCalledWith('/api/contacts/c1');
      expect(result).toBe(CONTACT);
    });

    it('still builds a path when the id is an empty string', async () => {
      h.get.mockResolvedValueOnce(CONTACT);

      await getContact('');

      expect(h.get).toHaveBeenCalledWith('/api/contacts/');
    });
  });

  describe('createContact', () => {
    it('posts the input to the collection endpoint and returns the contact', async () => {
      const input: ContactInput = {
        firstName: 'Grace',
        lastName: 'Hopper',
        email: 'grace@example.com',
        accountLinks: [{ accountId: 'a1', primary: true, role: 'Champion' }],
      };

      const result = await createContact(input);

      expect(h.post).toHaveBeenCalledWith('/api/contacts', input);
      expect(result).toBe(CONTACT);
    });

    it('posts a minimal payload with only the required names', async () => {
      const input: ContactInput = { firstName: 'Alan', lastName: 'Turing' };

      await createContact(input);

      expect(h.post).toHaveBeenCalledWith('/api/contacts', {
        firstName: 'Alan',
        lastName: 'Turing',
      });
    });

    it('propagates validation failures from the server', async () => {
      h.post.mockRejectedValueOnce(new Error('At least one of email or phone is required.'));

      await expect(createContact({ firstName: 'Ada' })).rejects.toThrow(
        'At least one of email or phone is required.',
      );
    });
  });

  describe('updateContact', () => {
    it('patches the item endpoint including the optimistic-lock token', async () => {
      const input = { firstName: 'Ada', updatedAt: '2026-01-02T00:00:00Z' };

      const result = await updateContact('c1', input);

      expect(h.patch).toHaveBeenCalledWith('/api/contacts/c1', input);
      expect(result).toBe(CONTACT);
    });

    it('patches without the token when the caller omits it', async () => {
      const input = { status: 'inactive' as const };

      await updateContact('c1', input);

      expect(h.patch).toHaveBeenCalledWith('/api/contacts/c1', { status: 'inactive' });
    });

    it('propagates conflict errors', async () => {
      h.patch.mockRejectedValueOnce(new Error('The record changed since you loaded it.'));

      await expect(updateContact('c1', {})).rejects.toThrow(
        'The record changed since you loaded it.',
      );
    });
  });

  describe('deleteContact', () => {
    it('deletes the item endpoint and resolves without a value', async () => {
      await expect(deleteContact('c1')).resolves.toBeUndefined();

      expect(h.del).toHaveBeenCalledWith('/api/contacts/c1');
    });

    it('propagates permission failures', async () => {
      h.del.mockRejectedValueOnce(new Error('Forbidden'));

      await expect(deleteContact('c1')).rejects.toThrow('Forbidden');
    });
  });

  describe('exportContact', () => {
    it('requests the nested export endpoint and returns the full payload', async () => {
      h.get.mockResolvedValueOnce(EXPORT_PAYLOAD);

      const result = await exportContact('c1');

      expect(h.get).toHaveBeenCalledWith('/api/contacts/c1/export');
      expect(result).toBe(EXPORT_PAYLOAD);
    });

    it('propagates failures so the page can show a toast', async () => {
      h.get.mockRejectedValueOnce(new Error('Export unavailable'));

      await expect(exportContact('c1')).rejects.toThrow('Export unavailable');
    });
  });
});
