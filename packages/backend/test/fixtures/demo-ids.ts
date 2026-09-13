// Stable UUIDs for the demo fixture rows referenced across tables (and asserted
// in the integration tests). All values are valid UUID literals so they insert
// into the @db.Uuid columns; the DB default uuidv7() covers rows that need no
// fixed id.
//
// Test-only. The application no longer ships a database seed (see
// test/fixtures/demo-workspace.ts).
export const USERS = {
  sam: '10000000-0000-4000-8000-000000000001',
  dana: '10000000-0000-4000-8000-000000000002',
  alex: '10000000-0000-4000-8000-000000000003',
  morgan: '10000000-0000-4000-8000-000000000004',
  riley: '10000000-0000-4000-8000-000000000005',
} as const;

// The default pipeline ids are declared next to the initializer that provisions
// them (src/lib/default-stages.ts) and re-exported here so the fixture and the
// integration tests keep their existing import unchanged.
export { STAGE_IDS as STAGES } from '../../src/lib/default-stages.ts';

export const ACCOUNTS = {
  acme: '30000000-0000-4000-8000-000000000001',
  northwind: '30000000-0000-4000-8000-000000000002',
  globex: '30000000-0000-4000-8000-000000000003',
  initech: '30000000-0000-4000-8000-000000000004',
  stark: '30000000-0000-4000-8000-000000000005',
  umber: '30000000-0000-4000-8000-000000000006',
  hooli: '30000000-0000-4000-8000-000000000007',
} as const;

export const CONTACTS = {
  laura: '40000000-0000-4000-8000-000000000001',
  marcus: '40000000-0000-4000-8000-000000000002',
  priya: '40000000-0000-4000-8000-000000000003',
  jonas: '40000000-0000-4000-8000-000000000004',
  elena: '40000000-0000-4000-8000-000000000005',
  tunde: '40000000-0000-4000-8000-000000000006',
  grace: '40000000-0000-4000-8000-000000000007',
  omar: '40000000-0000-4000-8000-000000000008',
  mia: '40000000-0000-4000-8000-000000000009',
} as const;

export const OPPORTUNITIES = {
  acme: '50000000-0000-4000-8000-000000000001',
  northwind: '50000000-0000-4000-8000-000000000002',
  globex: '50000000-0000-4000-8000-000000000003',
  initech: '50000000-0000-4000-8000-000000000004',
  stark: '50000000-0000-4000-8000-000000000005',
  umber: '50000000-0000-4000-8000-000000000006',
  northwindPilot: '50000000-0000-4000-8000-000000000007',
} as const;

export const TASKS = {
  t1: '60000000-0000-4000-8000-000000000001',
  t2: '60000000-0000-4000-8000-000000000002',
  t3: '60000000-0000-4000-8000-000000000003',
  t4: '60000000-0000-4000-8000-000000000004',
  t5: '60000000-0000-4000-8000-000000000005',
  t6: '60000000-0000-4000-8000-000000000006',
  t7: '60000000-0000-4000-8000-000000000007',
  t8: '60000000-0000-4000-8000-000000000008',
} as const;
