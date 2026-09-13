import { http } from 'msw';
import { env } from '../../config/env';
import type { Opportunity } from '../../types/domain';
import { getDB, persist } from '../db/store';
import { canEdit, canViewOwnerScoped, err, genId, json, nowISO, requireUser } from './helpers';

function buildOpportunity(body: Partial<Opportunity>, existing?: Opportunity): Opportunity {
  const now = nowISO();
  return {
    id: existing?.id ?? genId('o'),
    name: body.name?.trim() ?? existing?.name ?? '',
    contactId: body.contactId || existing?.contactId || undefined,
    accountId: body.accountId ?? existing?.accountId ?? '',
    valueMinor: body.valueMinor ?? existing?.valueMinor ?? 0,
    currency: body.currency ?? existing?.currency ?? env.defaultCurrency,
    expectedCloseDate: body.expectedCloseDate ?? existing?.expectedCloseDate ?? '',
    stageId: body.stageId ?? existing?.stageId ?? 's-lead',
    probability: body.probability ?? existing?.probability ?? 10,
    probabilityManual: body.probabilityManual ?? existing?.probabilityManual ?? false,
    ownerId: body.ownerId ?? existing?.ownerId ?? requireUser()?.id ?? '',
    description: body.description?.trim() || existing?.description || undefined,
    lossReason: body.lossReason ?? existing?.lossReason,
    createdAt: existing?.createdAt ?? now,
    createdBy: existing?.createdBy ?? requireUser()?.id ?? '',
    updatedAt: now,
    updatedBy: requireUser()?.id ?? '',
  };
}

export const opportunityHandlers = [
  http.get('/api/opportunities', ({ request }) => {
    const user = requireUser();
    if (!user) return err(401, 'unauthorized', 'Authentication required.');
    const params = new URL(request.url).searchParams;
    const owner = params.get('owner') ?? '';
    const stageId = params.get('stage') ?? '';

    const db = getDB();
    let items = db.opportunities.filter((o) => canViewOwnerScoped(user, o.ownerId));
    if (owner) items = items.filter((o) => o.ownerId === owner);
    if (stageId) items = items.filter((o) => o.stageId === stageId);
    return json({ items, total: items.length });
  }),

  http.get('/api/opportunities/:id', ({ params }) => {
    const user = requireUser();
    if (!user) return err(401, 'unauthorized', 'Authentication required.');
    const db = getDB();
    const opp = db.opportunities.find((o) => o.id === params.id);
    if (!opp || !canViewOwnerScoped(user, opp.ownerId)) {
      return err(404, 'not_found', 'Opportunity not found.');
    }
    const history = db.stageHistory
      .filter((h) => h.opportunityId === opp.id)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return json({ ...opp, history });
  }),

  http.post('/api/opportunities', async ({ request }) => {
    const user = requireUser();
    if (!user) return err(401, 'unauthorized', 'Authentication required.');
    if (!canEdit(user))
      return err(403, 'forbidden', 'You do not have permission to create opportunities.');
    const body = (await request.json()) as Partial<Opportunity>;
    if (!body.accountId) {
      return err(400, 'validation', 'Account is required.', [
        { field: 'accountId', message: 'Account is required.' },
      ]);
    }
    if (!body.name?.trim()) {
      return err(400, 'validation', 'Name is required.', [
        { field: 'name', message: 'Name is required.' },
      ]);
    }

    const db = getDB();
    const opp = buildOpportunity(body);
    db.opportunities.push(opp);
    db.stageHistory.push({
      id: genId('h'),
      opportunityId: opp.id,
      fromStageId: null,
      toStageId: opp.stageId,
      userId: user.id,
      timestamp: nowISO(),
    });
    persist();
    return json(opp, 201);
  }),

  http.patch('/api/opportunities/:id', async ({ request, params }) => {
    const user = requireUser();
    if (!user) return err(401, 'unauthorized', 'Authentication required.');
    if (!canEdit(user))
      return err(403, 'forbidden', 'You do not have permission to edit opportunities.');
    const db = getDB();
    const index = db.opportunities.findIndex((o) => o.id === params.id);
    if (index < 0) return err(404, 'not_found', 'Opportunity not found.');
    const body = (await request.json()) as Partial<Opportunity>;
    const updated = buildOpportunity(
      { ...db.opportunities[index], ...body },
      db.opportunities[index],
    );
    db.opportunities[index] = updated;
    persist();
    return json(updated);
  }),

  http.delete('/api/opportunities/:id', ({ params }) => {
    const user = requireUser();
    if (!user) return err(401, 'unauthorized', 'Authentication required.');
    if (!canEdit(user))
      return err(403, 'forbidden', 'You do not have permission to delete opportunities.');
    const db = getDB();
    const index = db.opportunities.findIndex((o) => o.id === params.id);
    if (index < 0) return err(404, 'not_found', 'Opportunity not found.');
    db.opportunities.splice(index, 1);
    persist();
    return json({ ok: true });
  }),

  http.post('/api/opportunities/:id/stage', async ({ request, params }) => {
    const user = requireUser();
    if (!user) return err(401, 'unauthorized', 'Authentication required.');
    if (!canEdit(user))
      return err(403, 'forbidden', 'You do not have permission to move opportunities.');
    const db = getDB();
    const opp = db.opportunities.find((o) => o.id === params.id);
    if (!opp) return err(404, 'not_found', 'Opportunity not found.');
    const body = (await request.json()) as {
      toStageId: string;
      probabilityChoice?: 'keep' | 'default';
      lossReason?: string;
    };
    const stage = db.stages.find((s) => s.id === body.toStageId);
    if (!stage) return err(400, 'validation', 'Unknown stage.');

    const fromStageId = opp.stageId;
    opp.stageId = stage.id;
    if (body.probabilityChoice === 'keep') {
      opp.probabilityManual = true;
    } else {
      opp.probability = stage.winProbability;
      opp.probabilityManual = false;
    }
    if (stage.classification === 'lost') {
      opp.lossReason = body.lossReason ?? opp.lossReason ?? '';
    } else {
      opp.lossReason = undefined;
    }
    opp.updatedAt = nowISO();
    opp.updatedBy = user.id;

    db.stageHistory.push({
      id: genId('h'),
      opportunityId: opp.id,
      fromStageId,
      toStageId: stage.id,
      userId: user.id,
      timestamp: nowISO(),
    });
    persist();
    return json(opp);
  }),
];
