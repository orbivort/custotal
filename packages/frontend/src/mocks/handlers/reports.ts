import { http } from 'msw';
import { getDB } from '../db/store';
import { canViewOwnerScoped, err, json, requireUser } from './helpers';

export const reportHandlers = [
  http.get('/api/reports/pipeline', ({ request }) => {
    const user = requireUser();
    if (!user) return err(401, 'unauthorized', 'Authentication required.');
    const params = new URL(request.url).searchParams;
    const owner = params.get('owner') ?? '';
    const from = params.get('from') ?? '';
    const to = params.get('to') ?? '';

    const db = getDB();
    let opps = db.opportunities.filter((o) => canViewOwnerScoped(user, o.ownerId));
    if (owner) opps = opps.filter((o) => o.ownerId === owner);
    if (from) opps = opps.filter((o) => o.expectedCloseDate >= from);
    if (to) opps = opps.filter((o) => o.expectedCloseDate <= to);

    const rows = db.stages.map((s) => {
      const stageOpps = opps.filter((o) => o.stageId === s.id);
      const count = stageOpps.length;
      const totalValue = stageOpps.reduce((sum, o) => sum + o.valueMinor, 0);
      const weightedValue = stageOpps.reduce(
        (sum, o) => sum + Math.round((o.valueMinor * o.probability) / 100),
        0,
      );
      return { stageId: s.id, stageName: s.name, count, totalValue, weightedValue };
    });
    return json({ rows });
  }),

  http.get('/api/reports/winloss', ({ request }) => {
    const user = requireUser();
    if (!user) return err(401, 'unauthorized', 'Authentication required.');
    const params = new URL(request.url).searchParams;
    const owner = params.get('owner') ?? '';
    const from = params.get('from') ?? '';
    const to = params.get('to') ?? '';

    const db = getDB();
    const classify = (o: { stageId: string }) =>
      db.stages.find((s) => s.id === o.stageId)?.classification ?? 'open';

    let closed = db.opportunities.filter(
      (o) => canViewOwnerScoped(user, o.ownerId) && classify(o) !== 'open',
    );
    if (owner) closed = closed.filter((o) => o.ownerId === owner);
    if (from) closed = closed.filter((o) => o.expectedCloseDate >= from);
    if (to) closed = closed.filter((o) => o.expectedCloseDate <= to);

    const won = closed.filter((o) => classify(o) === 'won');
    const lost = closed.filter((o) => classify(o) === 'lost');
    const wonValue = won.reduce((sum, o) => sum + o.valueMinor, 0);
    const lostValue = lost.reduce((sum, o) => sum + o.valueMinor, 0);
    const total = won.length + lost.length;
    const winRate = total === 0 ? 0 : Math.round((won.length / total) * 100);

    const reasonMap = new Map<string, number>();
    for (const o of lost) {
      const reason = o.lossReason?.trim() || 'Not specified';
      reasonMap.set(reason, (reasonMap.get(reason) ?? 0) + 1);
    }

    return json({
      wonCount: won.length,
      lostCount: lost.length,
      wonValue,
      lostValue,
      winRate,
      lossReasons: Array.from(reasonMap.entries()).map(([reason, count]) => ({ reason, count })),
    });
  }),
];
