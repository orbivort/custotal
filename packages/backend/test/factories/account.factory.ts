// Account builder.
import { prisma } from '../../src/db.ts';
import type { Account, Prisma } from '../../src/generated/prisma/client.ts';
import { AUDIT_ACTOR } from './common.ts';

export async function createAccount(
  overrides: Partial<Prisma.AccountUncheckedCreateInput> = {},
): Promise<Account> {
  return prisma.account.create({
    data: {
      name:
        overrides.name ?? `Test Account ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ownerId: AUDIT_ACTOR,
      createdBy: AUDIT_ACTOR,
      updatedBy: AUDIT_ACTOR,
      ...overrides,
    },
  });
}
