import { Router } from 'express';
import { searchAll } from '../services/search-service.ts';
import { requireUser, authedUser } from '../middleware/auth.ts';

export const searchRouter = Router();

searchRouter.get('/', requireUser, async (req, res) => {
  const term = typeof req.query.q === 'string' ? req.query.q : '';
  const all = req.query.all === '1' || req.query.all === 'true';
  res.json(await searchAll(authedUser(req), term, all));
});
