// Express harness shared by integration suites. The app instance is created
// once per worker process; suites reset the database rather than the app.
// env.ts is imported first so .env.test/.env are loaded before any src module
// reads process.env (ESM evaluates static imports in source order).
import './env.ts';
import request from 'supertest';
import { createApp } from '../../src/app.ts';

export const app = createApp();

export type TestAgent = ReturnType<typeof request.agent>;
