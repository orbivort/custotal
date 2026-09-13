import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../support/app.ts';
import { resetDatabase } from '../../support/db.ts';
import { createUser } from '../../factories/user.factory.ts';

describe('login rate limiting (FR-CC-11)', () => {
  let email: string;

  beforeAll(async () => {
    // Opt back into rate limiting for this suite (disabled in tests by default).
    process.env.VITEST_RATE_LIMIT = '1';
    // Factory-built data instead of the demo workspace: this suite only needs
    // one account to hammer, so it stays independent of demo-seed changes.
    await resetDatabase();
    email = (await createUser({ email: 'rate-limit@example.com' })).email;
  });

  afterAll(() => {
    // The flag is read lazily per request; unset it so later suites in this
    // worker are not rate limited.
    delete process.env.VITEST_RATE_LIMIT;
  });

  it('returns 429 with Retry-After on the sixth failed attempt per IP', async () => {
    const attempt = () => request(app).post('/api/auth/login').send({ email, password: 'wrong' });
    for (let i = 0; i < 5; i += 1) {
      await attempt().expect(401);
    }
    const blocked = await attempt().expect(429);
    expect(blocked.body.error.code).toBe('rate_limited');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });
});
