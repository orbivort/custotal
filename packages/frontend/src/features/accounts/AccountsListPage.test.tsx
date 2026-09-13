// Component tests for AccountsListPage.
//
// External collaborators are mocked so the tests focus on page behavior:
// - accountsApi.listAccounts  -> drives loading / data / error states
// - MetaContext.useMeta       -> users list + owner-name resolution
// - toast.useToast            -> export feedback
// - lib/csv                   -> download/toCsv interception (no Blob in jsdom)
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account, PaginatedResult, User } from '../../types/domain';
import type { AccountListParams } from './accountsApi';
import AccountsListPage from './AccountsListPage';

const h = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  useMeta: vi.fn(),
  show: vi.fn(),
  toCsv: vi.fn(),
  downloadCsv: vi.fn(),
}));

vi.mock('./accountsApi', () => ({ listAccounts: h.listAccounts }));
vi.mock('../meta/MetaContext', () => ({ useMeta: h.useMeta }));
vi.mock('../../components/toast', () => ({ useToast: () => ({ show: h.show }) }));
vi.mock('../../lib/csv', () => ({ toCsv: h.toCsv, downloadCsv: h.downloadCsv }));

const USERS: User[] = [
  { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin' },
  { id: 'u2', name: 'Ben Smith', email: 'ben@example.com', role: 'rep' },
];

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'a1',
    name: 'Acme Corp',
    ownerId: 'u1',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'u1',
    updatedAt: '2026-01-02T00:00:00Z',
    updatedBy: 'u1',
    ...overrides,
  };
}

function pageResult(items: Account[], total = items.length): PaginatedResult<Account> {
  return { items, total, page: 1, pageSize: 25 };
}

/** Params of the most recent listAccounts call. */
function lastParams(): AccountListParams {
  return h.listAccounts.mock.calls.at(-1)?.[0] ?? {};
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AccountsListPage />
    </MemoryRouter>,
  );
}

