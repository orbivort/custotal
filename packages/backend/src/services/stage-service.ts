// Pipeline-stage provisioning.
//
// The default pipeline is created on demand (no seed step required) and shared
// by every signed-in user, so it lives here rather than in the admin-only CRUD
// in admin-service: reps open the New Deal form too.
import type { PrismaClient } from '../generated/prisma/client.ts';
import { DEFAULT_STAGES } from '../lib/default-stages.ts';
import { toStage } from '../serializers.ts';
import type { Stage } from '../types/domain.ts';

export interface EnsureStagesResult {
  /** True when this call created the default pipeline. */
  created: boolean;
  /** The configured pipeline after the call, in display order. */
  items: Stage[];
}

/**
 * Idempotently provisions the default pipeline.
 *
 * The initializer runs at most once in practice: as soon as any stage exists the
 * configured pipeline is returned untouched, so an admin's customization is
 * never overwritten and the defaults are never duplicated. `skipDuplicates`
 * additionally tolerates two users racing on a brand-new instance.
 *
 * The Prisma client is passed in (rather than importing the server's singleton)
 * so the test fixture can reuse this logic against its own client without
 * opening a second, never-closed connection pool.
 */
export async function ensureDefaultStages(db: PrismaClient): Promise<EnsureStagesResult> {
  const existing = await db.stage.findMany({ orderBy: { order: 'asc' } });
  if (existing.length > 0) return { created: false, items: existing.map(toStage) };

  await db.stage.createMany({
    data: DEFAULT_STAGES.map((stage) => ({ ...stage })),
    skipDuplicates: true,
  });
  const items = await db.stage.findMany({ orderBy: { order: 'asc' } });
  return { created: true, items: items.map(toStage) };
}
