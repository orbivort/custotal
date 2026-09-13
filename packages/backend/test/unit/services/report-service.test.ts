// Unit tests for the reporting service (FR-RA-01/02/03).
// Pure unit tests: the Prisma client is mocked at the module boundary, no
// database is required. The real `parseDateOnly` helper is exercised so the
// date-only range filter semantics are covered for real.
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the Prisma singleton before importing the service under test.
vi.mock('../../../src/db.ts', () => ({
  prisma: {
    opportunity: {
      findMany: vi.fn(),
    },
    stage: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from '../../../src/db.ts';
import type { User } from '../../../src/types/domain.ts';
import { pipelineReport, winLossReport } from '../../../src/services/report-service.ts';

// Structurally-typed view over the mocked prisma for ergonomic assertions.
interface PrismaMock {
  opportunity: { findMany: ReturnType<typeof vi.fn> };
  stage: { findMany: ReturnType<typeof vi.fn> };
}

const db = prisma as unknown as PrismaMock;

const admin: User = { id: 'user-1', name: 'Alice', email: 'alice@example.com', role: 'admin' };
const manager: User = { id: 'user-2', name: 'Bob', email: 'bob@example.com', role: 'manager' };
const readonlyUser: User = {
  id: 'user-3',
  name: 'Carol',
  email: 'carol@example.com',
  role: 'readonly',
};
const rep: User = { id: 'user-4', name: 'Dave', email: 'dave@example.com', role: 'rep' };

// Opportunity rows as returned by `loadOpportunities`' select clause.
interface OppRow {
  stageId: string;
  valueMinor: number;
  probability: number;
  ownerId: string;
  lossReason: string | null;
}

function opp(overrides: Partial<OppRow> = {}): OppRow {
  return {
    stageId: 'stage-open',
    valueMinor: 10_000,
    probability: 50,
    ownerId: 'user-1',
    lossReason: null,
    ...overrides,
  };
}

const stages = [
  {
    id: 'stage-qual',
    name: 'Qualification',
    order: 1,
    winProbability: 10,
    classification: 'open' as const,
  },
  {
    id: 'stage-proposal',
    name: 'Proposal',
    order: 2,
    winProbability: 60,
    classification: 'open' as const,
  },
  { id: 'stage-won', name: 'Won', order: 3, winProbability: 100, classification: 'won' as const },
  { id: 'stage-lost', name: 'Lost', order: 4, winProbability: 0, classification: 'lost' as const },
];

beforeEach(() => {
  vi.clearAllMocks();
  db.stage.findMany.mockResolvedValue(stages);
  db.opportunity.findMany.mockResolvedValue([]);
});

describe('pipelineReport', () => {
  it('groups opportunities per stage and returns count, totalValue and weightedValue', async () => {
    db.opportunity.findMany.mockResolvedValue([
      opp({ stageId: 'stage-qual', valueMinor: 100_000, probability: 10, ownerId: 'user-4' }),
      opp({ stageId: 'stage-proposal', valueMinor: 50_000, probability: 60, ownerId: 'user-4' }),
      opp({ stageId: 'stage-proposal', valueMinor: 25_000, probability: 40, ownerId: 'user-4' }),
      opp({ stageId: 'stage-won', valueMinor: 33_333, probability: 100, ownerId: 'user-4' }),
    ]);

    const result = await pipelineReport(rep, {});

    expect(result.rows).toEqual([
      {
        stageId: 'stage-qual',
        stageName: 'Qualification',
        count: 1,
        totalValue: 100_000,
        weightedValue: 10_000,
      },
      // 50_000*0.6 = 30_000; 25_000*0.4 = 10_000 -> weighted 40_000
      {
        stageId: 'stage-proposal',
        stageName: 'Proposal',
        count: 2,
        totalValue: 75_000,
        weightedValue: 40_000,
      },
      {
        stageId: 'stage-won',
        stageName: 'Won',
        count: 1,
        totalValue: 33_333,
        weightedValue: 33_333,
      },
      { stageId: 'stage-lost', stageName: 'Lost', count: 0, totalValue: 0, weightedValue: 0 },
    ]);
  });

  it('rounds each weighted contribution to the nearest integer (banker-unaware rounding)', async () => {
    // 10_001 * 33 / 100 = 3300.33 -> 3300; 10_001 * 66 / 100 = 6600.66 -> 6601
    db.opportunity.findMany.mockResolvedValue([
      opp({ stageId: 'stage-qual', valueMinor: 10_001, probability: 33 }),
      opp({ stageId: 'stage-qual', valueMinor: 10_001, probability: 66 }),
    ]);

    const result = await pipelineReport(admin, {});

    expect(result.rows[0].weightedValue).toBe(3300 + 6601);
  });

  it('requests stages ordered by `order` ascending', async () => {
    await pipelineReport(admin, {});

    expect(db.stage.findMany).toHaveBeenCalledWith({ orderBy: { order: 'asc' } });
  });

  it('returns an empty rows list when there are no stages', async () => {
    db.stage.findMany.mockResolvedValue([]);

    const result = await pipelineReport(admin, {});

    expect(result).toEqual({ rows: [] });
  });

  it('scopes a rep to their own opportunities even when an owner filter is passed (FR-RA-01)', async () => {
    await pipelineReport(rep, { owner: 'user-1' });

    expect(db.opportunity.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null, ownerId: rep.id },
      select: {
        stageId: true,
        valueMinor: true,
        probability: true,
        ownerId: true,
        lossReason: true,
      },
    });
  });

  it('returns everything for admin/manager/readonly without an owner filter', async () => {
    for (const user of [admin, manager, readonlyUser]) {
      db.opportunity.findMany.mockClear();
      await pipelineReport(user, {});

      expect(db.opportunity.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
        select: {
          stageId: true,
          valueMinor: true,
          probability: true,
          ownerId: true,
          lossReason: true,
        },
      });
    }
  });

  it('honours an explicit owner filter for privileged roles', async () => {
    await pipelineReport(manager, { owner: 'user-4' });

    expect(db.opportunity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null, ownerId: 'user-4' },
      }),
    );
  });

  it('applies the to bound; NOTE: both bounds collapse — `to` overwrites `from` (likely source bug)', async () => {
    // The source spreads two `expectedCloseDate` keys, so the `to` bound
    // replaces the `from` bound instead of merging `gte`/`lte`. This test pins
    // the CURRENT behaviour; if the source is fixed to a merged
    // `{ gte, lte }` range, update this expectation.
    await pipelineReport(admin, { from: '2026-01-01', to: '2026-03-31' });

    expect(db.opportunity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          expectedCloseDate: { lte: new Date('2026-03-31T00:00:00.000Z') },
        },
      }),
    );
  });

  it('applies only the `from` bound when `to` is omitted', async () => {
    await pipelineReport(admin, { from: '2026-01-01' });

    const args = db.opportunity.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(args.where.expectedCloseDate).toEqual({ gte: new Date('2026-01-01T00:00:00.000Z') });
  });

  it('applies only the `to` bound when `from` is omitted', async () => {
    await pipelineReport(admin, { to: '2026-03-31' });

    const args = db.opportunity.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(args.where.expectedCloseDate).toEqual({ lte: new Date('2026-03-31T00:00:00.000Z') });
  });

  it('sends { gte: null } for an invalid date-only string (NOTE: likely source bug — should skip the filter)', async () => {
    // `parseDateOnly('not-a-date')` returns null, but the source still emits
    // `{ expectedCloseDate: { gte: null } }`. Pin the CURRENT behaviour.
    await pipelineReport(admin, { from: 'not-a-date' });

    const args = db.opportunity.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(args.where.expectedCloseDate).toEqual({ gte: null });
  });
});

