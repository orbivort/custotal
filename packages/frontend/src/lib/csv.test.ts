import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from './csv';

describe('toCsv', () => {
  it('joins headers and rows with CRLF', () => {
    const csv = toCsv(
      ['A', 'B'],
      [
        ['1', '2'],
        ['3', '4'],
      ],
    );
    expect(csv).toBe('A,B\r\n1,2\r\n3,4');
  });

  it('escapes values containing commas and quotes', () => {
    const csv = toCsv(['Name'], [['Doe, Jane "JD"']]);
    expect(csv).toBe('Name\r\n"Doe, Jane ""JD"""');
  });
});

describe('parseCsv', () => {
  it('parses simple rows', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('handles quoted fields with embedded commas', () => {
    expect(parseCsv('name,note\r\n"Doe, Jane",hi')).toEqual([
      ['name', 'note'],
      ['Doe, Jane', 'hi'],
    ]);
  });

  it('handles escaped quotes inside quoted fields', () => {
    expect(parseCsv('"Say ""hi""",x')).toEqual([['Say "hi"', 'x']]);
  });

  it('handles multiline quoted fields', () => {
    expect(parseCsv('note\r\n"line one\r\nline two",tail')).toEqual([
      ['note'],
      ['line one\r\nline two', 'tail'],
    ]);
  });

  it('treats a trailing record without a line break as a row', () => {
    expect(parseCsv('a,b\r\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('returns an empty matrix for empty input', () => {
    expect(parseCsv('')).toEqual([]);
  });
});
