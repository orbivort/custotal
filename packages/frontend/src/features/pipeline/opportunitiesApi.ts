// Opportunities API: owns every /api/opportunities* endpoint.
import { api, toQueryString } from '../../lib/api';
import type { ListResult, Opportunity, OpportunityDetail } from '../../types/domain';

export interface OpportunityListParams {
  owner?: string;
  stage?: string;
}

/** Writable fields for creating/updating an opportunity. */
export interface OpportunityInput {
  name?: string;
  contactId?: string;
  accountId?: string;
  valueMinor?: number;
  currency?: string;
  expectedCloseDate?: string;
  stageId?: string;
  probability?: number;
  probabilityManual?: boolean;
  ownerId?: string;
  description?: string;
  lossReason?: string;
}

/** Payload for POST /opportunities/:id/stage. */
export interface MoveStageInput {
  toStageId: string;
  probabilityChoice?: 'keep' | 'default';
  lossReason?: string;
}

export async function listOpportunities(
  params: OpportunityListParams = {},
): Promise<ListResult<Opportunity>> {
  return api.get<ListResult<Opportunity>>(`/api/opportunities${toQueryString(params)}`);
}

export async function getOpportunity(id: string): Promise<OpportunityDetail> {
  return api.get<OpportunityDetail>(`/api/opportunities/${id}`);
}

export async function createOpportunity(input: OpportunityInput): Promise<Opportunity> {
  return api.post<Opportunity>('/api/opportunities', input);
}

export async function updateOpportunity(id: string, input: OpportunityInput): Promise<Opportunity> {
  return api.patch<Opportunity>(`/api/opportunities/${id}`, input);
}

export async function deleteOpportunity(id: string): Promise<void> {
  await api.del<{ ok: true }>(`/api/opportunities/${id}`);
}

/** Moves an opportunity to another stage, recording history server-side. */
export async function moveOpportunityStage(
  id: string,
  input: MoveStageInput,
): Promise<Opportunity> {
  return api.post<Opportunity>(`/api/opportunities/${id}/stage`, input);
}
