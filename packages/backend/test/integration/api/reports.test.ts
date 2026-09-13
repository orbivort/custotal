import { beforeAll, describe, expect, it } from 'vitest';
import { STAGES } from '../../fixtures/demo-ids.ts';
import { seedDemoWorkspace } from '../../fixtures/demo-workspace.ts';
import { authedAgent } from '../../support/auth.ts';

describe('reports', () => {
  beforeAll(() => seedDemoWorkspace());

  it('pipeline-by-stage reconciles to the visible opportunity totals', async () => {
    const rep = await authedAgent('alex@example.com');
    const repReport = await rep.get('/api/reports/pipeline').expect(200);
    const repTotal = repReport.body.rows.reduce(
      (s: number, r: { count: number }) => s + r.count,
      0,
    );
    expect(repTotal).toBe(5);

    const manager = await authedAgent('dana@example.com');
    const managerReport = await manager.get('/api/reports/pipeline').expect(200);
    const managerTotal = managerReport.body.rows.reduce(
      (s: number, r: { count: number }) => s + r.count,
      0,
    );
    expect(managerTotal).toBe(7);
    expect(Array.isArray(managerReport.body.rows)).toBe(true);
  });

  it('computes weighted value as value x probability', async () => {
    const agent = await authedAgent('dana@example.com');
    const res = await agent.get('/api/reports/pipeline').expect(200);
    const row = res.body.rows.find((r: { stageId: string }) => r.stageId === STAGES.proposal);
    // seed: Alpha $240,000 at 50% and Echo $730,000 at 50%
    expect(row.weightedValue).toBe(
      Math.round((24000000 * 50) / 100) + Math.round((73000000 * 50) / 100),
    );
  });

  it('win/loss report counts and reasons are correct', async () => {
    const agent = await authedAgent('dana@example.com');
    const res = await agent.get('/api/reports/winloss').expect(200);
    expect(res.body).toMatchObject({ wonCount: 1, lostCount: 1, winRate: 50 });
    expect(res.body.lossReasons).toContainEqual({
      reason: 'Budget reallocated to a competing initiative.',
      count: 1,
    });
  });

  it('respects RBAC scoping for a rep', async () => {
    const agent = await authedAgent('alex@example.com');
    const res = await agent.get('/api/reports/winloss').expect(200);
    // Alex owns both the won (Foxtrot) and the lost (Bravo Pilot) deals.
    expect(res.body).toMatchObject({ wonCount: 1, lostCount: 1 });
  });
});
