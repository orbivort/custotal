import type {
  Account,
  Contact,
  ImportMappingTemplate,
  Interaction,
  Opportunity,
  Stage,
  StageHistoryEntry,
  Task,
  User,
} from '../../types/domain';
import { env } from '../../config/env';
import { createSeed } from './seed';

export interface DB {
  users: User[];
  stages: Stage[];
  accounts: Account[];
  contacts: Contact[];
  interactions: Interaction[];
  opportunities: Opportunity[];
  stageHistory: StageHistoryEntry[];
  tasks: Task[];
  importMappings: ImportMappingTemplate[];
  sessionUserId: string | null;
}

// Bumped from v4 so any locally persisted mock DB is discarded and the app
// re-seeds with deals carrying the configured currency (VITE_DEFAULT_CURRENCY)
// instead of a hardcoded USD, keeping the demo data in step with the totals and
// labels derived from `env.defaultCurrency`.
//
// The key is also suffixed with the resolved currency: seeded deals persist that
// currency, so reusing a store written under a different one would render a mix
// of symbols (for example "$" on the cards against "€" on the board totals) that
// a version bump alone cannot clear once the data is already on disk.
const STORAGE_KEY = `custotal-db-v5-${env.defaultCurrency}`;

let db: DB | null = null;

export function getDB(): DB {
  if (db) return db;

  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    db = JSON.parse(raw) as DB;
    // Backfill fields added after a version was already persisted.
    if (!Array.isArray(db.importMappings)) db.importMappings = [];
    return db;
  }

  db = createSeed();
  persist();
  return db;
}

export function persist(): void {
  if (db) localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

export function resetDB(): void {
  db = createSeed();
  persist();
}
