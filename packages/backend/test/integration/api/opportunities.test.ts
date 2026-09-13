import { beforeAll, describe, expect, it } from 'vitest';
import { OPPORTUNITIES, STAGES } from '../../fixtures/demo-ids.ts';
import { seedDemoWorkspace } from '../../fixtures/demo-workspace.ts';
import { authedAgent } from '../../support/auth.ts';

describe('opportunities & pipeline', () => {
  beforeAll(() => seedDemoWorkspace());

  it('requires an account on create', async () => {
    const agent = await authedAgent('alex@example.com');
    const res = await agent.post('/api/opportunities').send({ name: 'No account' }).expect(400);
    expect(res.body.error.details).toContainEqual({
      field: 'accountId',
      message: 'Account is required.',
    });
  });

  it('returns owner scoping and stage history on detail', async () => {
    const agent = await authedAgent('alex@example.com');
    const res = await agent.get(`/api/opportunities/${OPPORTUNITIES.acme}`).expect(200);
    expect(res.body).toMatchObject({
      id: OPPORTUNITIES.acme,
      stageId: STAGES.proposal,
      probability: 50,
    });
    expect(Array.isArray(res.body.history)).toBe(true);
    // hidden opportunities return 404 for non-owners
    const other = await authedAgent('morgan@example.com');
    await other.get(`/api/opportunities/${OPPORTUNITIES.acme}`).expect(404);
  });

  it('moves a stage: applies the stage default probability and appends history', async () => {
    const agent = await authedAgent('alex@example.com');
    const moved = await agent
      .post(`/api/opportunities/${OPPORTUNITIES.acme}/stage`)
      .send({ toStageId: STAGES.negotiation })
      .expect(200);
    expect(moved.body).toMatchObject({
      stageId: STAGES.negotiation,
      probability: 75,
      probabilityManual: false,
    });

    const detail = await agent.get(`/api/opportunities/${OPPORTUNITIES.acme}`).expect(200);
    expect(detail.body.history[0]).toMatchObject({
      fromStageId: STAGES.proposal,
      toStageId: STAGES.negotiation,
    });
  });

  it('keeps a manual probability when requested', async () => {
    const agent = await authedAgent('alex@example.com');
    const moved = await agent
      .post(`/api/opportunities/${OPPORTUNITIES.acme}/stage`)
      .send({ toStageId: STAGES.proposal, probabilityChoice: 'keep' })
      .expect(200);
    expect(moved.body).toMatchObject({
      stageId: STAGES.proposal,
      probability: 75,
      probabilityManual: true,
    });
  });

  it('prompts for and stores a loss reason when moving to Lost', async () => {
    const agent = await authedAgent('alex@example.com');
    const lost = await agent
      .post(`/api/opportunities/${OPPORTUNITIES.acme}/stage`)
      .send({ toStageId: STAGES.lost, lossReason: 'Underwater on price.' })
      .expect(200);
    expect(lost.body.lossReason).toBe('Underwater on price.');
    expect(lost.body.probability).toBe(0);
  });

  it('blocks reps from mutating opportunities they do not own', async () => {
    const agent = await authedAgent('morgan@example.com');
    await agent
      .post(`/api/opportunities/${OPPORTUNITIES.northwind}/stage`)
      .send({ toStageId: STAGES.won })
      .expect(403);
  });
});
