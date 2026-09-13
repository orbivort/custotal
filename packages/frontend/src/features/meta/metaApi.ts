// Shared bootstrap metadata API: /api/meta and /api/stages.
import { api } from '../../lib/api';
import type { Stage, User } from '../../types/domain';

export interface AccountMeta {
  id: string;
  name: string;
  ownerId: string;
}

export interface MetaPayload {
  users: User[];
  stages: Stage[];
  accounts: AccountMeta[];
}

export async function fetchMeta(): Promise<MetaPayload> {
  return api.get<MetaPayload>('/api/meta');
}

export async function fetchStages(): Promise<Stage[]> {
  return api.get<Stage[]>('/api/stages');
}

export interface EnsureStagesResult {
  /** True when the call created the default pipeline. */
  created: boolean;
  /** The configured pipeline after the call, in display order. */
  items: Stage[];
}

/**
 * Provisions the default pipeline on first access. Idempotent server-side: an
 * already-configured pipeline is returned unchanged.
 */
export async function ensureStages(): Promise<EnsureStagesResult> {
  return api.post<EnsureStagesResult>('/api/stages/ensure');
}
