import { describe, expect, it } from 'vitest';
import { EMAIL_MAX_LENGTH, isValidEmail } from './validation';

describe('isValidEmail', () => {
  it.each(['user@test.example', 'first.last+tag@sub.domain.co', 'a@b.c'])('accepts %s', (email) => {
    expect(isValidEmail(email)).toBe(true);
  });

  it.each([
    '',
    'plain',
    'a@b',
    'a@b.',
    'a@b..c',
    'user@@example.com',
    'user@exa mple.com',
    'user@example.com ',
  ])('rejects %s', (email) => {
    expect(isValidEmail(email)).toBe(false);
  });

  it('rejects an address longer than EMAIL_MAX_LENGTH', () => {
    const atLimit = `${'a'.repeat(EMAIL_MAX_LENGTH - '@example.com'.length)}@example.com`;
    expect(isValidEmail(atLimit)).toBe(true);
    expect(isValidEmail(`x${atLimit}`)).toBe(false);
  });

  it('rejects hostile input without backtracking', () => {
    const hostile = `a@${'b.'.repeat(20_000)} `;
    const started = Date.now();
    expect(isValidEmail(hostile)).toBe(false);
    expect(Date.now() - started).toBeLessThan(100);
  });
});