describe('winLossReport', () => {
  it('classifies closed opportunities and computes win rate and values', async () => {
    db.opportunity.findMany.mockResolvedValue([
      opp({ stageId: 'stage-won', valueMinor: 120_000, ownerId: 'user-1' }),
      opp({ stageId: 'stage-won', valueMinor: 80_000, ownerId: 'user-1' }),
      opp({ stageId: 'stage-lost', valueMinor: 50_000, lossReason: 'Price', ownerId: 'user-1' }),
      opp({ stageId: 'stage-qual', valueMinor: 999_999, ownerId: 'user-1' }), // open → excluded
    ]);

    const result = await winLossReport(admin, {});

    expect(result).toEqual({
      wonCount: 2,
      lostCount: 1,
      wonValue: 200_000,
      lostValue: 50_000,
      winRate: 67, // round(2/3 * 100)
      lossReasons: [{ reason: 'Price', count: 1 }],
    });
  });

  it('returns winRate 0 when nothing is closed', async () => {
    db.opportunity.findMany.mockResolvedValue([opp({ stageId: 'stage-qual' })]);

    const result = await winLossReport(admin, {});

    expect(result.winRate).toBe(0);
    expect(result.wonCount).toBe(0);
    expect(result.lostCount).toBe(0);
  });

  it('treats opportunities in unknown stages as open (no classification found)', async () => {
    db.opportunity.findMany.mockResolvedValue([opp({ stageId: 'stage-ghost', valueMinor: 1 })]);

    const result = await winLossReport(admin, {});

    expect(result.wonCount).toBe(0);
    expect(result.lostCount).toBe(0);
    expect(result.lossReasons).toEqual([]);
  });

  it('aggregates loss reasons, defaulting blank reasons to "Not specified"', async () => {
    db.opportunity.findMany.mockResolvedValue([
      opp({ stageId: 'stage-lost', lossReason: 'Price' }),
      opp({ stageId: 'stage-lost', lossReason: 'Price' }),
      opp({ stageId: 'stage-lost', lossReason: '  Competitor  ' }),
      opp({ stageId: 'stage-lost', lossReason: null }),
      opp({ stageId: 'stage-lost', lossReason: '   ' }),
    ]);

    const result = await winLossReport(admin, {});

    expect(result.lostCount).toBe(5);
    expect(result.winRate).toBe(0);
    // Insertion order of the Map is preserved.
    expect(result.lossReasons).toEqual([
      { reason: 'Price', count: 2 },
      { reason: 'Competitor', count: 1 },
      { reason: 'Not specified', count: 2 },
    ]);
  });

  it('does not force an orderBy on stages (plain findMany)', async () => {
    await winLossReport(admin, {});

    expect(db.stage.findMany).toHaveBeenCalledWith();
  });

  it('scopes a rep to their own opportunities even when an owner filter is passed (FR-RA-01)', async () => {
    await winLossReport(rep, { owner: 'user-1' });

    expect(db.opportunity.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null, ownerId: rep.id },
      select: {
        stageId: true,
        valueMinor: true,
        probability: true,
        ownerId: true,
        lossReason: true,
      },
    });
  });

  it('honours the owner filter for privileged roles', async () => {
    await winLossReport(readonlyUser, { owner: 'user-2' });

    expect(db.opportunity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null, ownerId: 'user-2' },
      }),
    );
  });

  it('applies the to bound; NOTE: both bounds collapse — `to` overwrites `from` (likely source bug)', async () => {
    await winLossReport(admin, { from: '2026-01-01', to: '2026-06-30' });

    expect(db.opportunity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          expectedCloseDate: { lte: new Date('2026-06-30T00:00:00.000Z') },
        },
        select: {
          stageId: true,
          valueMinor: true,
          probability: true,
          ownerId: true,
          lossReason: true,
        },
      }),
    );
  });
});
