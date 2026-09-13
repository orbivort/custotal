// Component tests for ContactsListPage.
//
// External collaborators are mocked so the tests focus on page behavior:
// - contactsApi.listContacts   -> drives loading / data / error states
// - MetaContext.useMeta        -> users list + account-name resolution
// - toast.useToast             -> export feedback
// - lib/csv                    -> download/toCsv interception (no Blob in jsdom)
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDateTime } from '../../lib/format';
import type { Contact, PaginatedResult, User } from '../../types/domain';
import type { ContactListParams } from './contactsApi';
import ContactsListPage from './ContactsListPage';

const h = vi.hoisted(() => ({
  listContacts: vi.fn(),
  useMeta: vi.fn(),
  show: vi.fn(),
  toCsv: vi.fn(),
  downloadCsv: vi.fn(),
}));

vi.mock('./contactsApi', () => ({ listContacts: h.listContacts }));
vi.mock('../meta/MetaContext', () => ({ useMeta: h.useMeta }));
vi.mock('../../components/toast', () => ({ useToast: () => ({ show: h.show }) }));
vi.mock('../../lib/csv', () => ({ toCsv: h.toCsv, downloadCsv: h.downloadCsv }));

const USERS: User[] = [
  { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin' },
  { id: 'u2', name: 'Ben Smith', email: 'ben@example.com', role: 'rep' },
];

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'c1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    phone: '555-0100',
    jobTitle: 'Engineer',
    company: 'Analytical Engines',
    status: 'active',
    accountLinks: [],
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'u1',
    updatedAt: '2026-01-05T10:00:00Z',
    updatedBy: 'u1',
    ...overrides,
  };
}

function pageResult(items: Contact[], total = items.length): PaginatedResult<Contact> {
  return { items, total, page: 1, pageSize: 25 };
}

/** Params of the most recent listContacts call. */
function lastParams(): ContactListParams {
  return h.listContacts.mock.calls.at(-1)?.[0] ?? {};
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ContactsListPage />
    </MemoryRouter>,
  );
}

// Vitest runs without `globals: true`, so @testing-library/react cannot register
// its automatic afterEach cleanup; unmount between tests explicitly.
afterEach(() => cleanup());

