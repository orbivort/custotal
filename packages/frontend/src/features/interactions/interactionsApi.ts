// Interactions API: owns /api/interactions endpoints.
import { api, toQueryString } from '../../lib/api';
import type {
  Interaction,
  InteractionDirection,
  InteractionType,
  PaginatedResult,
} from '../../types/domain';

export interface InteractionListParams {
  contactId?: string;
  accountId?: string;
  opportunityId?: string;
  page?: number;
  pageSize?: number;
}

/** Writable fields for logging an interaction. */
export interface InteractionInput {
  type?: InteractionType;
  dateTime?: string;
  channel?: string;
  direction?: InteractionDirection;
  summary: string;
  contactId: string;
  accountId?: string;
  opportunityId?: string;
  taskId?: string;
  responsibleUserId?: string;
}

export async function listInteractions(
  params: InteractionListParams,
): Promise<PaginatedResult<Interaction>> {
  return api.get<PaginatedResult<Interaction>>(`/api/interactions${toQueryString(params)}`);
}

export async function createInteraction(input: InteractionInput): Promise<Interaction> {
  return api.post<Interaction>('/api/interactions', input);
}

/**
 * Updates an interaction. The server compares `updatedAt` for optimistic
 * concurrency (409 conflict when another user edited the record first).
 */
export async function updateInteraction(
  id: string,
  input: InteractionInput & { updatedAt: string },
): Promise<Interaction> {
  return api.patch<Interaction>(`/api/interactions/${id}`, input);
}

/** Soft-deletes an interaction (admin/manager, or the author/responsible user). */
export async function deleteInteraction(id: string): Promise<void> {
  await api.del<{ ok: boolean }>(`/api/interactions/${id}`);
}
