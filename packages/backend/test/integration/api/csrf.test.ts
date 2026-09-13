// Integration tests for the Origin/Referer CSRF check on mutating requests.
// The check runs before authentication, so a cross-origin POST is rejected with
// 403 even without a session, while a request with no browser provenance falls
// through to the auth guard (401).
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { seedDemoWorkspace } from '../../fixtures/demo-workspace.ts';
import { app } from '../../support/app.ts';

describe('CSRF origin check', () => {
  beforeAll(() => seedDemoWorkspace());

  it('rejects a mutating request from a disallowed origin with 403', async () => {
    const res = await request(app)
      .post('/api/contacts')
      .set('Origin', 'https://evil.example.org')
      .send({ firstName: 'Cross', lastName: 'Site', email: 'csrf@example.com' })
      .expect(403);

    expect(res.body.error.code).toBe('forbidden');
  });

  it('allows a mutating request with no Origin header (falls through to auth)', async () => {
    await request(app)
      .post('/api/contacts')
      .send({ firstName: 'No', lastName: 'Origin', email: 'no-origin@example.com' })
      .expect(401);
  });
});
