// Scheduled purge of soft-deleted records past the retention window (FR-CC-05).
//
// This is the batch counterpart to the admin trash API in admin-service.ts:
// both apply the same rule — a record is only physically removed once nothing
// references it — so the retention window is shared and the reference checks
// mirror the admin guards (`purgeTrashOpportunity`, `purgeTrashTask`,
// `purgeTrashContact`, `purgeTrashAccount`).
//
// Design constraints (see ADR-0007 in docs/operations-notes.md):
// - Runs OUT OF PROCESS as a maintenance job (scripts/purge.ts), never on the
//   request path, so it cannot contend with request serving for the event loop or
//   the Prisma connection pool.
// - Drains work in bounded batches using keyset pagination on the primary key, so
//   a large backlog cannot become one long transaction, an unbounded
//   `WHERE id IN (...)` list, or a memory spike. Blocked candidates are skipped
//   (the cursor advances past them) instead of being re-fetched every batch.
// - Each batch scans the referencing tables once with a set-based `groupBy` over
//   the page's ids.
import type { PrismaClient } from '../generated/prisma/client.ts';

/** Soft-deleted records are kept for this many days before the purge removes them. */
export const SOFT_DELETE_RETENTION_DAYS = 30;

/** Rows examined per batch. Caps memory, `IN (...)` size, and lock scope. */
export const DEFAULT_PURGE_BATCH_SIZE = 500;

const MS_PER_DAY = 86_400_000;

export interface PurgeOptions {
  /** Reference time for the retention window. Defaults to now. */
  now?: Date;
  /** Retention window in days. Defaults to {@link SOFT_DELETE_RETENTION_DAYS}. */
  retentionDays?: number;
  /** Rows per batch. Defaults to {@link DEFAULT_PURGE_BATCH_SIZE}. */
  batchSize?: number;
}

function keySet(rows: Record<string, unknown>[], key: string): Set<string> {
  const out = new Set<string>();
  for (const row of rows) {
    const id = row[key];
    if (typeof id === 'string') out.add(id);
  }
  return out;
}

/**
 * Walk every expired candidate in primary-key order and delete the ones the
 * `blockedFor` predicate does not flag. Keyset pagination (`id > cursor`) visits
 * each candidate exactly once per run, so blocked rows are skipped without being
 * re-fetched and the loop always terminates.
 */
async function drainExpired(
  fetchPage: (cursor: string | null) => Promise<string[]>,
  blockedFor: (ids: string[]) => Promise<Set<string>>,
  remove: (ids: string[]) => Promise<number>,
  batchSize: number,
): Promise<number> {
  let purged = 0;
  let cursor: string | null = null;
  for (;;) {
    const page = await fetchPage(cursor);
    if (page.length === 0) break;
    cursor = page[page.length - 1];
    const blocked = await blockedFor(page);
    const deletable = page.filter((id) => !blocked.has(id));
    if (deletable.length) purged += await remove(deletable);
    if (page.length < batchSize) break;
  }
  return purged;
}

/**
 * Physically delete soft-deleted records whose `deletedAt` is at or before the
 * retention cutoff, skipping any record that is still referenced. Returns the
 * number of rows removed.
 */
