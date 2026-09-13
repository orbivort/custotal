// Reports API: owns the /api/reports endpoints.
import { api, toQueryString } from '../../lib/api';
import type { PipelineReportPayload, WinLossReportPayload } from '../../types/domain';

export interface ReportRangeParams {
  owner?: string;
  /** Inclusive date-only lower bound (YYYY-MM-DD). */
  from?: string;
  /** Inclusive date-only upper bound (YYYY-MM-DD). */
  to?: string;
}

export async function fetchPipelineReport(
  params: ReportRangeParams = {},
): Promise<PipelineReportPayload> {
  return api.get<PipelineReportPayload>(`/api/reports/pipeline${toQueryString(params)}`);
}

export async function fetchWinLossReport(
  params: ReportRangeParams = {},
): Promise<WinLossReportPayload> {
  return api.get<WinLossReportPayload>(`/api/reports/winloss${toQueryString(params)}`);
}
