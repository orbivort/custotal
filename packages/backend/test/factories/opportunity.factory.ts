// Opportunity builder. accountId and stageId are real FKs, so defaults create
// them on demand; contactId stays optional and must be a real Contact when set.
import { prisma } from '../../src/db.ts';
import type { Opportunity, Prisma } from '../../src/generated/prisma/client.ts';
import { AUDIT_ACTOR } from './common.ts';
import { createAccount } from './account.factory.ts';
import { createStage } from './stage.factory.ts';

export async function createOpportunity(
  overrides: Partial<Prisma.OpportunityUncheckedCreateInput> = {},
): Promise<Opportunity> {
  const accountId = overrides.accountId ?? (await createAccount()).id;
  const stageId = overrides.stageId ?? (await createStage()).id;
  return prisma.opportunity.create({
    data: {
      name: overrides.name ?? `Test Deal ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      accountId,
      stageId,
      valueMinor: 100_000,
      currency: 'USD',
      expectedCloseDate: new Date(Date.now() + 30 * 86_400_000),
      probability: 50,
      ownerId: AUDIT_ACTOR,
      createdBy: AUDIT_ACTOR,
      updatedBy: AUDIT_ACTOR,
      ...overrides,
    },
  });
}
