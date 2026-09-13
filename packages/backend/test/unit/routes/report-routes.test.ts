// Unit tests for the report routes (FR-CC-13). Pure unit tests: the service
// layer is mocked and Prisma is stubbed so the real auth gate loads without a
// database. Focus is on the shared owner/from/to range parsing.
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/db.ts', () => ({
  prisma: { session: { findFirst: vi.fn(), update: vi.fn() } },
}));

vi.mock('../../../src/services/report-service.ts', () => ({
  pipelineReport: vi.fn(),
  winLossReport: vi.fn(),
}));

import * as reportService from '../../../src/services/report-service.ts';
import { requireUser } from '../../../src/middleware/auth.ts';
import { reportRouter } from '../../../src/routes/report-routes.ts';
import { call, routerGuards } from '../../support/mocks/router.ts';
import type { User } from '../../../src/types/domain.ts';

const service = reportService as unknown as Record<keyof typeof reportService, Mock>;

const user: User = { id: 'user-1', name: 'Alice', email: 'alice@example.com', role: 'manager' };
const pipeline = { stages: [], totalValueMinor: 0 };
const winLoss = { won: 3, lost: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  service.pipelineReport.mockResolvedValue(pipeline);
  service.winLossReport.mockResolvedValue(winLoss);
});

describe('route guards', () => {
  it('requires an authenticated user for every report route', () => {
    expect(routerGuards(reportRouter)).toContain(requireUser);
  });
});

describe('GET /api/reports/pipeline', () => {
  it('passes the caller and the parsed range to the service', async () => {
    const { res, done } = call(reportRouter, 'get', '/pipeline', {
      user,
      query: { owner: 'user-1', from: '2026-01-01', to: '2026-03-31' },
    });
    await done;

    expect(service.pipelineReport).toHaveBeenCalledWith(user, {
      owner: 'user-1',
      from: '2026-01-01',
      to: '2026-03-31',
    });
    expect(res.body).toBe(pipeline);
  });

  it('sends an empty range when the query string is empty', async () => {
    const { done } = call(reportRouter, 'get', '/pipeline', { user });
    await done;

    expect(service.pipelineReport).toHaveBeenCalledWith(user, {
      owner: undefined,
      from: undefined,
      to: undefined,
    });
  });

  it('ignores non-string range values', async () => {
    const { done } = call(reportRouter, 'get', '/pipeline', {
      user,
      query: { owner: ['a', 'b'], from: 2026, to: null },
    });
    await done;

    expect(service.pipelineReport).toHaveBeenCalledWith(user, {
      owner: undefined,
      from: undefined,
      to: undefined,
    });
  });
});

describe('GET /api/reports/winloss', () => {
  it('passes the caller and the parsed range to the service', async () => {
    const { res, done } = call(reportRouter, 'get', '/winloss', {
      user,
      query: { owner: 'user-2', from: '2026-01-01', to: '2026-06-30' },
    });
    await done;

    expect(service.winLossReport).toHaveBeenCalledWith(user, {
      owner: 'user-2',
      from: '2026-01-01',
      to: '2026-06-30',
    });
    expect(res.body).toBe(winLoss);
  });

  it('propagates service failures to the error handler', async () => {
    const failure = new Error('database unavailable');
    service.winLossReport.mockRejectedValue(failure);
    const { res, done } = call(reportRouter, 'get', '/winloss', { user });

    await expect(done).rejects.toBe(failure);
    expect(res.body).toBeUndefined();
  });
});
