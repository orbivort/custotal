// PrismaClient singleton. Prisma 7 requires a driver adapter for direct database
// connections; the PostgreSQL adapter speaks the wire protocol through `pg`.
import { PrismaClient } from './generated/prisma/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from './config.ts';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  if (!env.databaseUrl) throw new Error('DATABASE_URL is not configured.');
  const adapter = new PrismaPg({ connectionString: env.databaseUrl });
  return new PrismaClient({
    adapter,
    log: env.isDevelopment ? ['warn', 'error'] : ['error'],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (env.nodeEnv !== 'production') globalForPrisma.prisma = prisma;
