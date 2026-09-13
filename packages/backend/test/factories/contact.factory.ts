// Contact builder.
import { prisma } from '../../src/db.ts';
import type { Contact, Prisma } from '../../src/generated/prisma/client.ts';
import { AUDIT_ACTOR } from './common.ts';

export async function createContact(
  overrides: Partial<Prisma.ContactUncheckedCreateInput> = {},
): Promise<Contact> {
  return prisma.contact.create({
    data: {
      firstName: overrides.firstName ?? 'Test',
      lastName:
        overrides.lastName ?? `Contact ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdBy: AUDIT_ACTOR,
      updatedBy: AUDIT_ACTOR,
      ...overrides,
    },
  });
}
