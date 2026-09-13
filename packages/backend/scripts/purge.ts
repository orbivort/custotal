// CLI entry for the scheduled soft-delete purge (FR-CC-05). The reference
// checks, retention window, and batch sizing live in
// src/services/purge-service.ts, which the integration suite exercises
// directly; this file only wires up the environment and the database client.
//
// Run out of process on a schedule (see docs/restore-procedure.md) — never on
// the request path. The scheduler should call `pnpm maintenance` so the backup
// runs first.
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';
import { join } from 'node:path';
import { loadEnvFile } from 'node:process';
import { DEFAULT_PURGE_BATCH_SIZE, purgeExpiredRecords } from '../src/services/purge-service.ts';

try {
  loadEnvFile(join(process.cwd(), '.env'));
} catch {
  // rely on exported env
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required for purge.');
  process.exit(1);
}

// Optional performance knob: bounded batches keep a large backlog from becoming
// one long transaction / unbounded `IN (...)` list. Invalid values fall back.
const requestedBatch = Number(process.env.PURGE_BATCH_SIZE);
const batchSize =
  Number.isFinite(requestedBatch) && requestedBatch > 0
    ? Math.floor(requestedBatch)
    : DEFAULT_PURGE_BATCH_SIZE;

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function main(): Promise<void> {
  const purged = await purgeExpiredRecords(prisma, { batchSize });
  console.log(`[purge] removed ${purged} expired soft-deleted records`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