describe('ContactsListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.useMeta.mockReturnValue({
      users: USERS,
      accountName: (id?: string) =>
        id === 'acc1' ? 'Acme Corp' : id === 'acc2' ? 'Initech' : 'Unknown',
    });
    h.toCsv.mockReturnValue('csv-content');
    h.listContacts.mockResolvedValue(pageResult([makeContact()]));
  });

  it('requests the first page with default filters and shows the loading state', async () => {
    let resolveList!: (value: PaginatedResult<Contact>) => void;
    h.listContacts.mockImplementationOnce(
      () => new Promise<PaginatedResult<Contact>>((resolve) => (resolveList = resolve)),
    );

    renderPage();

    expect(await screen.findByText('Loading…')).toBeInTheDocument();
    expect(h.listContacts).toHaveBeenCalledTimes(1);
    expect(lastParams()).toEqual({
      q: '',
      status: '',
      owner: '',
      letter: undefined,
      sort: 'name',
      page: 1,
      pageSize: 25,
    });

    resolveList(pageResult([]));
    await screen.findByText('No contacts found');
  });

  it('renders the contact table with account, status, and date fallbacks after load', async () => {
    const ada = makeContact();
    const grace = makeContact({
      id: 'c2',
      firstName: 'Grace',
      lastName: 'Hopper',
      email: undefined,
      company: undefined,
      accountLinks: [{ accountId: 'acc1', primary: true, role: 'billing' }],
      status: 'inactive',
      updatedAt: '2026-02-01T08:30:00Z',
    });
    const linus = makeContact({
      id: 'c3',
      firstName: 'Linus',
      lastName: 'Torvalds',
      email: 'linus@example.com',
      company: undefined,
      accountLinks: [],
      updatedAt: '2026-03-01T12:00:00Z',
    });
    // No primary link: the page falls back to the first account link.
    const margaret = makeContact({
      id: 'c4',
      firstName: 'Margaret',
      lastName: 'Hamilton',
      email: undefined,
      company: undefined,
      accountLinks: [{ accountId: 'acc2', primary: false, role: 'decision-maker' }],
      updatedAt: '2026-04-01T09:00:00Z',
    });
    h.listContacts.mockResolvedValue(pageResult([ada, grace, linus, margaret]));

    renderPage();

    // Header reflects the total.
    expect(await screen.findByRole('heading', { name: 'Contacts' })).toBeInTheDocument();
    expect(screen.getByText('4 people across your accounts')).toBeInTheDocument();
    // Each row links to its detail route.
    expect(screen.getByRole('link', { name: /Ada Lovelace/ })).toHaveAttribute(
      'href',
      '/contacts/c1',
    );
    expect(screen.getByRole('link', { name: /Grace Hopper/ })).toHaveAttribute(
      'href',
      '/contacts/c2',
    );
    expect(screen.getByRole('link', { name: /Margaret Hamilton/ })).toHaveAttribute(
      'href',
      '/contacts/c4',
    );
    // Company shown directly when set…
    expect(screen.getByText('Analytical Engines')).toBeInTheDocument();
    // …resolved through the primary account link when absent…
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    // …resolved through the first account link when no link is primary…
    expect(screen.getByText('Initech')).toBeInTheDocument();
    // …and falling back to a dash when there are no links.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
    // Email present for one row, absent for another.
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getByText('linus@example.com')).toBeInTheDocument();
    // Status badges for both contact states (the status filter also has an
    // "Active"/"Inactive" option, so scope these to the table).
    const table = screen.getByRole('table');
    expect(within(table).getAllByText('Active')).toHaveLength(3);
    expect(within(table).getByText('Inactive')).toBeInTheDocument();
    // Formatted modification date.
    expect(screen.getByText(formatDateTime(ada.updatedAt))).toBeInTheDocument();
    // The header always offers a shortcut to create a contact.
    expect(screen.getByRole('link', { name: /New contact/ })).toHaveAttribute(
      'href',
      '/contacts/new',
    );
  });

  it('renders the empty state when the result set is empty', async () => {
    h.listContacts.mockResolvedValue(pageResult([], 0));

    renderPage();

    expect(await screen.findByText('No contacts found')).toBeInTheDocument();
    expect(screen.getByText('0 people across your accounts')).toBeInTheDocument();
    expect(
      screen.getByText('Try adjusting your filters, or add a new contact.'),
    ).toBeInTheDocument();
  });

  it('renders the error banner when the query fails', async () => {
    h.listContacts.mockRejectedValue(new Error('Boom'));

    renderPage();

    expect(await screen.findByText('Boom')).toBeInTheDocument();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  });

  it('offers the status, owner, and first-letter filter options', async () => {
    renderPage();

    expect(await screen.findByRole('option', { name: 'All statuses' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Active' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Inactive' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'All owners' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Ada Lovelace' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Ben Smith' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'A–Z' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'A' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Z' })).toBeInTheDocument();
  });

  it('refetches with the selected status filter', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Analytical Engines');

    await user.selectOptions(screen.getByLabelText('Filter by status'), 'inactive');

    await waitFor(() => expect(lastParams()).toMatchObject({ status: 'inactive', page: 1 }));
  });

  it('refetches with the selected owner filter', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Analytical Engines');

    await user.selectOptions(screen.getByLabelText('Filter by owner'), 'u2');

    await waitFor(() => expect(lastParams()).toMatchObject({ owner: 'u2', page: 1 }));
  });

  it('refetches with the selected first-letter filter', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Analytical Engines');

    await user.selectOptions(screen.getByLabelText('Filter by first letter of last name'), 'B');

    await waitFor(() => expect(lastParams()).toMatchObject({ letter: 'B', page: 1 }));
  });

  it('toggles server-side sort from the Name and Modified column headers', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Analytical Engines');

    await user.click(screen.getByRole('button', { name: /^Name/ }));
    await waitFor(() => expect(lastParams()).toMatchObject({ sort: 'name_desc' }));

    await user.click(screen.getByRole('button', { name: /^Name/ }));
    await waitFor(() => expect(lastParams()).toMatchObject({ sort: 'name' }));

    await user.click(screen.getByRole('button', { name: /^Modified/ }));
    await waitFor(() => expect(lastParams()).toMatchObject({ sort: 'updated' }));

    await user.click(screen.getByRole('button', { name: /^Modified/ }));
    await waitFor(() => expect(lastParams()).toMatchObject({ sort: 'updated_desc' }));
  });

  it('pages through results with the pagination controls', async () => {
    const user = userEvent.setup();
    h.listContacts.mockResolvedValue(pageResult([makeContact()], 60));
    renderPage();
    await screen.findByText('Analytical Engines');

    // The "Showing X–Y of Z" line is split across nested spans, so assert on the
    // page indicator and the subtitle total instead.
    expect(screen.getByText('60 people across your accounts')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /next/i }));

    await waitFor(() => expect(lastParams()).toMatchObject({ page: 2 }));
  });

  it('debounces the search input and resets to page 1', async () => {
    const user = userEvent.setup();
    h.listContacts.mockResolvedValue(pageResult([makeContact()], 60));
    renderPage();
    await screen.findByText('Analytical Engines');

    // Move to page 2 first, so we can verify the search resets pagination.
    await user.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => expect(lastParams()).toMatchObject({ page: 2 }));

    await user.type(screen.getByLabelText('Search contacts'), 'ada');

    // The debounce is 250ms; allow extra headroom for the final call.
    await waitFor(() => expect(lastParams()).toMatchObject({ q: 'ada', page: 1 }), {
      timeout: 2000,
    });
  });

  it('exports the filtered result set as CSV and shows a success toast', async () => {
    const user = userEvent.setup();
    h.listContacts.mockResolvedValue(pageResult([makeContact()]));
    renderPage();
    await screen.findByText('Analytical Engines');

    await user.click(screen.getByRole('button', { name: /export/i }));

    await waitFor(() => expect(h.downloadCsv).toHaveBeenCalledWith('contacts.csv', 'csv-content'));
    expect(h.toCsv).toHaveBeenCalledWith(
      [
        'First name',
        'Last name',
        'Email',
        'Phone',
        'Job title',
        'Company',
        'Status',
        'Last modified',
      ],
      [
        [
          'Ada',
          'Lovelace',
          'ada@example.com',
          '555-0100',
          'Engineer',
          'Analytical Engines',
          'active',
          '2026-01-05T10:00:00Z',
        ],
      ],
    );
    // Export fetches the full (unpaged) result set, minus letter/sort/page.
    expect(lastParams()).toEqual({ q: '', status: '', owner: '', pageSize: 10000 });
    expect(h.show).toHaveBeenCalledWith('Exported 1 contacts', 'success');
  });

  it('exports empty strings for contacts that are missing optional fields', async () => {
    const user = userEvent.setup();
    h.listContacts.mockResolvedValue(
      pageResult([
        makeContact({
          email: undefined,
          phone: undefined,
          jobTitle: undefined,
          company: undefined,
        }),
      ]),
    );
    renderPage();
    await screen.findByRole('link', { name: /Ada Lovelace/ });

    await user.click(screen.getByRole('button', { name: /export/i }));

    await waitFor(() =>
      expect(h.toCsv).toHaveBeenCalledWith(
        [
          'First name',
          'Last name',
          'Email',
          'Phone',
          'Job title',
          'Company',
          'Status',
          'Last modified',
        ],
        [['Ada', 'Lovelace', '', '', '', '', 'active', '2026-01-05T10:00:00Z']],
      ),
    );
  });

  it('shows an error toast when the CSV export fails', async () => {
    const user = userEvent.setup();
    h.listContacts
      .mockResolvedValueOnce(pageResult([makeContact()])) // initial page load
      .mockRejectedValueOnce(new Error('Network down')); // export fetch
    renderPage();
    await screen.findByText('Analytical Engines');

    await user.click(screen.getByRole('button', { name: /export/i }));

    await waitFor(() => expect(h.show).toHaveBeenCalledWith('Network down', 'error'));
    expect(h.downloadCsv).not.toHaveBeenCalled();
  });

  it('falls back to a generic message for non-Error export failures', async () => {
    const user = userEvent.setup();
    h.listContacts
      .mockResolvedValueOnce(pageResult([makeContact()]))
      .mockRejectedValueOnce('not-an-error');
    renderPage();
    await screen.findByText('Analytical Engines');

    await user.click(screen.getByRole('button', { name: /export/i }));

    await waitFor(() => expect(h.show).toHaveBeenCalledWith('Export failed', 'error'));
  });
});
