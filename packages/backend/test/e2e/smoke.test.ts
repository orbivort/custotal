// E2E smoke: exercises the deployed stack — real HTTP server process, real
// database, real cookies — through the public API only. No supertest app
// import: the test intentionally knows nothing about the Express internals.
// The base URL of the server booted by setup/global-setup.ts is read from the
// handoff file in the workspace temp/ folder.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { backendRoot } from '../support/env.ts';

const DEMO_PASSWORD = 'demo1234';

function readBaseUrl(): string {
  const infoPath = join(resolve(backendRoot, '..', '..'), 'temp', 'e2e-server.json');
  const info = JSON.parse(readFileSync(infoPath, 'utf8')) as { baseUrl: string };
  return info.baseUrl;
}

describe('backend e2e smoke', () => {
  let baseUrl: string;

  beforeAll(() => {
    baseUrl = readBaseUrl();
  });

  it('reports a healthy database over real HTTP', async () => {
    const res = await request(baseUrl).get('/health').expect(200);
    expect(res.body).toEqual({ db: 'ok' });
  });

  it('exposes instance info for the seeded demo workspace', async () => {
    const res = await request(baseUrl).get('/api/health').expect(200);
    expect(res.body.orgName).toBe('Custotal');
    expect(res.body.setupRequired).toBe(false);
  });

  it('logs in over real HTTP, reads /me, and invalidates the session on logout', async () => {
    const agent = request.agent(baseUrl);
    await agent
      .post('/api/auth/login')
      .send({ email: 'alex@example.com', password: DEMO_PASSWORD })
      .expect(200);
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.user.email).toBe('alex@example.com');
    await agent.post('/api/auth/logout').expect(200);
    await agent.get('/api/auth/me').expect(401);
  });

  it('creates a contact and finds it again through search', async () => {
    const agent = request.agent(baseUrl);
    await agent
      .post('/api/auth/login')
      .send({ email: 'alex@example.com', password: DEMO_PASSWORD })
      .expect(200);
    const created = await agent
      .post('/api/contacts')
      .send({ firstName: 'E2E', lastName: 'Smoke', email: 'e2e-smoke@example.com' })
      .expect(201);
    const list = await agent.get('/api/contacts?q=e2e-smoke@example.com').expect(200);
    expect((list.body.items as { id: string }[]).some((c) => c.id === created.body.id)).toBe(true);
  });
});
