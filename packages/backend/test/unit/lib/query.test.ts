// Unit tests for the Express 5 query/param coercion helpers. Pure unit tests
// with no mocks: Express types query values as string | string[] | ParsedQs |
// undefined, so these helpers must narrow every one of those shapes safely
// (including hostile input such as objects or nested arrays).
import { describe, expect, it } from 'vitest';
import { pstr, qnum, qstr } from '../../../src/lib/query.ts';

describe('qstr', () => {
  it('returns a plain string value unchanged', () => {
    expect(qstr('acme')).toBe('acme');
  });

  it('preserves an empty string (callers decide whether it is meaningful)', () => {
    expect(qstr('')).toBe('');
  });

  it('returns the first entry of a repeated query parameter', () => {
    expect(qstr(['first', 'second'])).toBe('first');
  });

  it('returns undefined for an empty array', () => {
    expect(qstr([])).toBeUndefined();
  });

  it('returns undefined when the first array entry is not a string', () => {
    expect(qstr([42, 'second'])).toBeUndefined();
    expect(qstr([{ nested: 'x' }])).toBeUndefined();
    expect(qstr([['nested']])).toBeUndefined();
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['number', 7],
    ['boolean', true],
    ['ParsedQs object', { q: 'acme' }],
  ])('returns undefined for a %s value', (_label, value) => {
    expect(qstr(value)).toBeUndefined();
  });
});

describe('qnum', () => {
  it('parses a positive integer string', () => {
    expect(qnum('25')).toBe(25);
  });

  it('parses zero and negative values', () => {
    expect(qnum('0')).toBe(0);
    expect(qnum('-3')).toBe(-3);
  });

  it('parses decimals and exponent notation', () => {
    expect(qnum('1.5')).toBe(1.5);
    expect(qnum('1e3')).toBe(1000);
  });

  it('tolerates surrounding whitespace (Number() trims)', () => {
    expect(qnum(' 12 ')).toBe(12);
  });

  it('returns undefined for an empty string', () => {
    expect(qnum('')).toBeUndefined();
  });

  it('returns undefined for a non-numeric string', () => {
    expect(qnum('abc')).toBeUndefined();
    expect(qnum('12abc')).toBeUndefined();
  });

  it('rejects non-finite values so downstream arithmetic stays safe', () => {
    expect(qnum('Infinity')).toBeUndefined();
    expect(qnum('-Infinity')).toBeUndefined();
    expect(qnum('NaN')).toBeUndefined();
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['already-a-number', 25],
    ['array', ['25']],
    ['object', { page: '2' }],
  ])('returns undefined for a %s value (string input only)', (_label, value) => {
    expect(qnum(value)).toBeUndefined();
  });
});

describe('pstr', () => {
  it('returns a plain route param unchanged', () => {
    expect(pstr('c-1')).toBe('c-1');
  });

  it('returns the first entry of an array param', () => {
    expect(pstr(['c-1', 'c-2'])).toBe('c-1');
  });

  it('returns an empty string for an empty array', () => {
    expect(pstr([])).toBe('');
  });

  it('returns an empty string for undefined (never undefined itself)', () => {
    expect(pstr(undefined)).toBe('');
  });

  it('passes an empty string through unchanged', () => {
    expect(pstr('')).toBe('');
  });

  it('always yields a string for every accepted input shape', () => {
    for (const value of ['id', ['id'], [], undefined] as (string | string[] | undefined)[]) {
      expect(typeof pstr(value)).toBe('string');
    }
  });
});
