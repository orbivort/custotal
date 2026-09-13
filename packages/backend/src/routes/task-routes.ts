import { Router } from 'express';
import * as taskService from '../services/task-service.ts';
import { requireCanEdit, requireUser, authedUser } from '../middleware/auth.ts';
import { pstr, qstr } from '../lib/query.ts';

export const taskRouter = Router();

taskRouter.use(requireUser);

taskRouter.get('/summary', async (req, res) => {
  res.json(await taskService.getTaskSummary(authedUser(req)));
});

taskRouter.get('/', async (req, res) => {
  const result = await taskService.listTasks(authedUser(req), {
    scope: qstr(req.query.scope),
    status: qstr(req.query.status),
    priority: qstr(req.query.priority),
    owner: qstr(req.query.owner),
    related: qstr(req.query.related),
  });
  res.json(result);
});

taskRouter.post('/', requireCanEdit, async (req, res) => {
  const created = await taskService.createTask(req.body ?? {}, authedUser(req));
  res.status(201).json(created);
});

taskRouter.patch('/:id', requireCanEdit, async (req, res) => {
  const updated = await taskService.updateTask(
    pstr(req.params.id),
    req.body ?? {},
    authedUser(req),
  );
  res.json(updated);
});

taskRouter.delete('/:id', requireCanEdit, async (req, res) => {
  await taskService.softDeleteTask(pstr(req.params.id), authedUser(req));
  res.json({ ok: true });
});

taskRouter.post('/:id/complete', requireCanEdit, async (req, res) => {
  res.json(await taskService.completeTask(pstr(req.params.id), authedUser(req)));
});

taskRouter.post('/:id/reopen', requireCanEdit, async (req, res) => {
  res.json(await taskService.reopenTask(pstr(req.params.id), authedUser(req)));
});

taskRouter.get('/:id/completions', async (req, res) => {
  res.json(await taskService.listTaskCompletions(pstr(req.params.id), authedUser(req)));
});