describe('AccountsListPage', () => {
  // Vitest globals are disabled, so RTL's automatic cleanup does not run.
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    h.useMeta.mockReturnValue({
      users: USERS,
      userName: (id?: string) => USERS.find((u) => u.id === id)?.name ?? 'Unknown',
    });
    h.toCsv.mockReturnValue('csv-content');
    h.listAccounts.mockResolvedValue(pageResult([makeAccount()]));
  });

  it('requests the first page with default filters and shows the loading state', async () => {
    let resolveList!: (value: PaginatedResult<Account>) => void;
    h.listAccounts.mockImplementationOnce(
      () => new Promise<PaginatedResult<Account>>((resolve) => (resolveList = resolve)),
    );

    renderPage();

    expect(await screen.findByText('Loading…')).toBeInTheDocument();
    expect(h.listAccounts).toHaveBeenCalledTimes(1);
    expect(lastParams()).toEqual({
      q: '',
      owner: '',
      letter: undefined,
      sort: 'name',
      page: 1,
      pageSize: 25,
    });

    resolveList(pageResult([]));
    await screen.findByText('No accounts found');
  });

  it('renders account cards with owner names and fallbacks after load', async () => {
    h.listAccounts.mockResolvedValue(
      pageResult([
        makeAccount({
          id: 'a1',
          name: 'Acme Corp',
          industry: 'SaaS',
          website: 'https://acme.test',
          ownerId: 'u1',
        }),
        makeAccount({ id: 'a2', name: 'Globex', ownerId: 'u2' }),
      ]),
    );

    renderPage();

    expect(await screen.findByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('Globex')).toBeInTheDocument();
    // Industry present / missing ("No industry" fallback).
    expect(screen.getByText('SaaS')).toBeInTheDocument();
    expect(screen.getByText('No industry')).toBeInTheDocument();
    // Owner names resolved through useMeta.
    expect(screen.getByText('Owner: Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Owner: Ben Smith')).toBeInTheDocument();
    // Website shown only when present.
    expect(screen.getByText('https://acme.test')).toBeInTheDocument();
    // Header subtitle reflects the total.
    expect(screen.getByText('2 organizations in your book of business')).toBeInTheDocument();
    // Each card links to its detail route.
    expect(screen.getByRole('link', { name: /Acme Corp/ })).toHaveAttribute('href', '/accounts/a1');
    expect(screen.getByRole('link', { name: /Globex/ })).toHaveAttribute('href', '/accounts/a2');
  });

  it('renders the empty state when the result set is empty', async () => {
    h.listAccounts.mockResolvedValue(pageResult([], 0));

    renderPage();

    expect(await screen.findByText('No accounts found')).toBeInTheDocument();
    expect(screen.getByText('0 organizations in your book of business')).toBeInTheDocument();
    // One "New account" link in the header, one inside the empty state.
    expect(screen.getAllByRole('link', { name: /New account/ })).toHaveLength(2);
  });

  it('renders the error banner when the query fails', async () => {
    h.listAccounts.mockRejectedValue(new Error('Boom'));

    renderPage();

    expect(await screen.findByText('Boom')).toBeInTheDocument();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  });

  it('offers the meta users as owner filter options', async () => {
    renderPage();

    expect(await screen.findByRole('option', { name: 'All owners' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Ada Lovelace' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Ben Smith' })).toBeInTheDocument();
  });

  it('refetches with the selected owner filter', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Acme Corp');

    await user.selectOptions(screen.getByLabelText('Filter by owner'), 'u2');

    await waitFor(() => expect(lastParams()).toMatchObject({ owner: 'u2', page: 1 }));
  });

  it('refetches with the selected first-letter filter', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Acme Corp');

    await user.selectOptions(screen.getByLabelText('Filter by first letter of account name'), 'B');

    await waitFor(() => expect(lastParams()).toMatchObject({ letter: 'B', page: 1 }));
  });

  it('maps the sort select values to server-side sort keys', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Acme Corp');

    const sortSelect = screen.getByLabelText('Sort accounts');

    await user.selectOptions(sortSelect, 'updatedAt:desc');
    await waitFor(() => expect(lastParams()).toMatchObject({ sort: 'updated_desc' }));

    await user.selectOptions(sortSelect, 'name:desc');
    await waitFor(() => expect(lastParams()).toMatchObject({ sort: 'name_desc' }));
  });

  it('pages through results with the pagination controls', async () => {
    const user = userEvent.setup();
    h.listAccounts.mockResolvedValue(pageResult([makeAccount()], 60));
    renderPage();
    await screen.findByText('Acme Corp');

    // Pagination summary text is split across spans ("Showing <1–25> of <60>").
    expect(screen.getByText('1–25')).toBeInTheDocument();
    expect(screen.getByText('60')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /next/i }));

    await waitFor(() => expect(lastParams()).toMatchObject({ page: 2 }));
  });

  it('debounces the search input and resets to page 1', async () => {
    const user = userEvent.setup();
    h.listAccounts.mockResolvedValue(pageResult([makeAccount()], 60));
    renderPage();
    await screen.findByText('Acme Corp');

    // Move to page 2 first, so we can verify the search resets pagination.
    await user.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => expect(lastParams()).toMatchObject({ page: 2 }));

    await user.type(screen.getByLabelText('Search accounts'), 'acme');

    // The debounce is 250ms; allow extra headroom for the final call.
    await waitFor(() => expect(lastParams()).toMatchObject({ q: 'acme', page: 1 }), {
      timeout: 2000,
    });
  });

  it('exports the filtered result set as CSV and shows a success toast', async () => {
    const user = userEvent.setup();
    const items = [makeAccount({ id: 'a1', name: 'Acme Corp' })];
    h.listAccounts.mockResolvedValue(pageResult(items));
    renderPage();
    await screen.findByText('Acme Corp');

    await user.click(screen.getByRole('button', { name: /export/i }));

    await waitFor(() => expect(h.downloadCsv).toHaveBeenCalledWith('accounts.csv', 'csv-content'));
    expect(h.toCsv).toHaveBeenCalledWith(
      ['Account name', 'Industry', 'Website', 'Phone', 'Billing address', 'Owner', 'Last modified'],
      [['Acme Corp', '', '', '', '', 'Ada Lovelace', '2026-01-02T00:00:00Z']],
    );
    // Export fetches the full (unpaged) result set.
    expect(lastParams()).toEqual({
      q: '',
      owner: '',
      letter: undefined,
      sort: 'name',
      pageSize: 10000,
    });
    expect(h.show).toHaveBeenCalledWith('Exported 1 accounts', 'success');
  });

  it('shows an error toast when the CSV export fails', async () => {
    const user = userEvent.setup();
    h.listAccounts
      .mockResolvedValueOnce(pageResult([makeAccount()])) // initial page load
      .mockRejectedValueOnce(new Error('Network down')); // export fetch
    renderPage();
    await screen.findByText('Acme Corp');

    await user.click(screen.getByRole('button', { name: /export/i }));

    await waitFor(() => expect(h.show).toHaveBeenCalledWith('Network down', 'error'));
    expect(h.downloadCsv).not.toHaveBeenCalled();
  });

  it('falls back to a generic message for non-Error export failures', async () => {
    const user = userEvent.setup();
    h.listAccounts
      .mockResolvedValueOnce(pageResult([makeAccount()]))
      .mockRejectedValueOnce('not-an-error');
    renderPage();
    await screen.findByText('Acme Corp');

    await user.click(screen.getByRole('button', { name: /export/i }));

    await waitFor(() => expect(h.show).toHaveBeenCalledWith('Export failed', 'error'));
  });
});
