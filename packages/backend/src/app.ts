// Express application assembly. Exported so the server (index.ts) and the test
// harness build identical instances.
import { Router } from 'express';
import express from 'express';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { randomUUID } from 'node:crypto';
import { prisma } from './db.ts';
import { logger } from './logger.ts';
import { env } from './config.ts';
import { corsAllowList } from './middleware/cors.ts';
import { csrfProtection } from './middleware/csrf.ts';
import { securityHeaders } from './middleware/security-headers.ts';
import { requestId } from './middleware/request-id.ts';
import { sessionLoader } from './middleware/auth.ts';
import { generalLimiter } from './middleware/rate-limit.ts';
import { errorHandler, notFoundHandler } from './middleware/error-handler.ts';
import { authRouter } from './routes/auth-routes.ts';
import { metaRouter } from './routes/meta-routes.ts';
import { contactRouter } from './routes/contact-routes.ts';
import { accountRouter } from './routes/account-routes.ts';
import { interactionRouter } from './routes/interaction-routes.ts';
import { opportunityRouter } from './routes/opportunity-routes.ts';
import { taskRouter } from './routes/task-routes.ts';
import { reportRouter } from './routes/report-routes.ts';
import { searchRouter } from './routes/search-routes.ts';
import { adminRouter } from './routes/admin-routes.ts';
import { importRouter } from './routes/import-routes.ts';

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');

  // Behind a reverse proxy/LB, req.ip must resolve to the real client address
  // for rate-limit keying to work (express-rate-limit relies on it). TRUST_PROXY
  // accepts a hop count or a comma-separated list of proxy IPs/subnets.
  if (env.trustProxy !== false) app.set('trust proxy', env.trustProxy);

  app.use(securityHeaders);
  app.use(corsAllowList);
  app.use(csrfProtection);
  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as { id?: string }).id ?? randomUUID(),
      customProps: (req) => ({
        userId: (req as { user?: { id?: string } }).user?.id ?? null,
        action: `${req.method} ${req.originalUrl}`,
      }),
      autoLogging: {
        ignore: (req) => req.url === '/health' || req.url === '/api/health',
      },
    }),
  );
  // The CSV import endpoints accept browser-parsed batches and need the large
  // limit; every other JSON endpoint stays at 1 MB (body-parser skips a body
  // that was already parsed, so the scoped parser must run first).
  app.use('/api/import', express.json({ limit: '12mb' }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Operational probe (FR-CC-12): real database check, not just process liveness.
  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ db: 'ok' });
    } catch {
      res.status(503).json({ db: 'error' });
    }
  });

  app.use('/api', sessionLoader);
  app.use('/api', generalLimiter);
  const api = Router();
  api.use('/auth', authRouter);
  api.use(metaRouter); // /health, /meta, /stages under /api
  api.use('/contacts', contactRouter);
  api.use('/accounts', accountRouter);
  api.use('/interactions', interactionRouter);
  api.use('/opportunities', opportunityRouter);
  api.use('/tasks', taskRouter);
  api.use('/reports', reportRouter);
  api.use('/search', searchRouter);
  api.use('/admin', adminRouter);
  api.use('/import', importRouter);
  app.use('/api', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
