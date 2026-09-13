// User builder. User rows must be real (Session/PasswordResetToken are
// FK-backed), so the bcrypt password hash is computed once and reused —
// cost 10 hashing per call would dominate suite runtime.
import bcrypt from 'bcryptjs';
import { prisma } from '../../src/db.ts';
import type { User } from '../../src/generated/prisma/client.ts';

export const TEST_PASSWORD = 'demo1234';

let passwordHash: string | undefined;

export interface CreateUserOptions {
  name?: string;
  email?: string;
  role?: 'admin' | 'manager' | 'rep' | 'readonly';
}

export async function createUser(options: CreateUserOptions = {}): Promise<User> {
  passwordHash ??= await bcrypt.hash(TEST_PASSWORD, 10);
  return prisma.user.create({
    data: {
      name: options.name ?? `Test User ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      email:
        options.email ??
        `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.example`,
      role: options.role ?? 'rep',
      passwordHash,
    },
  });
}
