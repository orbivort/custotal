import { Router } from 'express';
import * as adminService from '../services/admin-service.ts';
import { requireAdmin, authedUser } from '../middleware/auth.ts';
import { pstr } from '../lib/query.ts';

export const adminRouter = Router();

adminRouter.use(requireAdmin);

// ---- Users ---------------------------------------------------------------
adminRouter.get('/users', async (_req, res) => {
  res.json({ items: await adminService.listUsers() });
});

adminRouter.post('/users', async (req, res) => {
  const result = await adminService.createUser(req.body ?? {});
  res.status(201).json(result);
});

adminRouter.patch('/users/:id', async (req, res) => {
  const user = await adminService.updateUser(pstr(req.params.id), req.body ?? {});
  res.json(user);
});

adminRouter.delete('/users/:id', async (req, res) => {
  await adminService.deleteUser(pstr(req.params.id), authedUser(req));
  res.json({ ok: true });
});

// ---- Pipeline stages ------------------------------------------------------
adminRouter.post('/stages', async (req, res) => {
  const stage = await adminService.createStage(req.body ?? {});
  res.status(201).json(stage);
});

adminRouter.patch('/stages/:id', async (req, res) => {
  const stage = await adminService.updateStage(pstr(req.params.id), req.body ?? {});
  res.json(stage);
});

adminRouter.delete('/stages/:id', async (req, res) => {
  await adminService.deleteStage(pstr(req.params.id));
  res.json({ ok: true });
});

adminRouter.post('/stages/reorder', async (req, res) => {
  const orderedIds = Array.isArray(req.body?.orderedIds) ? (req.body.orderedIds as unknown[]) : [];
  res.json({ items: await adminService.reorderStages(orderedIds.map(String)) });
});

// ---- Trash / recovery ----------------------------------------------------
adminRouter.get('/trash', async (_req, res) => {
  res.json(await adminService.listTrash());
});

adminRouter.post('/trash/contacts/:id/restore', async (req, res) => {
  res.json(await adminService.restoreTrashContact(pstr(req.params.id), authedUser(req)));
});

adminRouter.post('/trash/accounts/:id/restore', async (req, res) => {
  res.json(await adminService.restoreTrashAccount(pstr(req.params.id), authedUser(req)));
});

adminRouter.delete('/trash/contacts/:id', async (req, res) => {
  await adminService.purgeTrashContact(pstr(req.params.id));
  res.json({ ok: true });
});

adminRouter.delete('/trash/accounts/:id', async (req, res) => {
  await adminService.purgeTrashAccount(pstr(req.params.id));
  res.json({ ok: true });
});

adminRouter.post('/trash/opportunities/:id/restore', async (req, res) => {
  res.json(await adminService.restoreTrashOpportunity(pstr(req.params.id), authedUser(req)));
});

adminRouter.post('/trash/tasks/:id/restore', async (req, res) => {
  res.json(await adminService.restoreTrashTask(pstr(req.params.id), authedUser(req)));
});

adminRouter.post('/trash/interactions/:id/restore', async (req, res) => {
  res.json(await adminService.restoreTrashInteraction(pstr(req.params.id), authedUser(req)));
});

adminRouter.delete('/trash/opportunities/:id', async (req, res) => {
  await adminService.purgeTrashOpportunity(pstr(req.params.id));
  res.json({ ok: true });
});

adminRouter.delete('/trash/tasks/:id', async (req, res) => {
  await adminService.purgeTrashTask(pstr(req.params.id));
  res.json({ ok: true });
});

adminRouter.delete('/trash/interactions/:id', async (req, res) => {
  await adminService.purgeTrashInteraction(pstr(req.params.id));
  res.json({ ok: true });
});
