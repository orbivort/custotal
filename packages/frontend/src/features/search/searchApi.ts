// Global search API: owns /api/search.
import { api } from '../../lib/api';
import type { GlobalSearchResults } from '../../types/domain';

/**
 * Searches across contacts, accounts, opportunities, tasks, and interactions.
 * `all` requests the full result lists (search page); otherwise the server
 * returns a short slice per group (top-bar dropdown).
 */
export async function searchAll(term: string, all = false): Promise<GlobalSearchResults> {
  const query = new URLSearchParams();
  query.set('q', term);
  if (all) query.set('all', '1');
  return api.get<GlobalSearchResults>(`/api/search?${query.toString()}`);
}
