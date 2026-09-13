// Unit tests for the shared bootstrap metadata API service.
//
// Only the HTTP transport (`lib/api`.api) is mocked: every test asserts the
// verb and path a function requests, plus that the decoded payload is returned
// unchanged (both /api/meta and /api/stages are un-enveloped responses).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Stage, User } from '../../types/domain';
import {
  ensureStages,
  fetchMeta,
  fetchStages,
  type AccountMeta,
  type EnsureStagesResult,
  type MetaPayload,
} from './metaApi';

const h = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('../../lib/api', () => ({ api: { get: h.get, post: h.post } }));

const USERS: User[] = [
  { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin' },
  { id: 'u2', name: 'Ben Smith', email: 'ben@example.com', role: 'rep' },
];

const STAGES: Stage[] = [
  { id: 's1', name: 'Qualified', order: 1, winProbability: 20, classification: 'open' },
  { id: 's2', name: 'Won', order: 2, winProbability: 100, classification: 'won' },
];

const ACCOUNTS: AccountMeta[] = [
  { id: 'a1', name: 'Acme Corp', ownerId: 'u1' },
  { id: 'a2', name: 'Globex', ownerId: 'u2' },
];

const PAYLOAD: MetaPayload = { users: USERS, stages: STAGES, accounts: ACCOUNTS };

describe('metaApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.get.mockResolvedValue({});
  });

  describe('fetchMeta', () => {
    it('gets /api/meta and returns the payload unchanged', async () => {
      h.get.mockResolvedValueOnce(PAYLOAD);

      const result = await fetchMeta();

      expect(h.get).toHaveBeenCalledWith('/api/meta');
      expect(h.get).toHaveBeenCalledTimes(1);
      expect(result).toBe(PAYLOAD);
    });

    it('returns empty collections when the instance has no metadata yet', async () => {
      const empty: MetaPayload = { users: [], stages: [], accounts: [] };
      h.get.mockResolvedValueOnce(empty);

      const result = await fetchMeta();

      expect(result).toBe(empty);
      expect(result.users).toEqual([]);
      expect(result.stages).toEqual([]);
      expect(result.accounts).toEqual([]);
    });

    it('propagates failures so callers surface the bootstrap error', async () => {
      h.get.mockRejectedValueOnce(new Error("Can't reach the server."));

      await expect(fetchMeta()).rejects.toThrow("Can't reach the server.");
    });
  });

  describe('fetchStages', () => {
    it('gets /api/stages and returns the stage array', async () => {
      h.get.mockResolvedValueOnce(STAGES);

      const result = await fetchStages();

      expect(h.get).toHaveBeenCalledWith('/api/stages');
      expect(h.get).toHaveBeenCalledTimes(1);
      expect(result).toBe(STAGES);
    });

    it('returns an empty array when no stages are configured', async () => {
      const empty: Stage[] = [];
      h.get.mockResolvedValueOnce(empty);

      const result = await fetchStages();

      expect(result).toBe(empty);
      expect(result).toHaveLength(0);
    });

    it('propagates failures to the caller', async () => {
      h.get.mockRejectedValueOnce(new Error('Not signed in'));

      await expect(fetchStages()).rejects.toThrow('Not signed in');
    });
  });

  describe('ensureStages', () => {
    it('posts /api/stages/ensure and returns the provisioning outcome', async () => {
      const result: EnsureStagesResult = { created: true, items: STAGES };
      h.post.mockResolvedValueOnce(result);

      const outcome = await ensureStages();

      expect(h.post).toHaveBeenCalledWith('/api/stages/ensure');
      expect(h.post).toHaveBeenCalledTimes(1);
      expect(outcome).toBe(result);
    });

    it('reports an existing pipeline without creating one', async () => {
      const result: EnsureStagesResult = { created: false, items: STAGES };
      h.post.mockResolvedValueOnce(result);

      const outcome = await ensureStages();

      expect(outcome).toBe(result);
      expect(outcome.created).toBe(false);
    });

    it('propagates failures to the caller', async () => {
      h.post.mockRejectedValueOnce(new Error('Not signed in'));

      await expect(ensureStages()).rejects.toThrow('Not signed in');
    });
  });
});
