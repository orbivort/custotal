// Exact schema model names (Prisma maps model -> quoted table name).
//
// Shared by the TRUNCATE-based reset (support/db.ts) and the demo-workspace
// fixture, so neither helper has to import the other (the fixture intentionally
// does NOT pull in src/db.ts, whose client binds to DATABASE_URL rather than the
// test database).
export const ALL_TABLES = [
  'Session',
  'PasswordResetToken',
  'TaskCompletion',
  'StageHistory',
  'ContactAccountLink',
  'Task',
  'Interaction',
  'Opportunity',
  'Contact',
  'Account',
  'Stage',
  'ImportMappingTemplate',
  'User',
] as const;

/** Minimal structural view of a Prisma client, kept free of client generics. */
export interface TruncatableClient {
  $executeRawUnsafe(query: string): Promise<unknown>;
}

/**
 * Truncate every table, in-process. TRUNCATE is transactional-DDL-safe in
 * PostgreSQL and Cascade resolves the schema's real FKs (Session -> User,
 * ContactAccountLink, StageHistory, TaskCompletion, Interaction.contact);
 * audit-only uuid columns are plain scalars and need no ordering.
 */
export async function truncateAllTables(db: TruncatableClient): Promise<void> {
  await db.$executeRawUnsafe(
    `TRUNCATE TABLE ${ALL_TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
}
