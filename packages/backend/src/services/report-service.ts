// Reporting (FR-RA-01/02/03). Both reports honour record visibility: a rep sees
// only their own data; manager/admin/readonly see everything within their scope.
import { prisma } from '../db.ts';
import { parseDateOnly } from '../lib/time.ts';
import type { User } from '../types/domain.ts';

interface RangeParams {
  owner?: string;
  from?: string;
  to?: string;
}

function visibility(user: User, owner?: string): { ownerId?: string } | Record<string, never> {
  if (user.role === 'admin' || user.role === 'manager' || user.role === 'readonly') {
    return owner ? { ownerId: owner } : {};
  }
  // A rep always sees only their own opportunities, regardless of any owner filter.
  return { ownerId: user.id };
}

async function loadOpportunities(user: User, p: RangeParams) {
  const dateFilter = {
    ...(p.from ? { expectedCloseDate: { gte: parseDateOnly(p.from)! } } : {}),
    ...(p.to ? { expectedCloseDate: { lte: parseDateOnly(p.to)! } } : {}),
  };
  return prisma.opportunity.findMany({
    where: { deletedAt: null, ...visibility(user, p.owner), ...dateFilter },
    select: { stageId: true, valueMinor: true, probability: true, ownerId: true, lossReason: true },
  });
}

export async function pipelineReport(user: User, p: RangeParams) {
  const [stages, opps] = await Promise.all([
    prisma.stage.findMany({ orderBy: { order: 'asc' } }),
    loadOpportunities(user, p),
  ]);
  return {
    rows: stages.map((s) => {
      const stageOpps = opps.filter((o) => o.stageId === s.id);
      const totalValue = stageOpps.reduce((sum, o) => sum + o.valueMinor, 0);
      const weightedValue = stageOpps.reduce(
        (sum, o) => sum + Math.round((o.valueMinor * o.probability) / 100),
        0,
      );
      return {
        stageId: s.id,
        stageName: s.name,
        count: stageOpps.length,
        totalValue,
        weightedValue,
      };
    }),
  };
}

export async function winLossReport(user: User, p: RangeParams) {
  const [stages, opps] = await Promise.all([prisma.stage.findMany(), loadOpportunities(user, p)]);
  const classificationOf = (stageId: string) =>
    stages.find((s) => s.id === stageId)?.classification ?? 'open';
  const closed = opps.filter((o) => classificationOf(o.stageId) !== 'open');
  const won = closed.filter((o) => classificationOf(o.stageId) === 'won');
  const lost = closed.filter((o) => classificationOf(o.stageId) === 'lost');
  const wonValue = won.reduce((sum, o) => sum + o.valueMinor, 0);
  const lostValue = lost.reduce((sum, o) => sum + o.valueMinor, 0);
  const total = won.length + lost.length;
  const winRate = total === 0 ? 0 : Math.round((won.length / total) * 100);

  const reasonMap = new Map<string, number>();
  for (const o of lost) {
    const reason = o.lossReason?.trim() || 'Not specified';
    reasonMap.set(reason, (reasonMap.get(reason) ?? 0) + 1);
  }
  return {
    wonCount: won.length,
    lostCount: lost.length,
    wonValue,
    lostValue,
    winRate,
    lossReasons: Array.from(reasonMap.entries()).map(([reason, count]) => ({ reason, count })),
  };
}
