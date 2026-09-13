// Database lifecycle helpers for integration and e2e suites.
//
// Two strategies, chosen per suite:
// - seedDemoWorkspace() (test/fixtures/demo-workspace.ts): re-creates the demo
//   fixture dataset with stable ids and known totals. Used by suites that assert
//   on that dataset and by the e2e smoke suite.
// - resetDatabase(): in-process TRUNCATE of every table. Fast and data-free;
//   pairs with the builders in test/factories/ for suites that construct their
//   own data.
import { prisma } from '../../src/db.ts';
import { truncateAllTables } from './schema-tables.ts';

/**
 * Truncate every table in the test database, in-process. TRUNCATE is
 * transactional-DDL-safe in PostgreSQL and Cascade resolves the schema's real
 * FKs (Session -> User, ContactAccountLink, StageHistory, TaskCompletion,
 * Interaction.contact); audit-only uuid columns are plain scalars and need no
 * ordering.
 */
export async function resetDatabase(): Promise<void> {
  await truncateAllTables(prisma);
}
