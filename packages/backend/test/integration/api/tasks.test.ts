import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../../src/db.ts';
import { TASKS, USERS } from '../../fixtures/demo-ids.ts';
import { seedDemoWorkspace } from '../../fixtures/demo-workspace.ts';
import { authedAgent } from '../../support/auth.ts';

describe('tasks', () => {
  beforeAll(() => seedDemoWorkspace());

  it('shows the header summary (due today / overdue)', async () => {
    const agent = await authedAgent('alex@example.com');
    const res = await agent.get('/api/tasks/summary').expect(200);
    expect(res.body).toMatchObject({ dueToday: 1, overdue: 1 });
  });

  it('filters My Tasks and supports related-type filters', async () => {
    const agent = await authedAgent('alex@example.com');
    const mine = await agent.get('/api/tasks?scope=mine').expect(200);
    expect(mine.body.total).toBe(5); // seed assigns 5 tasks to Alex
    const linkedToOpportunity = await agent.get('/api/tasks?related=opportunity').expect(200);
    expect(
      linkedToOpportunity.body.items.every((t: { opportunityId?: string }) =>
        Boolean(t.opportunityId),
      ),
    ).toBe(true);
  });

  it('completing a task sets metadata and retains history across reopen', async () => {
    const agent = await authedAgent('alex@example.com');
    const done = await agent.post(`/api/tasks/${TASKS.t2}/complete`).expect(200);
    expect(done.body).toMatchObject({ status: 'completed', completedBy: USERS.alex });
    expect(typeof done.body.completedAt).toBe('string');

    const reopened = await agent.post(`/api/tasks/${TASKS.t2}/reopen`).expect(200);
    expect(reopened.body.status).toBe('open');
    expect(reopened.body.completedAt).toBeUndefined();

    // Completion history is retained even though the task is open again (FR-TA-03).
    const events = await prisma.taskCompletion.count({ where: { taskId: TASKS.t2 } });
    expect(events).toBe(1);
  });

  it('does not allow a rep to complete another rep’s task', async () => {
    const agent = await authedAgent('alex@example.com');
    await agent.post(`/api/tasks/${TASKS.t4}/complete`).expect(403); // T4 is Morgan's
  });
});
