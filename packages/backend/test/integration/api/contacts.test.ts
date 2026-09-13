import { beforeAll, describe, expect, it } from 'vitest';
import { CONTACTS, OPPORTUNITIES, USERS } from '../../fixtures/demo-ids.ts';
import { seedDemoWorkspace } from '../../fixtures/demo-workspace.ts';
import { authedAgent } from '../../support/auth.ts';

describe('contacts', () => {
  beforeAll(() => seedDemoWorkspace());

  it('is visible to all authenticated roles', async () => {
    const agent = await authedAgent('riley@example.com');
    const res = await agent.get('/api/contacts?page=1&pageSize=1').expect(200);
    expect(res.body.total).toBeGreaterThan(0);
  });

  it('supports pagination and filtering', async () => {
    const agent = await authedAgent('alex@example.com');
    const page = await agent.get('/api/contacts?page=1&pageSize=5').expect(200);
    expect(page.body.total).toBe(8);
    expect(page.body.items).toHaveLength(5);
    const filtered = await agent.get('/api/contacts?q=laura').expect(200);
    expect(filtered.body.total).toBe(1);
  });

  it('creates a contact with audit metadata', async () => {
    const agent = await authedAgent('alex@example.com');
    const res = await agent
      .post('/api/contacts')
      .send({ firstName: 'Ada', lastName: 'Alpha', email: 'ada@example.com', phone: '+1 555 0100' })
      .expect(201);
    expect(res.body).toMatchObject({
      firstName: 'Ada',
      email: 'ada@example.com',
      status: 'active',
      accountLinks: [],
      createdBy: USERS.alex,
    });
    expect(typeof res.body.updatedAt).toBe('string');
  });

  it('rejects an invalid email with the exact field message', async () => {
    const agent = await authedAgent('alex@example.com');
    const res = await agent
      .post('/api/contacts')
      .send({ firstName: 'No', lastName: 'Email', email: 'not-an-email' })
      .expect(400);
    expect(res.body.error).toEqual({
      code: 'validation',
      message: 'Please correct the highlighted fields.',
      details: [{ field: 'email', message: 'Invalid email format.' }],
    });
  });

  it('requires at least one of email or phone', async () => {
    const agent = await authedAgent('alex@example.com');
    const res = await agent
      .post('/api/contacts')
      .send({ firstName: 'No', lastName: 'Contact' })
      .expect(400);
    expect(res.body.error.details).toContainEqual({
      field: 'phone',
      message: 'At least one of email or phone is required.',
    });
  });

  it('returns 409 on a concurrent update with a stale token', async () => {
    const agent = await authedAgent('alex@example.com');
    const created = await agent
      .post('/api/contacts')
      .send({ firstName: 'Con', lastName: 'Current', email: 'con@example.com' })
      .expect(201);
    const staleToken = created.body.updatedAt;

    await agent
      .patch(`/api/contacts/${created.body.id}`)
      .send({ firstName: 'Con', lastName: 'Edited', updatedAt: staleToken })
      .expect(200);

    const conflict = await agent
      .patch(`/api/contacts/${created.body.id}`)
      .send({ firstName: 'Con', lastName: 'TooLate', updatedAt: staleToken })
      .expect(409);
    expect(conflict.body.error.code).toBe('conflict');
  });

  it('soft-deletes contacts and lets admins restore them', async () => {
    const agent = await authedAgent('alex@example.com');
    const created = await agent
      .post('/api/contacts')
      .send({ firstName: 'Soft', lastName: 'Delete', email: 'soft@example.com' })
      .expect(201);
    await agent.delete(`/api/contacts/${created.body.id}`).expect(200);
    await agent.get(`/api/contacts/${created.body.id}`).expect(404);

    const admin = await authedAgent('sam@example.com');
    const trash = await admin.get('/api/admin/trash').expect(200);
    expect(trash.body.contacts.some((c: { id: string }) => c.id === created.body.id)).toBe(true);
    await admin.post(`/api/admin/trash/contacts/${created.body.id}/restore`).expect(200);
    const restored = await agent.get(`/api/contacts/${created.body.id}`).expect(200);
    expect(restored.body.email).toBe('soft@example.com');
  });

  it('exports a single contact with its linked records', async () => {
    const agent = await authedAgent('alex@example.com');
    const res = await agent.get(`/api/contacts/${CONTACTS.laura}/export`).expect(200);
    expect(res.body.contact.id).toBe(CONTACTS.laura);
    expect(
      res.body.interactions.some((i: { summary: string }) => i.summary.startsWith('Laura called')),
    ).toBe(true);
    expect(res.body.opportunities.some((o: { id: string }) => o.id === OPPORTUNITIES.acme)).toBe(
      true,
    );
  });
});
