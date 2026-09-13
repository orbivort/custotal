// Unit tests for the interactions API service.
//
// Only the HTTP transport (`lib/api`.api) is mocked: every test asserts the
// verb, path, query string, and body a function sends, plus that the decoded
// response is returned untouched. `toQueryString` is kept real so the
// filter-serialization contract (empty values dropped, values encoded) is
// exercised end to end rather than re-implemented in a stub.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Interaction, PaginatedResult } from '../../types/domain';
import {
  createInteraction,
  deleteInteraction,
  listInteractions,
  updateInteraction,
} from './interactionsApi';

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

const INTERACTION: Interaction = {
  id: 'i1',
  type: 'call',
  dateTime: '2026-03-04T10:30:00.000Z',
  direction: 'outbound',
  summary: 'Discussed renewal terms',
  contactId: 'c1',
  accountId: 'a1',
  responsibleUserId: 'u1',
  createdAt: '2026-03-04T10:30:00.000Z',
  createdBy: 'u1',
  updatedAt: '2026-03-05T09:00:00.000Z',
  updatedBy: 'u1',
};

const LIST: PaginatedResult<Interaction> = {
  items: [INTERACTION],
  total: 1,
  page: 1,
  pageSize: 20,
};

describe('interactionsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.get.mockResolvedValue(LIST);
    h.post.mockResolvedValue(INTERACTION);
    h.patch.mockResolvedValue(INTERACTION);
    h.del.mockResolvedValue({ ok: true });
  });

  describe('listInteractions', () => {
    it('serializes every filter into the query string in declaration order', async () => {
      const result = await listInteractions({
        contactId: 'c1',
        accountId: 'a1',
        opportunityId: 'o1',
        page: 2,
        pageSize: 20,
      });

      expect(h.get).toHaveBeenCalledWith(
        '/api/interactions?contactId=c1&accountId=a1&opportunityId=o1&page=2&pageSize=20',
      );
      expect(result).toBe(LIST);
    });

    it('omits empty and undefined filters so unrelated scopes send no param', async () => {
      await listInteractions({
        contactId: 'c1',
        accountId: '',
        opportunityId: undefined,
        pageSize: 20,
      });

      expect(h.get).toHaveBeenCalledWith('/api/interactions?contactId=c1&pageSize=20');
    });

    it('produces a bare path when no filters are supplied', async () => {
      await listInteractions({});

      expect(h.get).toHaveBeenCalledWith('/api/interactions');
    });

    it('keeps page 1 explicit when the caller requests it', async () => {
      await listInteractions({ accountId: 'a1', page: 1, pageSize: 20 });

      // `1` is a truthy number, so toQueryString keeps it (unlike 0 or '').
      expect(h.get).toHaveBeenCalledWith('/api/interactions?accountId=a1&page=1&pageSize=20');
    });

    it('percent-encodes identifiers containing reserved characters', async () => {
      await listInteractions({ contactId: 'c&1 x' });

      expect(h.get).toHaveBeenCalledWith('/api/interactions?contactId=c%261+x');
    });

    it('propagates transport failures to the caller', async () => {
      h.get.mockRejectedValueOnce(new Error('unreachable'));

      await expect(listInteractions({})).rejects.toThrow('unreachable');
    });
  });

  describe('createInteraction', () => {
    it('posts the input to the collection endpoint and returns the interaction', async () => {
      const input = {
        type: 'meeting' as const,
        direction: 'inbound' as const,
        summary: 'Kickoff call',
        contactId: 'c1',
        accountId: 'a1',
        responsibleUserId: 'u1',
      };

      const result = await createInteraction(input);

      expect(h.post).toHaveBeenCalledWith('/api/interactions', input);
      expect(result).toBe(INTERACTION);
    });

    it('posts a minimal payload without optional fields', async () => {
      await createInteraction({ summary: 'Note only', contactId: 'c1' });

      expect(h.post).toHaveBeenCalledWith('/api/interactions', {
        summary: 'Note only',
        contactId: 'c1',
      });
    });

    it('propagates validation failures from the server', async () => {
      h.post.mockRejectedValueOnce(new Error('Summary is required.'));

      await expect(createInteraction({ summary: '', contactId: 'c1' })).rejects.toThrow(
        'Summary is required.',
      );
    });
  });

  describe('updateInteraction', () => {
    it('patches the item endpoint including the optimistic-lock token', async () => {
      const input = {
        summary: 'Updated summary',
        contactId: 'c1',
        responsibleUserId: 'u2',
        updatedAt: '2026-03-05T09:00:00.000Z',
      };

      const result = await updateInteraction('i1', input);

      expect(h.patch).toHaveBeenCalledWith('/api/interactions/i1', input);
      expect(result).toBe(INTERACTION);
    });

    it('propagates 409 conflict errors so the UI can surface them', async () => {
      h.patch.mockRejectedValueOnce(new Error('The record changed since you loaded it.'));

      await expect(
        updateInteraction('i1', { summary: 'x', contactId: 'c1', updatedAt: 'stale' }),
      ).rejects.toThrow('The record changed since you loaded it.');
    });
  });

  describe('deleteInteraction', () => {
    it('deletes the item endpoint and resolves without a value', async () => {
      await expect(deleteInteraction('i1')).resolves.toBeUndefined();

      expect(h.del).toHaveBeenCalledWith('/api/interactions/i1');
    });

    it('propagates permission failures', async () => {
      h.del.mockRejectedValueOnce(new Error('Forbidden'));

      await expect(deleteInteraction('i1')).rejects.toThrow('Forbidden');
    });
  });
});
