import { Router } from 'express';
import * as opportunityService from '../services/opportunity-service.ts';
import { requireCanEdit, requireUser, authedUser } from '../middleware/auth.ts';
import { pstr, qstr } from '../lib/query.ts';

export const opportunityRouter = Router();

opportunityRouter.use(requireUser);

opportunityRouter.get('/', async (req, res) => {
  const result = await opportunityService.listOpportunities(authedUser(req), {
    owner: qstr(req.query.owner),
    stage: qstr(req.query.stage),
  });
  res.json(result);
});

opportunityRouter.get('/:id', async (req, res) => {
  res.json(await opportunityService.getOpportunity(pstr(req.params.id), authedUser(req)));
});

opportunityRouter.post('/', requireCanEdit, async (req, res) => {
  const created = await opportunityService.createOpportunity(req.body ?? {}, authedUser(req));
  res.status(201).json(created);
});

opportunityRouter.patch('/:id', requireCanEdit, async (req, res) => {
  const updated = await opportunityService.updateOpportunity(
    pstr(req.params.id),
    req.body ?? {},
    authedUser(req),
  );
  res.json(updated);
});

opportunityRouter.delete('/:id', requireCanEdit, async (req, res) => {
  await opportunityService.softDeleteOpportunity(pstr(req.params.id), authedUser(req));
  res.json({ ok: true });
});

opportunityRouter.post('/:id/stage', requireCanEdit, async (req, res) => {
  const updated = await opportunityService.moveOpportunityStage(
    pstr(req.params.id),
    req.body ?? {},
    authedUser(req),
  );
  res.json(updated);
});
