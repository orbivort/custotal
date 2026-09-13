import { http } from 'msw';
import type { Stage } from '../../types/domain';
import { getDB, persist } from '../db/store';
import { err, json, requireUser } from './helpers';

// Mirrors src/lib/default-stages.ts on the real backend. The mock seed already
// ships these stages, so the handler normally takes the "already present" path;
// the create branch exists so the contract matches a fresh instance.
const DEFAULT_STAGES: Stage[] = [
  { id: 's-lead', name: 'Lead', order: 0, winProbability: 10, classification: 'open' },
  { id: 's-qualified', name: 'Qualified', order: 1, winProbability: 30, classification: 'open' },
  { id: 's-proposal', name: 'Proposal', order: 2, winProbability: 50, classification: 'open' },
  {
    id: 's-negotiation',
    name: 'Negotiation',
    order: 3,
    winProbability: 75,
    classification: 'open',
  },
  { id: 's-won', name: 'Won', order: 4, winProbability: 100, classification: 'won' },
  { id: 's-lost', name: 'Lost', order: 5, winProbability: 0, classification: 'lost' },
];

export const metaHandlers = [
  http.get('/api/health', () =>
    json({
      orgName: 'Custotal',
      version: '0.1.0',
      environment: 'production',
      hostname: 'crm.custotal.local',
      allowPasswordReset: true,
      setupRequired: false,
    }),
  ),
  http.get('/api/meta', () => {
    if (!requireUser()) return err(401, 'unauthorized', 'Authentication required.');
    const db = getDB();
    return json({
      users: db.users,
      stages: db.stages,
      accounts: db.accounts.map((a) => ({ id: a.id, name: a.name, ownerId: a.ownerId })),
    });
  }),
  http.get('/api/stages', () => {
    const db = getDB();
    return json(db.stages);
  }),
  http.post('/api/stages/ensure', () => {
    if (!requireUser()) return err(401, 'unauthorized', 'Authentication required.');
    const db = getDB();
    if (db.stages.length > 0) return json({ created: false, items: db.stages });
    db.stages.push(...DEFAULT_STAGES.map((stage) => ({ ...stage })));
    persist();
    return json({ created: true, items: db.stages });
  }),
];
