import type { ImportEntity } from '../../../types/domain';

export interface ImportFieldOption {
  key: string;
  label: string;
  required?: boolean;
  /** Shown as the primary display column in the review table. */
  summary?: boolean;
}

export const CONTACT_FIELD_OPTIONS: ImportFieldOption[] = [
  { key: 'firstName', label: 'First name', required: true, summary: true },
  { key: 'lastName', label: 'Last name', required: true, summary: true },
  { key: 'email', label: 'Email', summary: true },
  { key: 'phone', label: 'Phone' },
  { key: 'jobTitle', label: 'Job title' },
  { key: 'company', label: 'Company' },
  { key: 'address', label: 'Address' },
  { key: 'notes', label: 'Notes' },
  { key: 'status', label: 'Status (active / inactive)' },
  { key: 'ownerEmail', label: 'Owner email' },
];

export const ACCOUNT_FIELD_OPTIONS: ImportFieldOption[] = [
  { key: 'name', label: 'Account name', required: true, summary: true },
  { key: 'industry', label: 'Industry' },
  { key: 'website', label: 'Website' },
  { key: 'phone', label: 'Phone' },
  { key: 'billingAddress', label: 'Billing address' },
  { key: 'notes', label: 'Notes' },
  { key: 'ownerEmail', label: 'Owner email' },
];

export function fieldOptionsFor(entity: ImportEntity): ImportFieldOption[] {
  return entity === 'contact' ? CONTACT_FIELD_OPTIONS : ACCOUNT_FIELD_OPTIONS;
}

/**
 * Example rows for the downloadable CSV template. Headers are derived from the
 * field options above so the template and the mapper stay in sync. The first
 * row shows every field populated; the second row shows a minimal valid row
 * (only required fields plus email, which satisfies the email-or-phone rule).
 */
const TEMPLATE_ROWS: Record<ImportEntity, string[][]> = {
  contact: [
    [
      'Ada',
      'Alpha',
      'ada@example.com',
      '+1 555 0100',
      'Engineer',
      'Alpha Inc',
      '1 Sample Street',
      'Met at a conference',
      'active',
      '',
    ],
    ['Grace', 'Golf', 'grace@example.com', '', '', '', '', '', '', ''],
  ],
  account: [
    [
      'Alpha Inc',
      'Manufacturing',
      'https://alpha.example.com',
      '+1 555 0100',
      '1 Sample Street',
      'Key account',
      '',
    ],
    ['Charlie', 'Software', '', '', '', '', ''],
  ],
};

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Builds a sample CSV (header + example rows) for the given import entity. */
export function csvTemplateFor(entity: ImportEntity): string {
  const headers = fieldOptionsFor(entity).map((f) => f.key);
  const lines = [headers.map(csvCell).join(',')];
  for (const row of TEMPLATE_ROWS[entity]) {
    lines.push(row.map(csvCell).join(','));
  }
  return lines.join('\n') + '\n';
}

/** File name used when downloading the generated template. */
export function templateFileName(entity: ImportEntity): string {
  return entity === 'contact' ? 'contacts-import-template.csv' : 'accounts-import-template.csv';
}

export function fieldLabel(entity: ImportEntity, key: string): string {
  return fieldOptionsFor(entity).find((f) => f.key === key)?.label ?? key;
}

/** Converts raw CSV cells into canonical field-keyed records using a header->field mapping. */
export function toRecords(
  headers: string[],
  rows: string[][],
  mapping: Record<string, string>,
): Record<string, string>[] {
  return rows.map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      const field = (mapping[header] ?? '').trim();
      if (!field) return;
      const value = (cells[index] ?? '').trim();
      if (value) record[field] = value;
    });
    return record;
  });
}
