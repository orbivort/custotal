// Unit tests for the reports API service.
//
// Only the HTTP transport (`lib/api`.api) is mocked: every test asserts the
// path and query string a function sends, plus that the decoded payload is
// returned untouched. `toQueryString` is kept real so the filter-serialization
// contract (empty values dropped, values encoded) is exercised end to end
// rather than re-implemented in a stub.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PipelineReportPayload, WinLossReportPayload } from '../../types/domain';
import { fetchPipelineReport, fetchWinLossReport } from './reportsApi';

const h = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return { toQueryString: actual.toQueryString, api: { get: h.get } };
});

const PIPELINE: PipelineReportPayload = {
  rows: [
    { stageId: 's1', stageName: 'Discovery', count: 3, totalValue: 150000, weightedValue: 30000 },
    { stageId: 's2', stageName: 'Proposal', count: 1, totalValue: 50000, weightedValue: 30000 },
  ],
};

const WINLOSS: WinLossReportPayload = {
  wonCount: 4,
  lostCount: 6,
  wonValue: 400000,
  lostValue: 600000,
  winRate: 40,
  lossReasons: [
    { reason: 'Price', count: 4 },
    { reason: 'Timing', count: 2 },
  ],
};

describe('reportsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.get.mockResolvedValue(PIPELINE);
  });

  describe('fetchPipelineReport', () => {
    it('requests the bare pipeline path when no range is supplied', async () => {
      const result = await fetchPipelineReport();

      expect(h.get).toHaveBeenCalledWith('/api/reports/pipeline');
      expect(result).toBe(PIPELINE);
    });

    it('requests the bare path when an empty filter object is passed', async () => {
      await fetchPipelineReport({});

      expect(h.get).toHaveBeenCalledWith('/api/reports/pipeline');
    });

    it('serializes owner, from, and to in declaration order', async () => {
      await fetchPipelineReport({ owner: 'u1', from: '2026-01-01', to: '2026-03-31' });

      expect(h.get).toHaveBeenCalledWith(
        '/api/reports/pipeline?owner=u1&from=2026-01-01&to=2026-03-31',
      );
    });

    it('drops empty, null, and undefined filters so cleared UI state sends no param', async () => {
      await fetchPipelineReport({ owner: '', from: undefined, to: null as unknown as string });

      expect(h.get).toHaveBeenCalledWith('/api/reports/pipeline');
    });

    it('keeps the remaining filters when only some are cleared', async () => {
      await fetchPipelineReport({ owner: 'u2', from: '', to: '2026-12-31' });

      expect(h.get).toHaveBeenCalledWith('/api/reports/pipeline?owner=u2&to=2026-12-31');
    });

    it('percent-encodes owner ids containing reserved characters', async () => {
      await fetchPipelineReport({ owner: 'a&b c' });

      expect(h.get).toHaveBeenCalledWith('/api/reports/pipeline?owner=a%26b+c');
    });

    it('supports an open-ended range (from only)', async () => {
      await fetchPipelineReport({ from: '2026-01-01' });

      expect(h.get).toHaveBeenCalledWith('/api/reports/pipeline?from=2026-01-01');
    });

    it('propagates transport failures to the caller', async () => {
      h.get.mockRejectedValueOnce(new Error('unreachable'));

      await expect(fetchPipelineReport()).rejects.toThrow('unreachable');
    });

    it('propagates authorization failures without swallowing the message', async () => {
      h.get.mockRejectedValueOnce(new Error('Authentication required.'));

      await expect(fetchPipelineReport({ owner: 'u1' })).rejects.toThrow(
        'Authentication required.',
      );
    });
  });

  describe('fetchWinLossReport', () => {
    beforeEach(() => {
      h.get.mockResolvedValue(WINLOSS);
    });

    it('requests the bare win/loss path when no range is supplied', async () => {
      const result = await fetchWinLossReport();

      expect(h.get).toHaveBeenCalledWith('/api/reports/winloss');
      expect(result).toBe(WINLOSS);
    });

    it('serializes owner, from, and to in declaration order', async () => {
      await fetchWinLossReport({ owner: 'u1', from: '2026-01-01', to: '2026-03-31' });

      expect(h.get).toHaveBeenCalledWith(
        '/api/reports/winloss?owner=u1&from=2026-01-01&to=2026-03-31',
      );
    });

    it('drops empty filters so cleared UI state sends no param', async () => {
      await fetchWinLossReport({ owner: '', from: '', to: '' });

      expect(h.get).toHaveBeenCalledWith('/api/reports/winloss');
    });

    it('keeps the remaining filters when only some are cleared', async () => {
      await fetchWinLossReport({ owner: 'u2', from: '2026-01-01', to: '' });

      expect(h.get).toHaveBeenCalledWith('/api/reports/winloss?owner=u2&from=2026-01-01');
    });

    it('propagates transport failures to the caller', async () => {
      h.get.mockRejectedValueOnce(new Error('unreachable'));

      await expect(fetchWinLossReport()).rejects.toThrow('unreachable');
    });
  });
});
