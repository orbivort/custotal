import { Router } from 'express';
import * as reportService from '../services/report-service.ts';
import { requireUser, authedUser } from '../middleware/auth.ts';

export const reportRouter = Router();

reportRouter.use(requireUser);

function rangeOf(req: { query: Record<string, unknown> }) {
  const owner = typeof req.query.owner === 'string' ? req.query.owner : undefined;
  const from = typeof req.query.from === 'string' ? req.query.from : undefined;
  const to = typeof req.query.to === 'string' ? req.query.to : undefined;
  return { owner, from, to };
}

reportRouter.get('/pipeline', async (req, res) => {
  res.json(await reportService.pipelineReport(authedUser(req), rangeOf(req)));
});

reportRouter.get('/winloss', async (req, res) => {
  res.json(await reportService.winLossReport(authedUser(req), rangeOf(req)));
});
