import { http } from 'msw';
import type { SearchCounts } from '../../types/domain';
import { getDB } from '../db/store';
import { canViewOwnerScoped, err, json, requireUser } from './helpers';

function matches(term: string, ...parts: (string | undefined)[]): boolean {
  return parts.some((p) => (p ?? '').toLowerCase().includes(term));
}

export const searchHandlers = [
  http.get('/api/search', ({ request }) => {
    const user = requireUser();
    if (!user) return err(401, 'unauthorized', 'Authentication required.');
    const params = new URL(request.url).searchParams;
    const term = (params.get('q') ?? '').trim().toLowerCase();
    const all = params.get('all') === '1';
    const limit = all ? 30 : 5;
    const empty = { contacts: [], accounts: [], opportunities: [], tasks: [], interactions: [] };

    if (!term) {
      return json({
        ...empty,
        counts: { contacts: 0, accounts: 0, opportunities: 0, tasks: 0, interactions: 0 },
      });
    }

    const db = getDB();

    const contactHits = db.contacts.filter(
      (c) =>
        !c.deletedAt &&
        matches(term, `${c.firstName} ${c.lastName}`, c.email, c.company, c.jobTitle),
    );
    const accountHits = db.accounts.filter(
      (a) => !a.deletedAt && matches(term, a.name, a.industry, a.website),
    );
    const opportunityHits = db.opportunities.filter(
      (o) => canViewOwnerScoped(user, o.ownerId) && matches(term, o.name, o.description),
    );
    const taskHits = db.tasks.filter(
      (t) => canViewOwnerScoped(user, t.assigneeId) && matches(term, t.title, t.description),
    );
    const interactionHits = db.interactions.filter(
      (i) =>
        !i.deletedAt && canViewOwnerScoped(user, i.responsibleUserId) && matches(term, i.summary),
    );

    const counts: SearchCounts = {
      contacts: contactHits.length,
      accounts: accountHits.length,
      opportunities: opportunityHits.length,
      tasks: taskHits.length,
      interactions: interactionHits.length,
    };

    return json({
      contacts: contactHits.slice(0, limit),
      accounts: accountHits.slice(0, limit),
      opportunities: opportunityHits.slice(0, limit),
      tasks: taskHits.slice(0, limit),
      interactions: interactionHits.slice(0, limit),
      counts,
    });
  }),
];
