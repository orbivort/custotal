// Task builder. assigneeId is a plain uuid audit reference (no FK).
import { prisma } from '../../src/db.ts';
import type { Task, Prisma } from '../../src/generated/prisma/client.ts';
import { AUDIT_ACTOR } from './common.ts';

export async function createTask(
  overrides: Partial<Prisma.TaskUncheckedCreateInput> = {},
): Promise<Task> {
  return prisma.task.create({
    data: {
      title: overrides.title ?? `Test Task ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      priority: 'medium',
      status: 'open',
      assigneeId: AUDIT_ACTOR,
      createdBy: AUDIT_ACTOR,
      updatedBy: AUDIT_ACTOR,
      ...overrides,
    },
  });
}
