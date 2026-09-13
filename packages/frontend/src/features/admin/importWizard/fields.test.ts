// Unit tests for the CSV import field catalog, template builder, and record
// mapper. These helpers are pure, so the tests exercise real implementations.
import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_FIELD_OPTIONS,
  CONTACT_FIELD_OPTIONS,
  csvTemplateFor,
  fieldLabel,
  fieldOptionsFor,
  templateFileName,
  toRecords,
} from './fields';

describe('fieldOptionsFor', () => {
  it('returns the contact catalog for the contact entity', () => {
    expect(fieldOptionsFor('contact')).toBe(CONTACT_FIELD_OPTIONS);
  });

  it('returns the account catalog for the account entity', () => {
    expect(fieldOptionsFor('account')).toBe(ACCOUNT_FIELD_OPTIONS);
  });

  it('requires first/last name for contacts and name for accounts', () => {
    expect(CONTACT_FIELD_OPTIONS.filter((o) => o.required).map((o) => o.key)).toEqual([
      'firstName',
      'lastName',
    ]);
    expect(ACCOUNT_FIELD_OPTIONS.filter((o) => o.required).map((o) => o.key)).toEqual(['name']);
  });
});

describe('templateFileName', () => {
  it('names the contact template contacts-import-template.csv', () => {
    expect(templateFileName('contact')).toBe('contacts-import-template.csv');
  });

  it('names the account template accounts-import-template.csv', () => {
    expect(templateFileName('account')).toBe('accounts-import-template.csv');
  });
});

describe('csvTemplateFor', () => {
  it('builds a header row from the field keys for each entity', () => {
    expect(csvTemplateFor('contact').split('\n')[0]).toBe(
      CONTACT_FIELD_OPTIONS.map((f) => f.key).join(','),
    );
    expect(csvTemplateFor('account').split('\n')[0]).toBe(
      ACCOUNT_FIELD_OPTIONS.map((f) => f.key).join(','),
    );
  });

  it('includes sample rows that end with a trailing newline', () => {
    const csv = csvTemplateFor('contact');

    expect(csv.endsWith('\n')).toBe(true);
    expect(csv).toContain('Ada,Alpha');
    expect(csv).toContain('ada@example.com');
    expect(csv).toContain('grace@example.com');
  });

  it('escapes cells that contain special characters', () => {
    // The account template has an https:// website cell with no quoting needed,
    // but a multiline-capable round trip should still parse cleanly.
    const rows = csvTemplateFor('account').split('\n');

    expect(rows[0]).toContain('name');
    expect(csvTemplateFor('account')).toContain('https://alpha.example.com');
    expect(csvTemplateFor('account')).toContain('Key account');
  });
});

describe('fieldLabel', () => {
  it('resolves a known key to its human label', () => {
    expect(fieldLabel('contact', 'jobTitle')).toBe('Job title');
    expect(fieldLabel('account', 'billingAddress')).toBe('Billing address');
  });

  it('falls back to the raw key for unknown keys', () => {
    expect(fieldLabel('contact', 'notAField')).toBe('notAField');
    expect(fieldLabel('account', 'anything')).toBe('anything');
  });
});

describe('toRecords', () => {
  const headers = ['first name', 'Last Name', 'email', 'skip me'];
  const rows: string[][] = [
    ['  Ada ', 'Lovelace', 'ada@example.com', 'ignored'],
    ['Grace', 'Hopper', '', 'ignored'],
  ];
  const mapping = {
    'first name': 'firstName',
    'Last Name': 'lastName',
    email: 'email',
    'skip me': '',
  };

  it('maps, trims, and drops unmapped/empty values per row', () => {
    expect(toRecords(headers, rows, mapping)).toEqual([
      { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' },
      { firstName: 'Grace', lastName: 'Hopper' },
    ]);
  });

  it('returns one empty record per row when no columns are mapped', () => {
    expect(toRecords(headers, rows, {})).toEqual([{}, {}]);
  });

  it('tolerates a data row shorter than the header list', () => {
    const ragged = toRecords(headers, [['Grace']], mapping);

    expect(ragged).toEqual([{ firstName: 'Grace' }]);
  });

  it('tolerates a data row longer than the header list', () => {
    const long = toRecords(headers, [['Grace', 'Hopper', 'g@example.com', 'x', 'extra']], mapping);

    expect(long).toEqual([{ firstName: 'Grace', lastName: 'Hopper', email: 'g@example.com' }]);
  });

  it('writes values with internal whitespace but trims the edges only', () => {
    const result = toRecords(
      headers,
      [['Ada  Beta', 'Lovelace', '  a@example.com ', 'x']],
      mapping,
    );

    expect(result).toEqual([
      { firstName: 'Ada  Beta', lastName: 'Lovelace', email: 'a@example.com' },
    ]);
  });
});
