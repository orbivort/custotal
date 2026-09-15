// Opaque session / reset tokens. Only SHA-256 digests are persisted so a database
// leak does not expose usable credentials.
//
// A fast, unsalted hash is the right tool here (and is deliberately not a
// password KDF): the input is 256 bits of entropy from randomBytes, so there is
// no dictionary or offline search to slow down, and a slow hash would be paid on
// every authenticated request because sessionLoader digests the cookie on each
// call. CodeQL's js/insufficient-password-hash flags this line; the review and
// disposition are recorded in docs/operations-notes.md §9.2.
import { createHash, randomBytes } from 'node:crypto';

/** 32 random bytes, base64url — sent to the client once. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Hex SHA-256 digest of a token — the only form stored at rest. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
