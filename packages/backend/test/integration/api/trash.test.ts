import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNTS, CONTACTS, USERS } from '../../fixtures/demo-ids.ts';
import { seedDemoWorkspace } from '../../fixtures/demo-workspace.ts';
import { authedAgent } from '../../support/auth.ts';

describe('contacts & accounts list polish (sort + letter)', () => {
  beforeAll(() => seedDemoWorkspace());

  it('sorts contacts by last name asc and desc', async () => {
    const agent = await authedAgent('alex@example.com');
    const [a, b, c] = await Promise.all([
      agent
        .post('/api/contacts')
        .send({ firstName: 'Sort', lastName: 'Zulu', email: 'zulu@example.com' })
        .expect(201),
      agent
        .post('/api/contacts')
        .send({ firstName: 'Sort', lastName: 'Alpha', email: 'alpha@example.com' })
        .expect(201),
      agent
        .post('/api/contacts')
        .send({ firstName: 'Sort', lastName: 'Mike', email: 'mike@example.com' })
        .expect(201),
    ]);
    const lastNames = (res: request.Response) =>
      (res.body.items as { id: string; lastName: string }[]).map((c) => c.id);

    const asc = await agent.get('/api/contacts?sort=name&pageSize=100').expect(200);
    const ascIds = lastNames(asc);
    const iZulu = ascIds.indexOf(a.body.id);
    const iAlpha = ascIds.indexOf(b.body.id);
    const iMike = ascIds.indexOf(c.body.id);
    expect(iAlpha).toBeLessThan(iMike);
    expect(iMike).toBeLessThan(iZulu);

    const desc = await agent.get('/api/contacts?sort=name_desc&pageSize=100').expect(200);
    const descIds = lastNames(desc);
    expect(descIds.indexOf(a.body.id)).toBeLessThan(descIds.indexOf(b.body.id));
  });

  it('filters contacts by first letter of the last name', async () => {
    const agent = await authedAgent('alex@example.com');
    const res = await agent.get('/api/contacts?letter=b&pageSize=100').expect(200);
    expect(res.body.total).toBeGreaterThan(0);
    for (const item of res.body.items as { lastName: string }[]) {
      expect(item.lastName.toLowerCase()).toMatch(/^b/);
    }
  });

  it('ignores invalid letter filters', async () => {
    const agent = await authedAgent('alex@example.com');
    const all = await agent.get('/api/contacts?pageSize=100').expect(200);
    const bad = await agent.get('/api/contacts?letter=AB&pageSize=100').expect(200);
    expect(bad.body.total).toBe(all.body.total);
  });

  it('sorts accounts by name asc and desc', async () => {
    const agent = await authedAgent('alex@example.com');
    await agent.post('/api/accounts').send({ name: 'Zeta Sorting Corp' }).expect(201);
    await agent.post('/api/accounts').send({ name: 'Alpha Sorting Corp' }).expect(201);
    const asc = await agent.get('/api/accounts?sort=name&pageSize=100').expect(200);
    const names = (asc.body.items as { name: string }[]).map((a) => a.name);
    expect(names.indexOf('Alpha Sorting Corp')).toBeLessThan(names.indexOf('Zeta Sorting Corp'));

    const desc = await agent.get('/api/accounts?sort=name_desc&pageSize=100').expect(200);
    const namesDesc = (desc.body.items as { name: string }[]).map((a) => a.name);
    expect(namesDesc.indexOf('Zeta Sorting Corp')).toBeLessThan(
      namesDesc.indexOf('Alpha Sorting Corp'),
    );
  });

  it('filters accounts by first letter of the name', async () => {
    const agent = await authedAgent('alex@example.com');
    const res = await agent.get('/api/accounts?letter=Z&pageSize=100').expect(200);
    expect(res.body.total).toBeGreaterThan(0);
    for (const item of res.body.items as { name: string }[]) {
      expect(item.name.toLowerCase()).toMatch(/^z/);
    }
  });
});

