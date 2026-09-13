import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { USERS } from '../../fixtures/demo-ids.ts';
import { seedDemoWorkspace } from '../../fixtures/demo-workspace.ts';
import { app } from '../../support/app.ts';

const DEMO_PASSWORD = 'demo1234';

describe('authentication', () => {
  beforeAll(() => seedDemoWorkspace());
  afterAll(() => seedDemoWorkspace());

  it('exposes instance info and operational health', async () => {
    const info = await request(app).get('/api/health').expect(200);
    expect(info.body.orgName).toBe('Custotal');
    expect(info.body.setupRequired).toBe(false);
    const health = await request(app).get('/health').expect(200);
    expect(health.body).toEqual({ db: 'ok' });
  });

  it('rejects invalid credentials with the standard envelope', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alex@example.com', password: 'wrong-password' })
      .expect(401);
    expect(res.body.error.code).toBe('invalid_credentials');
    expect(res.body.error.message).toBe('Invalid email or password.');
  });

  it('logs in and returns the session user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alex@example.com', password: DEMO_PASSWORD })
      .expect(200);
    expect(res.body.user).toMatchObject({ id: USERS.alex, role: 'rep' });
    expect(res.headers['set-cookie']?.[0] ?? '').toContain('HttpOnly');
  });

  it('serves /me for an authenticated session and 401 without one', async () => {
    await request(app).get('/api/auth/me').expect(401);
    const agent = request.agent(app);
    await agent
      .post('/api/auth/login')
      .send({ email: 'dana@example.com', password: DEMO_PASSWORD })
      .expect(200);
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.user.email).toBe('dana@example.com');
  });

  it('invalidates the server-side session on logout', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/login')
      .send({ email: 'alex@example.com', password: DEMO_PASSWORD })
      .expect(200);
    await agent.post('/api/auth/logout').expect(200);
    await agent.get('/api/auth/me').expect(401);
  });
});
