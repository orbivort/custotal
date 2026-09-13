// Authentication helper: a supertest agent holding a server-side session
// cookie, for integration suites.
import request from 'supertest';
import { app } from './app.ts';

export const DEMO_PASSWORD = 'demo1234';

/** An authenticated supertest agent for the given demo user. */
export async function authedAgent(
  email = 'alex@example.com',
  password = DEMO_PASSWORD,
): Promise<ReturnType<typeof request.agent>> {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password }).expect(200);
  return agent;
}
