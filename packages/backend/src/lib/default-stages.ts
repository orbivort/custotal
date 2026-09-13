// Default sales-pipeline stages.
//
// These are the values the "Stage" dropdown is populated with. They live here so
// a deployment bootstrapped without any data (`db:migrate:deploy` +
// `db:create-admin`) still gets a working pipeline the first time a user opens
// the New Deal form or the Pipeline Stages view. `ensureDefaultStages`
// (src/services/stage-service.ts) provisions them idempotently; the backend test
// fixture (test/fixtures/demo-workspace.ts) reuses the same definitions.
import type { StageClassification } from '../types/domain.ts';

// Stable ids so the development seed and the integration tests can reference the
// provisioned rows without depending on DB-generated uuid values.
export const STAGE_IDS = {
  lead: '20000000-0000-4000-8000-000000000001',
  qualified: '20000000-0000-4000-8000-000000000002',
  proposal: '20000000-0000-4000-8000-000000000003',
  negotiation: '20000000-0000-4000-8000-000000000004',
  won: '20000000-0000-4000-8000-000000000005',
  lost: '20000000-0000-4000-8000-000000000006',
} as const;

export interface DefaultStage {
  id: string;
  name: string;
  order: number;
  winProbability: number;
  classification: StageClassification;
}

export const DEFAULT_STAGES: readonly DefaultStage[] = [
  { id: STAGE_IDS.lead, name: 'Lead', order: 0, winProbability: 10, classification: 'open' },
  {
    id: STAGE_IDS.qualified,
    name: 'Qualified',
    order: 1,
    winProbability: 30,
    classification: 'open',
  },
  {
    id: STAGE_IDS.proposal,
    name: 'Proposal',
    order: 2,
    winProbability: 50,
    classification: 'open',
  },
  {
    id: STAGE_IDS.negotiation,
    name: 'Negotiation',
    order: 3,
    winProbability: 75,
    classification: 'open',
  },
  { id: STAGE_IDS.won, name: 'Won', order: 4, winProbability: 100, classification: 'won' },
  { id: STAGE_IDS.lost, name: 'Lost', order: 5, winProbability: 0, classification: 'lost' },
];
