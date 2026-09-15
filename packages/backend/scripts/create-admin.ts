// Idempotent first-administrator bootstrap (production-safe; never wipes data).
//
// Fills the gap left by the demo seed: on a freshly migrated database there is no
// way to sign in, because user creation is admin-guarded (POST /api/admin/users)
// and the seed is destructive. This script provisions exactly the first
// administrator and touches nothing else.
//
// Usage (from packages/backend, with .env present):
//   pnpm db:create-admin
//
// Environment:
//   ADMIN_EMAIL     required  sign-in email for the administrator
//   ADMIN_NAME      optional  display name (defaults to the email local-part)
//   ADMIN_PASSWORD  optional  password; when omitted a high-entropy temporary
//                             credential is generated, printed once, and the
//                             account is flagged mustChangePassword so it must
//                             be rotated at first sign-in.
//
// Single-administrator policy: if an administrator already exists, this script
// refuses to create or promote a second one and exits non-zero. Re-running for
// the existing administrator's own email stays a no-op.
//
// Safe to run repeatedly (idempotent, keyed on ADMIN_EMAIL):
//   - no user with that email       -> create it as admin
//   - user exists, already admin    -> no-op, exit 0
//   - user exists with another role -> promote to admin (password untouched)
//   - a different admin exists      -> fail; only one admin user is permitted
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { loadEnvFile } from 'node:process';
import { isValidEmail } from '../src/lib/validation.ts';

// Must match BCRYPT_ROUNDS in src/services/auth-service.ts so the credential this
// script writes verifies identically at sign-in.
const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;

try {
  loadEnvFile(join(process.cwd(), '.env'));
} catch {
  // rely on exported env
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('[create-admin] DATABASE_URL is required.');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

function fail(message: string): never {
  console.error(`[create-admin] ${message}`);
  process.exit(1);
}

function generateTempPassword(): string {
  return randomBytes(9).toString('base64url'); // 12 chars, high entropy
}

async function main(): Promise<void> {
  const email = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  const name = (process.env.ADMIN_NAME ?? '').trim() || email.split('@')[0] || 'Administrator';
  const suppliedPassword = process.env.ADMIN_PASSWORD ?? '';

  if (!email) fail('ADMIN_EMAIL is required (e.g. ADMIN_EMAIL=admin@example.com).');
  if (!isValidEmail(email)) fail(`ADMIN_EMAIL "${email}" is not a valid email address.`);
  if (suppliedPassword && suppliedPassword.length < MIN_PASSWORD_LENGTH) {
    fail(`ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  const [existing, existingAdmin] = await Promise.all([
    prisma.user.findUnique({ where: { email } }),
    prisma.user.findFirst({ where: { role: 'admin' }, select: { email: true } }),
  ]);

  // Enforce the single-administrator policy before creating or promoting anyone.
  // Re-running for the existing administrator's own email is still a no-op below.
  if (existingAdmin && existingAdmin.email !== email) {
    fail(
      `an administrator (${existingAdmin.email}) already exists — only one admin user is permitted, ` +
        `so ${email} was not created or promoted.`,
    );
  }

  if (existing) {
    if (existing.role === 'admin') {
      console.log(`[create-admin] ${email} is already an administrator — no changes made.`);
      return;
    }
    await prisma.user.update({ where: { id: existing.id }, data: { role: 'admin' } });
    console.log(
      `[create-admin] ${email} existed as "${existing.role}" — promoted to administrator (password unchanged).`,
    );
    return;
  }

  const generated = suppliedPassword === '';
  const password = generated ? generateTempPassword() : suppliedPassword;
  const user = await prisma.user.create({
    data: {
      name,
      email,
      role: 'admin',
      passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      // A generated credential is temporary: force rotation on first sign-in.
      mustChangePassword: generated,
    },
    select: { id: true, email: true, name: true },
  });

  console.log(`[create-admin] created administrator ${user.email} (${user.name}), id=${user.id}.`);
  if (generated) {
    console.log('');
    console.log(`[create-admin] Temporary password: ${password}`);
    console.log('[create-admin] Shown once — the user must change it at first sign-in.');
    console.log('[create-admin] Share it out-of-band, then clear it from your shell history.');
  } else {
    console.log('[create-admin] Sign in with ADMIN_PASSWORD, then change it from the app.');
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
