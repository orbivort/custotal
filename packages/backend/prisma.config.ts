// Prisma 7 configuration. Datasource URLs for Migrate/Studio live here instead of
// schema.prisma. The runtime client connects through a driver adapter (see src/db.ts).
import { loadEnvFile } from 'node:process';
import { pathToFileURL } from 'node:url';
import { defineConfig } from 'prisma/config';

// Load .env (cwd is the backend package when invoked via pnpm workspace scripts).
try {
  loadEnvFile(pathToFileURL(`${process.cwd()}/.env`));
} catch {
  // .env is optional when the environment already exports the variables.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    path: 'prisma/migrations',
  },
});
