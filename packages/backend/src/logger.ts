// Structured JSON logging (FR-CC-12). pino-http request logs attach request-id,
// user-id, action, and latency; sensitive headers/fields are redacted.
import { pino } from 'pino';
import { env } from './config.ts';

export const logger = pino({
  level: env.isDevelopment ? 'debug' : 'info',
  base: undefined,
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'password',
      '*.password',
      'token',
      '*.token',
      '*.tokenHash',
    ],
    censor: '[REDACTED]',
  },
});