describe('trash & recovery for opportunities, tasks, interactions (FR-CC-05)', () => {
  beforeAll(() => seedDemoWorkspace());

  it('restores a soft-deleted opportunity', async () => {
    const agent = await authedAgent('alex@example.com');
    const opp = await agent
      .post('/api/opportunities')
      .send({ name: 'Trash Deal', accountId: ACCOUNTS.acme, valueMinor: 1000 })
      .expect(201);
    await agent.delete(`/api/opportunities/${opp.body.id}`).expect(200);
    await agent.get(`/api/opportunities/${opp.body.id}`).expect(404);

    const admin = await authedAgent('sam@example.com');
    const trash = await admin.get('/api/admin/trash').expect(200);
    expect(trash.body.opportunities.some((o: { id: string }) => o.id === opp.body.id)).toBe(true);

    const restored = await admin
      .post(`/api/admin/trash/opportunities/${opp.body.id}/restore`)
      .expect(200);
    expect(restored.body.id).toBe(opp.body.id);
    await agent.get(`/api/opportunities/${opp.body.id}`).expect(200);
  });

  it('blocks purging an opportunity that still has linked records', async () => {
    const agent = await authedAgent('alex@example.com');
    const opp = await agent
      .post('/api/opportunities')
      .send({ name: 'Purge Blocked Deal', accountId: ACCOUNTS.acme, valueMinor: 500 })
      .expect(201);
    await agent
      .post('/api/interactions')
      .send({
        contactId: CONTACTS.laura,
        opportunityId: opp.body.id,
        type: 'note',
        summary: 'Linked note',
      })
      .expect(201);
    await agent.delete(`/api/opportunities/${opp.body.id}`).expect(200);

    const admin = await authedAgent('sam@example.com');
    const res = await admin.delete(`/api/admin/trash/opportunities/${opp.body.id}`).expect(409);
    expect(res.body.error.code).toBe('in_use');
  });

  it('restores and purges a soft-deleted task with history intact', async () => {
    const agent = await authedAgent('alex@example.com');
    const task = await agent.post('/api/tasks').send({ title: 'Trash task' }).expect(201);
    await agent.post(`/api/tasks/${task.body.id}/complete`).expect(200);
    await agent.post(`/api/tasks/${task.body.id}/reopen`).expect(200);
    await agent.delete(`/api/tasks/${task.body.id}`).expect(200);

    const admin = await authedAgent('sam@example.com');
    const trash = await admin.get('/api/admin/trash').expect(200);
    expect(trash.body.tasks.some((t: { id: string }) => t.id === task.body.id)).toBe(true);

    await admin.post(`/api/admin/trash/tasks/${task.body.id}/restore`).expect(200);
    const completions = await agent.get(`/api/tasks/${task.body.id}/completions`).expect(200);
    expect(completions.body.total).toBe(1);

    // Restore kept the record; now purge it for real (no linked interactions).
    await agent.delete(`/api/tasks/${task.body.id}`).expect(200);
    await admin.delete(`/api/admin/trash/tasks/${task.body.id}`).expect(200);
  });

  it('blocks purging a task that still has linked interactions', async () => {
    const agent = await authedAgent('alex@example.com');
    const task = await agent.post('/api/tasks').send({ title: 'Linked task' }).expect(201);
    await agent
      .post('/api/interactions')
      .send({
        contactId: CONTACTS.laura,
        taskId: task.body.id,
        type: 'note',
        summary: 'About the task',
      })
      .expect(201);
    await agent.delete(`/api/tasks/${task.body.id}`).expect(200);

    const admin = await authedAgent('sam@example.com');
    const res = await admin.delete(`/api/admin/trash/tasks/${task.body.id}`).expect(409);
    expect(res.body.error.code).toBe('in_use');
  });

  it('restores and purges a soft-deleted interaction', async () => {
    const agent = await authedAgent('alex@example.com');
    const interaction = await agent
      .post('/api/interactions')
      .send({ contactId: CONTACTS.laura, type: 'call', direction: 'outbound', summary: 'Trash me' })
      .expect(201);
    await agent.delete(`/api/interactions/${interaction.body.id}`).expect(200);

    const admin = await authedAgent('sam@example.com');
    const trash = await admin.get('/api/admin/trash').expect(200);
    expect(trash.body.interactions.some((i: { id: string }) => i.id === interaction.body.id)).toBe(
      true,
    );

    await admin.post(`/api/admin/trash/interactions/${interaction.body.id}/restore`).expect(200);
    await agent.delete(`/api/interactions/${interaction.body.id}`).expect(200);
    await admin.delete(`/api/admin/trash/interactions/${interaction.body.id}`).expect(200);
  });

  it('rejects trash operations for non-admin users', async () => {
    const agent = await authedAgent('alex@example.com');
    // Signed-in non-admins get 403 forbidden "Administrator access required.".
    await agent.get('/api/admin/trash').expect(403);
    await agent
      .post('/api/admin/trash/opportunities/00000000-0000-4000-8000-000000000000/restore')
      .expect(403);
  });
});

describe('task completion history endpoint (FR-TA-03)', () => {
  beforeAll(() => seedDemoWorkspace());

  it('returns retained completions newest first after complete/reopen cycles', async () => {
    const agent = await authedAgent('alex@example.com');
    const task = await agent.post('/api/tasks').send({ title: 'History task' }).expect(201);
    await agent.post(`/api/tasks/${task.body.id}/complete`).expect(200);
    await agent.post(`/api/tasks/${task.body.id}/reopen`).expect(200);
    await agent.post(`/api/tasks/${task.body.id}/complete`).expect(200);

    const res = await agent.get(`/api/tasks/${task.body.id}/completions`).expect(200);
    expect(res.body.total).toBe(2);
    const times = (res.body.items as { completedAt: string }[]).map((c) => c.completedAt);
    expect(new Date(times[0]).getTime()).toBeGreaterThanOrEqual(new Date(times[1]).getTime());
    for (const item of res.body.items as { completedBy: string }[]) {
      expect(item.completedBy).toBe(USERS.alex);
    }
  });
});
