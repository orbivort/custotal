// Instance health / bootstrap metadata. The login screen calls GET /api/health to
// distinguish "ok / setup required / unreachable"; /health is the operational probe.
import { Router } from 'express';
import { prisma } from '../db.ts';
import { env } from '../config.ts';
import { requireUser } from '../middleware/auth.ts';
import { toStage, toUser } from '../serializers.ts';
import { ensureDefaultStages } from '../services/stage-service.ts';
import type { InstanceInfo } from '../types/domain.ts';

export const metaRouter = Router();

metaRouter.get('/health', async (_req, res) => {
  const info: InstanceInfo = {
    orgName: env.instance.orgName,
    version: env.appVersion,
    environment: env.instance.environment as InstanceInfo['environment'],
    hostname: env.instance.hostname,
    allowPasswordReset: env.instance.allowPasswordReset,
    setupRequired: env.instance.setupRequired,
  };
  res.json(info);
});

metaRouter.get('/meta', requireUser, async (_req, res) => {
  const [users, stages, accounts] = await Promise.all([
    prisma.user.findMany({ orderBy: { name: 'asc' } }),
    prisma.stage.findMany({ orderBy: { order: 'asc' } }),
    prisma.account.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, ownerId: true },
    }),
  ]);
  res.json({
    users: users.map(toUser),
    stages: stages.map(toStage),
    accounts: accounts.map((a) => ({ id: a.id, name: a.name, ownerId: a.ownerId })),
  });
});

metaRouter.get('/stages', async (_req, res) => {
  const stages = await prisma.stage.findMany({ orderBy: { order: 'asc' } });
  res.json(stages.map(toStage));
});

// Lazily provisions the default pipeline the first time a user reaches the New
// Deal form or the Pipeline Stages view. Idempotent: an already-configured
// pipeline is returned unchanged, so calling it again never duplicates or
// overwrites stages. Any signed-in user may trigger it (reps create deals too).
metaRouter.post('/stages/ensure', requireUser, async (_req, res) => {
  res.json(await ensureDefaultStages(prisma));
});