export async function purgeExpiredRecords(
  prisma: PrismaClient,
  options: PurgeOptions = {},
): Promise<number> {
  const { now = new Date(), retentionDays = SOFT_DELETE_RETENTION_DAYS } = options;
  const batchSize = Math.max(1, Math.floor(options.batchSize ?? DEFAULT_PURGE_BATCH_SIZE));
  const cutoff = new Date(now.getTime() - retentionDays * MS_PER_DAY);
  const expired = { deletedAt: { lte: cutoff } };
  const after = (cursor: string | null): { id?: { gt: string } } =>
    cursor ? { id: { gt: cursor } } : {};
  const page = <T extends { id: string }>(rows: T[]) => rows.map((r) => r.id);
  let purged = 0;

  // ---- Opportunities: blocked while any interaction OR task references them. ----
  purged += await drainExpired(
    async (cursor) =>
      page(
        await prisma.opportunity.findMany({
          where: { ...expired, ...after(cursor) },
          orderBy: { id: 'asc' },
          take: batchSize,
          select: { id: true },
        }),
      ),
    async (ids) => {
      const [viaInteraction, viaTask] = await Promise.all([
        prisma.interaction.groupBy({
          by: ['opportunityId'],
          where: { opportunityId: { in: ids } },
          _count: { _all: true },
        }),
        prisma.task.groupBy({
          by: ['opportunityId'],
          where: { opportunityId: { in: ids } },
          _count: { _all: true },
        }),
      ]);
      return new Set<string>([
        ...keySet(viaInteraction as unknown as Record<string, unknown>[], 'opportunityId'),
        ...keySet(viaTask as unknown as Record<string, unknown>[], 'opportunityId'),
      ]);
    },
    async (ids) => (await prisma.opportunity.deleteMany({ where: { id: { in: ids } } })).count,
    batchSize,
  );

  // ---- Tasks: blocked while any interaction references them. ----
  purged += await drainExpired(
    async (cursor) =>
      page(
        await prisma.task.findMany({
          where: { ...expired, ...after(cursor) },
          orderBy: { id: 'asc' },
          take: batchSize,
          select: { id: true },
        }),
      ),
    async (ids) => {
      const rows = await prisma.interaction.groupBy({
        by: ['taskId'],
        where: { taskId: { in: ids } },
        _count: { _all: true },
      });
      return keySet(rows as unknown as Record<string, unknown>[], 'taskId');
    },
    async (ids) => (await prisma.task.deleteMany({ where: { id: { in: ids } } })).count,
    batchSize,
  );

  // ---- Contacts: blocked while any interaction, deal, or task references them. ----
  purged += await drainExpired(
    async (cursor) =>
      page(
        await prisma.contact.findMany({
          where: { ...expired, ...after(cursor) },
          orderBy: { id: 'asc' },
          take: batchSize,
          select: { id: true },
        }),
      ),
    async (ids) => {
      const [viaInteraction, viaOpportunity, viaTask] = await Promise.all([
        prisma.interaction.groupBy({
          by: ['contactId'],
          where: { contactId: { in: ids } },
          _count: { _all: true },
        }),
        prisma.opportunity.groupBy({
          by: ['contactId'],
          where: { contactId: { in: ids } },
          _count: { _all: true },
        }),
        prisma.task.groupBy({
          by: ['contactId'],
          where: { contactId: { in: ids } },
          _count: { _all: true },
        }),
      ]);
      return new Set<string>([
        ...keySet(viaInteraction as unknown as Record<string, unknown>[], 'contactId'),
        ...keySet(viaOpportunity as unknown as Record<string, unknown>[], 'contactId'),
        ...keySet(viaTask as unknown as Record<string, unknown>[], 'contactId'),
      ]);
    },
    async (ids) => (await prisma.contact.deleteMany({ where: { id: { in: ids } } })).count,
    batchSize,
  );

  // ---- Accounts: blocked while any link/deal/task/interaction references them. ----
  purged += await drainExpired(
    async (cursor) =>
      page(
        await prisma.account.findMany({
          where: { ...expired, ...after(cursor) },
          orderBy: { id: 'asc' },
          take: batchSize,
          select: { id: true },
        }),
      ),
    async (ids) => {
      const [viaLink, viaOpportunity, viaTask, viaInteraction] = await Promise.all([
        prisma.contactAccountLink.groupBy({
          by: ['accountId'],
          where: { accountId: { in: ids } },
          _count: { _all: true },
        }),
        prisma.opportunity.groupBy({
          by: ['accountId'],
          where: { accountId: { in: ids } },
          _count: { _all: true },
        }),
        prisma.task.groupBy({
          by: ['accountId'],
          where: { accountId: { in: ids } },
          _count: { _all: true },
        }),
        prisma.interaction.groupBy({
          by: ['accountId'],
          where: { accountId: { in: ids } },
          _count: { _all: true },
        }),
      ]);
      return new Set<string>([
        ...keySet(viaLink as unknown as Record<string, unknown>[], 'accountId'),
        ...keySet(viaOpportunity as unknown as Record<string, unknown>[], 'accountId'),
        ...keySet(viaTask as unknown as Record<string, unknown>[], 'accountId'),
        ...keySet(viaInteraction as unknown as Record<string, unknown>[], 'accountId'),
      ]);
    },
    async (ids) => (await prisma.account.deleteMany({ where: { id: { in: ids } } })).count,
    batchSize,
  );

  // ---- Interactions: nothing references them, so every expired row can go. ----
  purged += await drainExpired(
    async (cursor) =>
      page(
        await prisma.interaction.findMany({
          where: { ...expired, ...after(cursor) },
          orderBy: { id: 'asc' },
          take: batchSize,
          select: { id: true },
        }),
      ),
    async () => new Set<string>(),
    async (ids) => (await prisma.interaction.deleteMany({ where: { id: { in: ids } } })).count,
    batchSize,
  );

  return purged;
}
