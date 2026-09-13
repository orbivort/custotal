// Opportunities: CRUD, owner-scoped visibility, Kanban stage transitions with the
// probability rule (FR-SP-04), stage history (FR-SP-05), and soft delete (FR-CC-05).
import { prisma } from '../db.ts';
import { errors } from '../lib/errors.ts';
import { assertNoConflict, optionalString } from '../lib/validation.ts';
import { parseDateOnly, todayUtcDate } from '../lib/time.ts';
import { toOpportunity, toStageHistory } from '../serializers.ts';
import type { User } from '../types/domain.ts';

export interface OpportunityListParams {
  owner?: string;
  stage?: string;
}

/** admin / manager / readonly see everything; reps only their own (FR-CC-02). */
function scopedWhere(user: User, extra: Record<string, unknown> = {}) {
  if (user.role === 'admin' || user.role === 'manager' || user.role === 'readonly') {
    const owner = optionalString((extra as { owner?: string }).owner);
    return { deletedAt: null, ...(owner ? { ownerId: owner } : {}), ...omitOwner(extra) };
  }
  return { deletedAt: null, ownerId: user.id, ...omitOwner(extra) };
}

function omitOwner(extra: Record<string, unknown>): Record<string, unknown> {
  const { owner: _owner, ...rest } = extra;
  return rest;
}

export async function listOpportunities(user: User, params: OpportunityListParams) {
  const stage = optionalString(params.stage);
  const where = scopedWhere(user, { owner: params.owner, ...(stage ? { stageId: stage } : {}) });
  const [items, total] = await Promise.all([
    prisma.opportunity.findMany({ where, orderBy: { updatedAt: 'desc' } }),
    prisma.opportunity.count({ where }),
  ]);
  return { items: items.map(toOpportunity), total };
}

export async function getOpportunity(id: string, user: User) {
  const row = await prisma.opportunity.findFirst({ where: { id, deletedAt: null } });
  if (!row || !(await canViewOpportunity(user, row.ownerId))) {
    throw errors.notFound('not_found', 'Opportunity not found.');
  }
  const history = await prisma.stageHistory.findMany({
    where: { opportunityId: id },
    orderBy: { timestamp: 'desc' },
  });
  return { ...toOpportunity(row), history: history.map(toStageHistory) };
}

export async function canViewOpportunity(user: User, ownerId: string): Promise<boolean> {
  if (user.role === 'admin' || user.role === 'manager' || user.role === 'readonly') return true;
  return ownerId === user.id;
}

function assertCanMutate(user: User, ownerId: string): void {
  if (user.role === 'admin' || user.role === 'manager') return;
  if (ownerId === user.id) return;
  throw errors.forbidden('You do not have permission to modify this opportunity.');
}

async function defaultOpenStageId(): Promise<string | null> {
  const stage = await prisma.stage.findFirst({
    where: { classification: 'open' },
    orderBy: { order: 'asc' },
  });
  return stage?.id ?? null;
}

function roundProbability(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return NaN;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export async function createOpportunity(
  body: {
    name?: unknown;
    contactId?: unknown;
    accountId?: unknown;
    valueMinor?: unknown;
    currency?: unknown;
    expectedCloseDate?: unknown;
    stageId?: unknown;
    probability?: unknown;
    probabilityManual?: unknown;
    ownerId?: unknown;
    description?: unknown;
    lossReason?: unknown;
  },
  user: User,
) {
  const details: { field: string; message: string }[] = [];
  const name = optionalString(body.name);
  const accountId = optionalString(body.accountId);
  if (!name) details.push({ field: 'name', message: 'Name is required.' });
  if (!accountId) details.push({ field: 'accountId', message: 'Account is required.' });
  if (details.length) throw errors.validation(details);

  const account = await prisma.account.findFirst({
    where: { id: accountId!, deletedAt: null },
    select: { id: true },
  });
  if (!account) throw errors.validation([{ field: 'accountId', message: 'Account is required.' }]);
  const contactId = optionalString(body.contactId) ?? null;
  if (contactId) {
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, deletedAt: null },
      select: { id: true },
    });
    if (!contact) throw errors.validation([{ field: 'contactId', message: 'Contact not found.' }]);
  }

  const requestedStage = optionalString(body.stageId);
  const stageId = requestedStage ?? (await defaultOpenStageId());
  if (!stageId)
    throw errors.validation([{ field: 'stageId', message: 'A pipeline stage is required.' }]);
  const stage = await prisma.stage.findUnique({ where: { id: stageId } });
  if (!stage) throw errors.badRequest('validation', 'Unknown stage.');

  const probability = Number.isFinite(roundProbability(body.probability))
    ? roundProbability(body.probability)
    : stage.winProbability;
  const probabilityManual =
    body.probabilityManual === true ||
    (typeof body.probability === 'number' && Math.round(body.probability) !== stage.winProbability);

  const now = new Date();
  const row = await prisma.$transaction(async (tx) => {
    const opp = await tx.opportunity.create({
      data: {
        name: name!,
        contactId,
        accountId: accountId!,
        valueMinor: Math.trunc(Number(body.valueMinor) || 0),
        currency: optionalString(body.currency) ?? 'USD',
        expectedCloseDate: parseDateOnly(optionalString(body.expectedCloseDate)) ?? todayUtcDate(),
        stageId,
        probability,
        probabilityManual,
        ownerId: optionalString(body.ownerId) ?? user.id,
        description: optionalString(body.description) ?? null,
        lossReason: optionalString(body.lossReason) ?? null,
        createdBy: user.id,
        updatedBy: user.id,
        createdAt: now,
        updatedAt: now,
      },
    });
    await tx.stageHistory.create({
      data: {
        opportunityId: opp.id,
        fromStageId: null,
        toStageId: stageId,
        userId: user.id,
        timestamp: now,
      },
    });
    return opp;
  });
  return toOpportunity(row);
}

