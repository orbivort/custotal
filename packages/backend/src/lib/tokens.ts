// Opaque session / reset tokens. Only SHA-256 digests are persisted so a database
// leak does not expose usable credentials.
import { createHash, randomBytes } from 'node:crypto';

/** 32 random bytes, base64url — sent to the client once. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Hex SHA-256 digest of a token — the only form stored at rest. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
