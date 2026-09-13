// CSV import wizard API: owns every /api/import endpoint.
import { api, toQueryString } from '../../../lib/api';
import type {
  DuplicatePolicy,
  ImportCommitSummary,
  ImportDryRunResult,
  ImportEntity,
  ImportMappingTemplate,
} from '../../../types/domain';

export async function listImportTemplates(entity?: ImportEntity): Promise<ImportMappingTemplate[]> {
  const res = await api.get<{ items: ImportMappingTemplate[] }>(
    `/api/import/templates${toQueryString({ entity })}`,
  );
  return res.items;
}

export interface TemplateInput {
  entity?: ImportEntity;
  name?: string;
  mapping?: Record<string, string>;
  ownerColumn?: string;
}

export async function saveImportTemplate(input: TemplateInput): Promise<ImportMappingTemplate> {
  return api.post<ImportMappingTemplate>('/api/import/templates', input);
}

export async function deleteImportTemplate(id: string): Promise<void> {
  await api.del<{ ok: true }>(`/api/import/templates/${id}`);
}

export async function importDryRun(
  entity: ImportEntity,
  records: Record<string, string>[],
): Promise<ImportDryRunResult> {
  return api.post<ImportDryRunResult>('/api/import/dry-run', { entity, records });
}

export async function importCommit(
  entity: ImportEntity,
  records: Record<string, string>[],
  duplicate: DuplicatePolicy,
): Promise<ImportCommitSummary> {
  return api.post<ImportCommitSummary>('/api/import/commit', { entity, records, duplicate });
}
