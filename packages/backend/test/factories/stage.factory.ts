// Stage builder. Real rows (Opportunity.stageId is an FK); stage names are
// unique in the schema, so defaults embed a unique suffix.
import { prisma } from '../../src/db.ts';
import type { Stage } from '../../src/generated/prisma/client.ts';

export interface CreateStageOptions {
  name?: string;
  order?: number;
  winProbability?: number;
  classification?: 'open' | 'won' | 'lost';
}

export async function createStage(options: CreateStageOptions = {}): Promise<Stage> {
  const classification = options.classification ?? 'open';
  const defaultProbability = classification === 'won' ? 100 : classification === 'lost' ? 0 : 50;
  return prisma.stage.create({
    data: {
      name: options.name ?? `Stage ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      order: options.order ?? 0,
      winProbability: options.winProbability ?? defaultProbability,
      classification,
    },
  });
}
