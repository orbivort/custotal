import { Router } from 'express';
import * as interactionService from '../services/interaction-service.ts';
import { requireCanEdit, requireUser, authedUser } from '../middleware/auth.ts';
import { pstr, qnum, qstr } from '../lib/query.ts';

export const interactionRouter = Router();

interactionRouter.use(requireUser);

interactionRouter.get('/', async (req, res) => {
  const result = await interactionService.listInteractions(
    {
      contactId: qstr(req.query.contactId),
      accountId: qstr(req.query.accountId),
      opportunityId: qstr(req.query.opportunityId),
      page: qnum(req.query.page),
      pageSize: qnum(req.query.pageSize),
    },
    authedUser(req),
  );
  res.json(result);
});

interactionRouter.post('/', requireCanEdit, async (req, res) => {
  const created = await interactionService.createInteraction(req.body ?? {}, authedUser(req));
  res.status(201).json(created);
});

interactionRouter.patch('/:id', requireCanEdit, async (req, res) => {
  const updated = await interactionService.updateInteraction(
    pstr(req.params.id),
    req.body ?? {},
    authedUser(req),
  );
  res.json(updated);
});

interactionRouter.delete('/:id', requireCanEdit, async (req, res) => {
  await interactionService.softDeleteInteraction(pstr(req.params.id), authedUser(req));
  res.json({ ok: true });
});
