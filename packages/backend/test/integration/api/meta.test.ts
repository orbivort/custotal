// Integration tests for the bootstrap metadata endpoints (FR-CC-02).
// /api/meta (the user roster + account index) must be authentication-gated,
// while /api/health stays public because the sign-in screen depends on it.
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { seedDemoWorkspace } from '../../fixtures/demo-workspace.ts';
import { app } from '../../support/app.ts';
import { authedAgent } from '../../support/auth.ts';

describe('bootstrap metadata access control', () => {
  beforeAll(() => seedDemoWorkspace());

  it('rejects anonymous access to /api/meta with 401', async () => {
    const res = await request(app).get('/api/meta').expect(401);
    expect(res.body.error.code).toBe('unauthorized');
  });

  it('serves /api/meta to any authenticated user', async () => {
    const agent = await authedAgent('alex@example.com');
    const res = await agent.get('/api/meta').expect(200);

    expect(Array.isArray(res.body.users)).toBe(true);
    expect(Array.isArray(res.body.stages)).toBe(true);
    expect(Array.isArray(res.body.accounts)).toBe(true);
  });

  it('keeps /api/health public for the sign-in screen', async () => {
    const res = await request(app).get('/api/health').expect(200);
    expect(typeof res.body.orgName).toBe('string');
  });

  it('provisions the pipeline on demand without duplicating an existing one', async () => {
    const agent = await authedAgent('alex@example.com');

    // The seeded workspace already has a pipeline: the initializer must leave it
    // untouched rather than append a second copy of the defaults.
    const first = await agent.post('/api/stages/ensure').expect(200);
    expect(first.body.created).toBe(false);
    expect(first.body.items.length).toBeGreaterThan(0);

    const second = await agent.post('/api/stages/ensure').expect(200);
    expect(second.body.items).toEqual(first.body.items);
  });

  it('requires authentication to provision the pipeline', async () => {
    await request(app).post('/api/stages/ensure').expect(401);
  });
});
