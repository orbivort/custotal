import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { ACCOUNTS } from '../../fixtures/demo-ids.ts';
import { seedDemoWorkspace } from '../../fixtures/demo-workspace.ts';
import { app } from '../../support/app.ts';
import { authedAgent } from '../../support/auth.ts';

describe('RBAC enforcement', () => {
  beforeAll(() => seedDemoWorkspace());

  it('blocks unauthenticated access to protected resources', async () => {
    await request(app).get('/api/contacts').expect(401);
    await request(app).get('/api/opportunities').expect(401);
  });

  it('denies writes for read-only users with 403', async () => {
    const agent = await authedAgent('riley@example.com');
    await agent
      .post('/api/contacts')
      .send({ firstName: 'Read', lastName: 'Only', email: 'ro@x.io' })
      .expect(403);
    await agent.delete(`/api/accounts/${ACCOUNTS.acme}`).expect(403);
  });

  it('allows reps to create contacts', async () => {
    const agent = await authedAgent('alex@example.com');
    const res = await agent
      .post('/api/contacts')
      .send({ firstName: 'Frank', lastName: 'Reader', email: 'frank@x.io' })
      .expect(201);
    expect(res.body.email).toBe('frank@x.io');
  });

  it('scopes opportunities to the owner (rep) but not manager/admin/readonly', async () => {
    const rep = await authedAgent('alex@example.com');
    const manager = await authedAgent('dana@example.com');
    const readonly = await authedAgent('riley@example.com');
    expect((await rep.get('/api/opportunities').expect(200)).body.total).toBe(5);
    expect((await manager.get('/api/opportunities').expect(200)).body.total).toBe(7);
    expect((await readonly.get('/api/opportunities').expect(200)).body.total).toBe(7);
  });

  it('reserves admin routes for admins', async () => {
    const rep = await authedAgent('alex@example.com');
    await rep.get('/api/admin/trash').expect(403);
    await rep
      .post('/api/admin/users')
      .send({ name: 'x', email: 'x@x.io', role: 'rep' })
      .expect(403);
    const admin = await authedAgent('sam@example.com');
    const trash = await admin.get('/api/admin/trash').expect(200);
    expect(Array.isArray(trash.body.contacts)).toBe(true);
  });
});
