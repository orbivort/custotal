import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import type { Stage, User } from '../../types/domain';
import { useQuery } from '../../lib/hooks';
import { fetchMeta, type AccountMeta, type MetaPayload } from './metaApi';

interface MetaValue {
  users: User[];
  stages: Stage[];
  accounts: AccountMeta[];
  openStages: Stage[];
  userName: (id?: string) => string;
  accountName: (id?: string) => string;
  stageName: (id?: string) => string;
  stageById: (id: string) => Stage | undefined;
  /** Re-fetches shared metadata after admin mutations. */
  refresh: () => Promise<void>;
}

const MetaContext = createContext<MetaValue | null>(null);

export function MetaProvider({ children }: { children: ReactNode }) {
  // Cached: remounting providers (login cycles, layout re-mounts) render the
  // last known metadata instantly and revalidate in the background.
  const { data, refetch } = useQuery<MetaPayload>(fetchMeta, [], { cacheKey: 'meta' });

  const refresh = useCallback(async () => {
    try {
      await refetch();
    } catch {
      // Keep the last known-good metadata if a refresh fails.
    }
  }, [refetch]);

  const value = useMemo<MetaValue>(() => {
    const users = data?.users ?? [];
    const stages = data?.stages ?? [];
    const accounts = data?.accounts ?? [];
    // Precompute Maps so per-row lookups across list pages are O(1) instead
    // of an Array.find scan per cell render.
    const userById = new Map(users.map((u) => [u.id, u]));
    const stageByIdMap = new Map(stages.map((s) => [s.id, s]));
    const accountById = new Map(accounts.map((a) => [a.id, a]));
    return {
      users,
      stages,
      accounts,
      openStages: stages.filter((s) => s.classification === 'open'),
      userName: (id) => (id === undefined ? 'Unknown' : (userById.get(id)?.name ?? 'Unknown')),
      accountName: (id) =>
        id === undefined ? 'Unknown' : (accountById.get(id)?.name ?? 'Unknown'),
      stageName: (id) => (id === undefined ? 'Unknown' : (stageByIdMap.get(id)?.name ?? 'Unknown')),
      stageById: (id) => stageByIdMap.get(id),
      refresh,
    };
  }, [data, refresh]);

  return <MetaContext.Provider value={value}>{children}</MetaContext.Provider>;
}

export function useMeta(): MetaValue {
  const ctx = useContext(MetaContext);
  if (!ctx) throw new Error('useMeta must be used within MetaProvider');
  return ctx;
}
