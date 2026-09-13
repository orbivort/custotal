// Unit tests for the opaque session / reset token helpers. Pure unit tests: the
// real node:crypto implementation is used (it is deterministic for hashing and
// cheap for random bytes), so the assertions pin the wire format (base64url, 32
// bytes of entropy) and the at-rest format (hex SHA-256) that the auth flow and
// the database schema depend on.
import { describe, expect, it } from 'vitest';
import { generateToken, hashToken } from '../../../src/lib/tokens.ts';

const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
const HEX_SHA256_RE = /^[0-9a-f]{64}$/;

// Reference digests from the SHA-256 test vectors.
const SHA256_EMPTY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const SHA256_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

describe('generateToken', () => {
  it('returns a non-empty base64url string with no padding', () => {
    const token = generateToken();
    expect(token).toMatch(BASE64URL_RE);
    expect(token).not.toContain('=');
    expect(token).not.toContain('+');
    expect(token).not.toContain('/');
  });

  it('encodes exactly 32 bytes of entropy (43 base64url chars)', () => {
    const token = generateToken();
    expect(token).toHaveLength(43);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
  });

  it('is URL- and cookie-safe (unchanged by encodeURIComponent)', () => {
    const token = generateToken();
    expect(encodeURIComponent(token)).toBe(token);
  });

  it('never repeats across many calls', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateToken()));
    expect(tokens.size).toBe(200);
  });
});

describe('hashToken', () => {
  it('matches the known SHA-256 vector for "abc"', () => {
    expect(hashToken('abc')).toBe(SHA256_ABC);
  });

  it('hashes the empty string rather than throwing', () => {
    expect(hashToken('')).toBe(SHA256_EMPTY);
  });

  it('returns a lowercase 64-character hex digest', () => {
    const digest = hashToken(generateToken());
    expect(digest).toMatch(HEX_SHA256_RE);
    expect(digest).toHaveLength(64);
  });

  it('is deterministic for the same token', () => {
    const token = generateToken();
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it('produces different digests for different tokens', () => {
    expect(hashToken('token-a')).not.toBe(hashToken('token-b'));
  });

  it('is sensitive to case and to a single-character change', () => {
    expect(hashToken('Token')).not.toBe(hashToken('token'));
    expect(hashToken('token1')).not.toBe(hashToken('token2'));
  });

  it('hashes multi-byte input as UTF-8 without throwing', () => {
    const digest = hashToken('naïve-tökén-✓');
    expect(digest).toMatch(HEX_SHA256_RE);
    expect(digest).toBe(hashToken('naïve-tökén-✓'));
  });

  it('never returns the plaintext token (nothing usable is stored at rest)', () => {
    const token = generateToken();
    expect(hashToken(token)).not.toBe(token);
    expect(hashToken(token)).not.toContain(token);
  });
});

describe('generateToken + hashToken round-trip', () => {
  it('lets a lookup by digest identify the issued token', () => {
    const issued = generateToken();
    const stored = hashToken(issued);
    // Re-hashing the value presented by the client must find the stored row.
    expect(hashToken(issued)).toBe(stored);
    expect(hashToken(generateToken())).not.toBe(stored);
  });
});
