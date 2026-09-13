// Component tests for ImportWizardPage (upload -> map -> review -> done).
//
// MapColumnsStep and ReviewStep are replaced with stubs that trigger their
// navigation callbacks, so this file exercises the wizard shell: the upload
// step's parsing/validation/template download, step transitions, and the
// commit + summary + reset flow. importCommit and toast are mocked; the CSV
// parser stays real, matching production behavior.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImportCommitSummary } from '../../types/domain';
import ImportWizardPage from './ImportWizardPage';

const h = vi.hoisted(() => ({
  importCommit: vi.fn(),
  show: vi.fn(),
}));

vi.mock('./importWizard/importApi', () => ({ importCommit: h.importCommit }));
vi.mock('./importWizard/MapColumnsStep', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  return {
    MapColumnsStep: (props: { onNext: () => void }) =>
      React.createElement(
        'button',
        { type: 'button', onClick: () => props.onNext() },
        'Go to review (MapColumnsStep)',
      ),
  };
});
vi.mock('./importWizard/ReviewStep', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  return {
    ReviewStep: (props: { onCommit: () => void }) =>
      React.createElement(
        'button',
        { type: 'button', onClick: () => props.onCommit() },
        'Commit import (ReviewStep)',
      ),
  };
});
vi.mock('../../components/toast', () => ({ useToast: () => ({ show: h.show }) }));

const SUMMARY: ImportCommitSummary = {
  entity: 'contact',
  created: 5,
  updated: 2,
  skipped: 1,
  failed: 0,
};

function renderPage() {
  return render(
    <MemoryRouter>
      <ImportWizardPage />
    </MemoryRouter>,
  );
}

async function uploadCsv(content: string, name = 'people.csv', size?: number) {
  const file = new File([content], name, { type: 'text/csv' });
  if (size !== undefined) Object.defineProperty(file, 'size', { value: size });
  const user = userEvent.setup();
  await user.upload(screen.getByLabelText('Upload CSV file'), file);
  return user;
}

describe('ImportWizardPage', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    h.importCommit.mockResolvedValue(SUMMARY);
  });

  it('renders the wizard shell on the upload step', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'CSV import' })).toBeInTheDocument();
    expect(screen.getByText('Current step: Upload')).toBeInTheDocument();
    expect(screen.getByText('Drop your CSV here')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download contacts template' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Contacts/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Accounts/ })).toBeInTheDocument();
  });

  it('downloads the CSV template through an anchor click', async () => {
    const user = userEvent.setup();
    const objectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Download contacts template' }));

    expect(objectUrl).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith('blob:mock');
  });

  it('switches the target entity to accounts for upload and template labels', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /Accounts/ }));

    expect(screen.getByRole('button', { name: 'Download accounts template' })).toBeInTheDocument();
  });

  it('moves to the mapping step after a valid CSV upload and toasts the row count', async () => {
    renderPage();

    await uploadCsv('Name,Email\nAda,ada@example.com\n');

    expect(
      await screen.findByRole('button', { name: 'Go to review (MapColumnsStep)' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Current step: Map columns')).toBeInTheDocument();
    expect(h.show).toHaveBeenCalledWith('Read 1 data rows from people.csv', 'success');
  });

  it('rejects files larger than 10 MB', async () => {
    renderPage();

    await uploadCsv('a,b\n1,2\n', 'big.csv', 10 * 1024 * 1024 + 1);

    expect(await screen.findByText('File must be 10 MB or smaller.')).toBeInTheDocument();
    expect(screen.getByText('Current step: Upload')).toBeInTheDocument();
  });

  it('rejects files without a header row and at least one data row', async () => {
    renderPage();

    await uploadCsv('Name,Email\n');

    expect(
      await screen.findByText('The file needs a header row and at least one data row.'),
    ).toBeInTheDocument();
  });

  it('walks to the review step and commits the import', async () => {
    const user = userEvent.setup();
    renderPage();

    await uploadCsv('Name,Email\nAda,ada@example.com\n', 'people.csv');

    await user.click(await screen.findByRole('button', { name: 'Go to review (MapColumnsStep)' }));
    expect(screen.getByText('Current step: Review')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Commit import (ReviewStep)' }));

    await waitFor(() =>
      expect(h.importCommit).toHaveBeenCalledWith('contact', expect.any(Array), 'skip'),
    );
    expect(await screen.findByText('Import complete')).toBeInTheDocument();
    expect(screen.getByText('Current step: Done')).toBeInTheDocument();
    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(screen.getByText('Updated')).toBeInTheDocument();
    expect(screen.getByText('Skipped')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('5 contacts are now live in the workspace.')).toBeInTheDocument();
    expect(h.show).toHaveBeenCalledWith('Import finished', 'success');
  });

  it('resets to the upload step after finishing an import', async () => {
    const user = userEvent.setup();
    renderPage();

    await uploadCsv('Name,Email\nAda,ada@example.com\n', 'people.csv');
    await user.click(await screen.findByRole('button', { name: 'Go to review (MapColumnsStep)' }));
    await user.click(screen.getByRole('button', { name: 'Commit import (ReviewStep)' }));
    await screen.findByText('Import complete');

    await user.click(screen.getByRole('button', { name: 'Start another import' }));

    expect(screen.getByText('Current step: Upload')).toBeInTheDocument();
    expect(screen.getByText('Drop your CSV here')).toBeInTheDocument();
    expect(screen.queryByText('Import complete')).not.toBeInTheDocument();
  });

  it('carries the selected entity into the commit call', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /Accounts/ }));
    await uploadCsv('name,website\nAcme,acme.example.com\n', 'orgs.csv');
    await user.click(await screen.findByRole('button', { name: 'Go to review (MapColumnsStep)' }));
    await user.click(screen.getByRole('button', { name: 'Commit import (ReviewStep)' }));

    await waitFor(() =>
      expect(h.importCommit).toHaveBeenCalledWith('account', expect.any(Array), 'skip'),
    );
  });

  it('shows an error banner when the commit fails and stays on the review step', async () => {
    const user = userEvent.setup();
    h.importCommit.mockRejectedValueOnce(new Error('Server error'));
    renderPage();

    await uploadCsv('Name,Email\nAda,ada@example.com\n', 'people.csv');
    await user.click(await screen.findByRole('button', { name: 'Go to review (MapColumnsStep)' }));
    await user.click(screen.getByRole('button', { name: 'Commit import (ReviewStep)' }));

    expect(await screen.findByText('Server error')).toBeInTheDocument();
    expect(screen.getByText('Current step: Review')).toBeInTheDocument();
    expect(screen.queryByText('Import complete')).not.toBeInTheDocument();
  });

  it('falls back to a generic message for non-Error commit failures', async () => {
    const user = userEvent.setup();
    h.importCommit.mockRejectedValueOnce('boom');
    renderPage();

    await uploadCsv('Name,Email\nAda,ada@example.com\n', 'people.csv');
    await user.click(await screen.findByRole('button', { name: 'Go to review (MapColumnsStep)' }));
    await user.click(screen.getByRole('button', { name: 'Commit import (ReviewStep)' }));

    expect(await screen.findByText('Import failed')).toBeInTheDocument();
  });
});