export async function updateOpportunity(id: string, body: Record<string, unknown>, user: User) {
  const existing = await prisma.opportunity.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw errors.notFound('not_found', 'Opportunity not found.');
  assertNoConflict(body.updatedAt, existing.updatedAt);
  assertCanMutate(user, existing.ownerId);

  const name = optionalString(body.name) ?? existing.name;
  const accountId = optionalString(body.accountId) ?? existing.accountId;
  if (!name) throw errors.validation([{ field: 'name', message: 'Name is required.' }]);
  const account = await prisma.account.findFirst({
    where: { id: accountId, deletedAt: null },
    select: { id: true },
  });
  if (!account) throw errors.validation([{ field: 'accountId', message: 'Account is required.' }]);
  const contactId = optionalString(body.contactId) ?? existing.contactId;

  const row = await prisma.opportunity.update({
    where: { id },
    data: {
      name,
      accountId,
      contactId,
      valueMinor:
        body.valueMinor !== undefined
          ? Math.trunc(Number(body.valueMinor) || 0)
          : existing.valueMinor,
      currency: optionalString(body.currency) ?? existing.currency,
      expectedCloseDate:
        body.expectedCloseDate !== undefined
          ? (parseDateOnly(optionalString(body.expectedCloseDate)) ?? existing.expectedCloseDate)
          : existing.expectedCloseDate,
      probability:
        body.probability !== undefined ? roundProbability(body.probability) : existing.probability,
      probabilityManual:
        body.probabilityManual !== undefined
          ? body.probabilityManual === true
          : typeof body.probability === 'number'
            ? Math.round(body.probability) !== existing.probability
            : existing.probabilityManual,
      ownerId: optionalString(body.ownerId) ?? existing.ownerId,
      description: optionalString(body.description) ?? existing.description,
      lossReason:
        body.lossReason !== undefined
          ? (optionalString(body.lossReason) ?? null)
          : existing.lossReason,
      updatedAt: new Date(),
      updatedBy: user.id,
    },
  });
  return toOpportunity(row);
}

export async function softDeleteOpportunity(id: string, user: User): Promise<void> {
  const existing = await prisma.opportunity.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw errors.notFound('not_found', 'Opportunity not found.');
  assertCanMutate(user, existing.ownerId);
  await prisma.opportunity.update({
    where: { id },
    data: { deletedAt: new Date(), updatedAt: new Date(), updatedBy: user.id },
  });
}

export async function moveOpportunityStage(
  id: string,
  body: { toStageId?: unknown; probabilityChoice?: unknown; lossReason?: unknown },
  user: User,
) {
  const existing = await prisma.opportunity.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw errors.notFound('not_found', 'Opportunity not found.');
  assertCanMutate(user, existing.ownerId);

  const toStageId = optionalString(body.toStageId);
  if (!toStageId) throw errors.badRequest('validation', 'Unknown stage.');
  const stage = await prisma.stage.findUnique({ where: { id: toStageId } });
  if (!stage) throw errors.badRequest('validation', 'Unknown stage.');

  const fromStageId = existing.stageId;
  const now = new Date();
  const probabilityManual = body.probabilityChoice === 'keep' ? true : false;
  const probability = probabilityManual ? existing.probability : stage.winProbability;
  const lossReason =
    stage.classification === 'lost'
      ? (optionalString(body.lossReason) ?? existing.lossReason ?? '')
      : null;

  const row = await prisma.$transaction(async (tx) => {
    const opp = await tx.opportunity.update({
      where: { id },
      data: {
        stageId: toStageId,
        probability,
        probabilityManual,
        lossReason,
        updatedAt: now,
        updatedBy: user.id,
      },
    });
    await tx.stageHistory.create({
      data: { opportunityId: id, fromStageId, toStageId, userId: user.id, timestamp: now },
    });
    return opp;
  });
  return toOpportunity(row);
}
