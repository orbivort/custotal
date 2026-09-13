// Unit tests for the global-search API service.
//
// Only the HTTP transport (`lib/api`.api) is mocked: every test asserts the
// exact path — including the query string — that searchAll() sends, and that
// the decoded payload is returned unchanged (the endpoint has no envelope).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GlobalSearchResults } from '../../types/domain';
import { searchAll } from './searchApi';

const h = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('../../lib/api', () => ({ api: { get: h.get } }));

/** Empty result set — tests only assert request shape unless stated otherwise. */
function emptyResults(): GlobalSearchResults {
  return {
    contacts: [],
    accounts: [],
    opportunities: [],
    tasks: [],
    interactions: [],
    counts: { contacts: 0, accounts: 0, opportunities: 0, tasks: 0, interactions: 0 },
  };
}

describe('searchAll', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.get.mockResolvedValue(emptyResults());
  });

  it('requests /api/search with the term and no "all" flag by default', async () => {
    await searchAll('ada');

    expect(h.get).toHaveBeenCalledWith('/api/search?q=ada');
  });

  it('adds all=1 when the caller asks for the full result lists', async () => {
    await searchAll('ada', true);

    expect(h.get).toHaveBeenCalledWith('/api/search?q=ada&all=1');
  });

  it('omits the "all" flag when it is explicitly false', async () => {
    await searchAll('ada', false);

    expect(h.get).toHaveBeenCalledWith('/api/search?q=ada');
  });

  it('URL-encodes the term so it cannot inject extra query parameters', async () => {
    await searchAll('acme & co + partners');

    expect(h.get).toHaveBeenCalledWith('/api/search?q=acme+%26+co+%2B+partners');
  });

  it('percent-encodes non-ASCII terms', async () => {
    await searchAll('café');

    expect(h.get).toHaveBeenCalledWith('/api/search?q=caf%C3%A9');
  });

  it('sends an empty term when the caller passes one', async () => {
    await searchAll('');

    expect(h.get).toHaveBeenCalledWith('/api/search?q=');
  });

  it('returns the payload as-is (the endpoint has no envelope)', async () => {
    const payload = emptyResults();
    h.get.mockResolvedValueOnce(payload);

    await expect(searchAll('ada', true)).resolves.toBe(payload);
  });

  it('propagates request failures to the caller', async () => {
    h.get.mockRejectedValueOnce(new Error('Search is unavailable'));

    await expect(searchAll('ada', true)).rejects.toThrow('Search is unavailable');
  });
});
