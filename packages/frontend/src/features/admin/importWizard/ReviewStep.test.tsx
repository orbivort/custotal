// Component tests for ReviewStep (dry-run validation preview + commit gate).
//
// The step is prop-driven: `importDryRun` is the only API collaborator and is
// mocked, while rendering follows the returned ImportDryRunResult.
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DuplicatePolicy, ImportDryRunResult, ImportDryRunRow } from '../../../types/domain';
import { ReviewStep } from './ReviewStep';
import type { ImportFile } from '../ImportWizardPage';

const h = vi.hoisted(() => ({
  importDryRun: vi.fn(),
  onDuplicateChange: vi.fn(),
  onBack: vi.fn(),
  onCommit: vi.fn(),
}));

vi.mock('./importApi', () => ({ importDryRun: h.importDryRun }));

const FILE: ImportFile = {
  name: 'contacts.csv',
  headers: ['First name', 'Last name', 'Email', 'Company'],
  rows: [],
};

const RESULT: ImportDryRunResult = {
  entity: 'contact',
  rows: [
    {
      index: 1,
      valid: true,
      reasons: [],
      duplicate: false,
      data: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', company: 'Acme' },
    },
    {
      index: 2,
      valid: true,
      reasons: [],
      duplicate: true,
      data: { firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.com' },
    },
    {
      index: 3,
      valid: false,
      reasons: ['Missing last name', 'Invalid email'],
      data: { email: 'broken' },
    },
  ],
  validCount: 2,
  errorCount: 1,
};

function renderStep(overrides: { duplicate?: DuplicatePolicy; result?: ImportDryRunResult } = {}) {
  const { duplicate = 'skip', result } = overrides;
  if (result) h.importDryRun.mockResolvedValue(result);
  return render(
    <ReviewStep
      entity="contact"
      file={FILE}
      records={[{ firstName: 'Ada' }]}
      duplicate={duplicate}
      onDuplicateChange={h.onDuplicateChange}
      onBack={h.onBack}
      onCommit={h.onCommit}
    />,
  );
}

describe('ReviewStep', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    h.importDryRun.mockResolvedValue(RESULT);
  });

  it('validates the records on mount and shows the loading state first', async () => {
    let resolveRun!: (value: ImportDryRunResult) => void;
    h.importDryRun.mockImplementationOnce(
      () => new Promise<ImportDryRunResult>((resolve) => (resolveRun = resolve)),
    );

    renderStep();

    expect(screen.getByText('Validating rows…')).toBeInTheDocument();
    expect(h.importDryRun).toHaveBeenCalledWith('contact', [{ firstName: 'Ada' }]);

    resolveRun(RESULT);
    expect(await screen.findByText('Review contacts.csv')).toBeInTheDocument();
  });

  it('renders the summary line and per-row status badges', async () => {
    renderStep();
    await screen.findByText('Review contacts.csv');

    expect(
      screen.getByText(/1 created · 1 skipped as duplicates · 1 with errors/),
    ).toBeInTheDocument();

    // Row 1 is fresh, row 2 duplicates, row 3 invalid.
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Existing')).toBeInTheDocument();
    expect(screen.getByText('Invalid')).toBeInTheDocument();
    // Invalid reasons are surfaced in the details cell.
    expect(screen.getByText('Missing last name Invalid email')).toBeInTheDocument();
    // Fresh row previews mapped non-identifying fields.
    expect(screen.getByText('ada@example.com · Acme')).toBeInTheDocument();
  });

  it('describes duplicate handling per policy', async () => {
    const user = userEvent.setup();
    renderStep();
    await screen.findByText('Review contacts.csv');

    expect(
      screen.getByText('Email matches an existing contact — will be skipped'),
    ).toBeInTheDocument();

    cleanup();
    renderStep({ duplicate: 'overwrite' });
    await screen.findByText('Review contacts.csv');

    expect(screen.getByText(/1 new \+ 1 updated/)).toBeInTheDocument();
    expect(
      screen.getByText('Email matches an existing contact — will update it'),
    ).toBeInTheDocument();

    // Switching the radio delegates to the parent.
    await user.click(screen.getByRole('radio', { name: 'Skip existing emails' }));
    expect(h.onDuplicateChange).toHaveBeenCalledWith('skip');
  });

  it('announces when the duplicate policy cannot affect a clean contact file', async () => {
    const cleanResult: ImportDryRunResult = {
      entity: 'contact',
      rows: [
        {
          index: 1,
          valid: true,
          reasons: [],
          duplicate: false,
          data: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' },
        },
      ],
      validCount: 1,
      errorCount: 0,
    };
    renderStep({ result: cleanResult });

    expect(
      await screen.findByText(
        'No contacts with a matching email were found, so the duplicate choice does not affect this file.',
      ),
    ).toBeInTheDocument();
  });

  it('falls back to unnamed labels when identity fields are missing', async () => {
    const result: ImportDryRunResult = {
      entity: 'contact',
      rows: [
        { index: 1, valid: true, reasons: [], duplicate: false, data: {} },
        { index: 2, valid: true, reasons: [], duplicate: false, data: { email: 'only@email.com' } },
      ],
      validCount: 2,
      errorCount: 0,
    };
    renderStep({ result });

    expect(await screen.findByText('Unnamed row')).toBeInTheDocument();
    // The email doubles as the row label (no name fields) and as the mapped
    // preview, so it is rendered more than once.
    expect(screen.getAllByText('only@email.com').length).toBeGreaterThan(0);
  });

  it('shows the overflow notice when the result has more than 10 rows', async () => {
    const many: ImportDryRunRow[] = Array.from({ length: 12 }, (_, i) => ({
      index: i + 1,
      valid: true,
      reasons: [],
      duplicate: false,
      data: { firstName: `R${i}`, lastName: 'Person' },
    }));
    renderStep({ result: { entity: 'contact', rows: many, validCount: 12, errorCount: 0 } });

    expect(await screen.findByText('Showing the first 10 of 12 rows.')).toBeInTheDocument();
  });

  it('disables the commit button when nothing can be imported', async () => {
    const allDuplicates: ImportDryRunResult = {
      entity: 'contact',
      rows: [
        { index: 1, valid: true, reasons: [], duplicate: true, data: { email: 'dup@example.com' } },
      ],
      validCount: 1,
      errorCount: 0,
    };
    renderStep({ result: allDuplicates });

    expect(await screen.findByText('Import 1 row')).toBeDisabled();
  });

  it('commits through the Import button and goes back to mapping', async () => {
    const user = userEvent.setup();
    renderStep();
    await screen.findByText('Review contacts.csv');

    expect(screen.getByRole('button', { name: 'Import 3 rows' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Import 3 rows' }));
    expect(h.onCommit).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Back to mapping' }));
    expect(h.onBack).toHaveBeenCalledTimes(1);
  });

  it('shows an error banner when the dry run fails', async () => {
    h.importDryRun.mockRejectedValueOnce(new Error('Validation server down'));

    renderStep();

    expect(await screen.findByText('Validation server down')).toBeInTheDocument();
    expect(screen.queryByText('Validating rows…')).not.toBeInTheDocument();
  });

  it('falls back to a generic message for non-Error dry-run failures', async () => {
    h.importDryRun.mockRejectedValueOnce('boom');

    renderStep();

    expect(await screen.findByText('Dry run failed')).toBeInTheDocument();
  });
});
