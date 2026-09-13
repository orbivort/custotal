// Interactions: timeline logging against contacts/accounts/opportunities/tasks,
// soft delete, owner-scoped reads (FR-IT-01..04), and author/manager/admin edits.
import { prisma } from '../db.ts';
import { errors } from '../lib/errors.ts';
import {
  assertNoConflict,
  INTERACTION_DIRECTIONS,
  INTERACTION_TYPES,
  optionalString,
} from '../lib/validation.ts';
import { toInteraction } from '../serializers.ts';
import type { Interaction, User } from '../types/domain.ts';

export interface InteractionListParams {
  contactId?: string;
  accountId?: string;
  opportunityId?: string;
  page?: number;
  pageSize?: number;
}

export async function listInteractions(params: InteractionListParams, user: User) {
  const page = Number.isFinite(params.page) ? Math.max(1, Math.trunc(params.page ?? 1)) : 1;
  const pageSize = Number.isFinite(params.pageSize)
    ? Math.min(100, Math.max(1, Math.trunc(params.pageSize ?? 20)))
    : 20;

  const ownerFilter =
    user.role === 'admin' || user.role === 'manager' || user.role === 'readonly'
      ? {}
      : { responsibleUserId: user.id };

  const where = {
    deletedAt: null,
    ...ownerFilter,
    ...(optionalString(params.contactId) ? { contactId: optionalString(params.contactId) } : {}),
    ...(optionalString(params.accountId) ? { accountId: optionalString(params.accountId) } : {}),
    ...(optionalString(params.opportunityId)
      ? { opportunityId: optionalString(params.opportunityId) }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.interaction.count({ where }),
    prisma.interaction.findMany({
      where,
      orderBy: { dateTime: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { items: rows.map(toInteraction), total, page, pageSize };
}

export async function createInteraction(
  body: Partial<Interaction> & { direction?: string },
  user: User,
) {
  const details: { field: string; message: string }[] = [];
  if (!optionalString(body.contactId))
    details.push({ field: 'contactId', message: 'A contact is required.' });
  const summary = optionalString(body.summary);
  if (!summary) details.push({ field: 'summary', message: 'A summary is required.' });
  if (details.length) throw errors.validation(details);

  const contactId = optionalString(body.contactId)!;
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, deletedAt: null },
    select: { id: true },
  });
  if (!contact)
    throw errors.validation([{ field: 'contactId', message: 'A contact is required.' }]);

  const type = INTERACTION_TYPES.includes(body.type as (typeof INTERACTION_TYPES)[number])
    ? (body.type as string)
    : 'note';
  const direction =
    type === 'note'
      ? null
      : INTERACTION_DIRECTIONS.includes(body.direction as (typeof INTERACTION_DIRECTIONS)[number])
        ? (body.direction as string)
        : 'outbound';
  const accountId = optionalString(body.accountId) ?? null;
  const opportunityId = optionalString(body.opportunityId) ?? null;
  const taskId = optionalString(body.taskId) ?? null;
  await assertLinkedRecords(accountId, opportunityId, taskId);

  const now = body.dateTime ? new Date(body.dateTime) : new Date();
  const row = await prisma.interaction.create({
    data: {
      type,
      dateTime: now,
      channel: optionalString(body.channel) ?? null,
      direction,
      summary: summary!,
      contactId,
      accountId,
      opportunityId,
      taskId,
      responsibleUserId: optionalString(body.responsibleUserId) ?? user.id,
      createdBy: user.id,
      updatedBy: user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  return toInteraction(row);
}

async function assertLinkedRecords(
  accountId: string | null,
  opportunityId: string | null,
  taskId: string | null,
): Promise<void> {
  if (accountId) {
    const account = await prisma.account.findFirst({
      where: { id: accountId, deletedAt: null },
      select: { id: true },
    });
    if (!account) throw errors.badRequest('validation', 'The linked account does not exist.');
  }
  if (opportunityId) {
    const opp = await prisma.opportunity.findFirst({
      where: { id: opportunityId, deletedAt: null },
      select: { id: true },
    });
    if (!opp) throw errors.badRequest('validation', 'The linked opportunity does not exist.');
  }
  if (taskId) {
    const task = await prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: { id: true },
    });
    if (!task) throw errors.badRequest('validation', 'The linked task does not exist.');
  }
}

function assertCanMutate(user: User, row: { createdBy: string; responsibleUserId: string }): void {
  if (user.role === 'admin' || user.role === 'manager') return;
  if (row.createdBy === user.id || row.responsibleUserId === user.id) return;
  throw errors.forbidden('You do not have permission to modify this interaction.');
}

export async function updateInteraction(id: string, body: Partial<Interaction>, user: User) {
  const existing = await prisma.interaction.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw errors.notFound('not_found', 'Interaction not found.');
  assertNoConflict(body.updatedAt, existing.updatedAt);
  assertCanMutate(user, existing);

  const type = INTERACTION_TYPES.includes(body.type as (typeof INTERACTION_TYPES)[number])
    ? (body.type as string)
    : existing.type;
  const direction =
    type === 'note'
      ? null
      : INTERACTION_DIRECTIONS.includes(body.direction as (typeof INTERACTION_DIRECTIONS)[number])
        ? (body.direction as string)
        : (existing.direction ?? 'outbound');

  const row = await prisma.interaction.update({
    where: { id },
    data: {
      type,
      direction,
      summary: optionalString(body.summary) ?? existing.summary,
      dateTime: body.dateTime ? new Date(body.dateTime) : existing.dateTime,
      channel: optionalString(body.channel) ?? existing.channel,
      accountId: optionalString(body.accountId) ?? existing.accountId,
      opportunityId: optionalString(body.opportunityId) ?? existing.opportunityId,
      taskId: optionalString(body.taskId) ?? existing.taskId,
      responsibleUserId: optionalString(body.responsibleUserId) ?? existing.responsibleUserId,
      updatedAt: new Date(),
      updatedBy: user.id,
    },
  });
  return toInteraction(row);
}

export async function softDeleteInteraction(id: string, user: User): Promise<void> {
  const existing = await prisma.interaction.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw errors.notFound('not_found', 'Interaction not found.');
  assertCanMutate(user, existing);
  await prisma.interaction.update({
    where: { id },
    data: { deletedAt: new Date(), updatedAt: new Date(), updatedBy: user.id },
  });
}
