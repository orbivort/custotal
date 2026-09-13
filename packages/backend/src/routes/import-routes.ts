import { Router } from 'express';
import * as importService from '../services/import-service.ts';
import { requireAdmin, authedUser } from '../middleware/auth.ts';
import { pstr } from '../lib/query.ts';
import type { DuplicatePolicy, ImportEntity } from '../types/domain.ts';

export const importRouter = Router();

importRouter.use(requireAdmin);

importRouter.get('/templates', async (req, res) => {
  const entity = typeof req.query.entity === 'string' ? req.query.entity : undefined;
  res.json({ items: await importService.listTemplates(entity) });
});

importRouter.post('/templates', async (req, res) => {
  const template = await importService.saveTemplate(req.body ?? {});
  res.status(201).json(template);
});

importRouter.delete('/templates/:id', async (req, res) => {
  await importService.deleteTemplate(pstr(req.params.id));
  res.json({ ok: true });
});

importRouter.post('/dry-run', async (req, res) => {
  const entity = (req.body?.entity === 'account' ? 'account' : 'contact') as ImportEntity;
  const records = Array.isArray(req.body?.records)
    ? (req.body.records as Record<string, string>[])
    : [];
  res.json(await importService.dryRun(entity, records));
});

importRouter.post('/commit', async (req, res) => {
  const entity = (req.body?.entity === 'account' ? 'account' : 'contact') as ImportEntity;
  const records = Array.isArray(req.body?.records)
    ? (req.body.records as Record<string, string>[])
    : [];
  const duplicate = (req.body?.duplicate === 'overwrite' ? 'overwrite' : 'skip') as DuplicatePolicy;
  res.json(await importService.commitImport(entity, records, duplicate, authedUser(req)));
});
