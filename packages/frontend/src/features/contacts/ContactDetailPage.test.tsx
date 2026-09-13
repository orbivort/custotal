// Component tests for ContactDetailPage.
//
// External collaborators are mocked so the tests focus on page behavior:
// - contactsApi.getContact/deleteContact/exportContact -> data + mutations
// - MetaContext.useMeta        -> account/user name resolution + refresh
// - toast.useToast             -> success / error feedback
// - QuickLogForm / Timeline    -> stubbed children, so their own network calls
//   stay out of these tests while their wiring is still asserted
// - react-router.useNavigate   -> redirect assertions (routing stays real, so
//   `useParams` supplies the contact id exactly as it does in the app)
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDateTime } from '../../lib/format';
import type { AccountLink, Contact, ContactExportPayload, User } from '../../types/domain';
import ContactDetailPage from './ContactDetailPage';

const h = vi.hoisted(() => ({
  getContact: vi.fn(),
  deleteContact: vi.fn(),
  exportContact: vi.fn(),
  useMeta: vi.fn(),
  refresh: vi.fn(),
  show: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('./contactsApi', () => ({
  getContact: h.getContact,
  deleteContact: h.deleteContact,
  exportContact: h.exportContact,
}));
vi.mock('../meta/MetaContext', () => ({ useMeta: h.useMeta }));
vi.mock('../../components/toast', () => ({ useToast: () => ({ show: h.show }) }));
vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return { ...actual, useNavigate: () => h.navigate };
});

vi.mock('../interactions/QuickLogForm', () => ({
  QuickLogForm: ({
    contactId,
    accountId,
    onSaved,
  }: {
    contactId?: string;
    accountId?: string;
    onSaved: () => void;
  }) => (
    <div data-testid="quick-log">
      <span data-testid="quick-log-contact">{contactId}</span>
      <span data-testid="quick-log-account">{accountId}</span>
      <button onClick={onSaved}>stub-log-saved</button>
    </div>
  ),
}));

vi.mock('../interactions/Timeline', () => ({
  Timeline: ({ contactId }: { contactId?: string }) => (
    <div data-testid="timeline">{contactId}</div>
  ),
}));

const ACCOUNTS = [
  { id: 'acc1', name: 'Acme Corp', ownerId: 'u1' },
  { id: 'acc2', name: 'Initech', ownerId: 'u2' },
];

const USER_NAMES: Record<string, string> = { u1: 'Ada Lovelace', u2: 'Ben Smith' };

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'c1',
    firstName: 'Grace',
    lastName: 'Hopper',
    email: 'grace@example.com',
    phone: '555-0100',
    jobTitle: 'Rear Admiral',
    company: 'US Navy',
    address: '1 Navy Yard',
    notes: 'Met at the conference',
    status: 'active',
    accountLinks: [{ accountId: 'acc1', primary: true, role: 'Decision maker' }],
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'u1',
    updatedAt: '2026-02-03T09:30:00Z',
    updatedBy: 'u2',
    ...overrides,
  };
}

function link(accountId: string, primary = false, role = ''): AccountLink {
  return { accountId, primary, role };
}

function exportPayload(contact: Contact): ContactExportPayload {
  return { contact, interactions: [], opportunities: [], tasks: [] };
}

/** Renders the page on the `/contacts/:id` route so `useParams` resolves `id`. */
function renderPage(id = 'c1') {
  return render(
    <MemoryRouter initialEntries={[`/contacts/${id}`]}>
      <Routes>
        <Route path="/contacts/:id" element={<ContactDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

// jsdom implements neither `URL.createObjectURL` nor anchor download navigation,
// so both are stubbed to let the JSON export run headlessly.
let clickedAnchor: { href: string; download: string } | undefined;
const createObjectURL = vi.fn(() => 'blob:contact-export');
const revokeObjectURL = vi.fn();

vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
  this: HTMLAnchorElement,
) {
  clickedAnchor = { href: this.href, download: this.download };
});

describe('ContactDetailPage', () => {
  // Vitest globals are disabled, so RTL's automatic cleanup does not run.
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    clickedAnchor = undefined;
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    h.refresh.mockResolvedValue(undefined);
    h.useMeta.mockReturnValue({
      accounts: ACCOUNTS,
      accountName: (id?: string) => ACCOUNTS.find((a) => a.id === id)?.name ?? 'Unknown',
      userName: (id?: string) => USER_NAMES[id ?? ''] ?? 'Unknown',
      refresh: h.refresh,
      users: [] as User[],
    });
    h.getContact.mockResolvedValue(makeContact());
    h.deleteContact.mockResolvedValue(undefined);
    h.exportContact.mockResolvedValue(exportPayload(makeContact()));
  });

  describe('query states', () => {
    it('shows the loading block while the contact is being fetched', () => {
      h.getContact.mockImplementationOnce(() => new Promise(() => {}));

      renderPage();

      expect(screen.getByText('Loading contact…')).toBeInTheDocument();
      expect(h.getContact).toHaveBeenCalledWith('c1');
    });

    it('shows the error banner when the fetch fails', async () => {
      h.getContact.mockRejectedValue(new Error('Contact is unavailable'));

      renderPage();

      expect(await screen.findByText('Contact is unavailable')).toBeInTheDocument();
      expect(screen.queryByText('Loading contact…')).not.toBeInTheDocument();
    });

    it('falls back to a not-found banner when the payload is empty', async () => {
      h.getContact.mockResolvedValue(null);

      renderPage();

      expect(await screen.findByText('Contact not found.')).toBeInTheDocument();
    });
  });

  describe('rendered record', () => {
    it('renders the header, contact details, and record history', async () => {
      renderPage();

      expect(await screen.findByRole('heading', { name: 'Grace Hopper' })).toBeInTheDocument();
      expect(screen.getByText('Rear Admiral · US Navy')).toBeInTheDocument();
      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Back to contacts/ })).toHaveAttribute(
        'href',
        '/contacts',
      );

      expect(screen.getByText('grace@example.com')).toBeInTheDocument();
      expect(screen.getByText('555-0100')).toBeInTheDocument();
      expect(screen.getByText('1 Navy Yard')).toBeInTheDocument();
      expect(screen.getByText('Met at the conference')).toBeInTheDocument();

      // Linked accounts resolve their name through meta and flag the primary one.
      expect(screen.getByRole('link', { name: /Acme Corp/ })).toHaveAttribute(
        'href',
        '/accounts/acc1',
      );
      expect(screen.getByText('Primary')).toBeInTheDocument();
      expect(screen.getByText('Decision maker')).toBeInTheDocument();

      // Audit trail resolves user ids through meta and formats timestamps.
      expect(
        screen.getByText(`Ada Lovelace · ${formatDateTime('2026-01-01T00:00:00Z')}`),
      ).toBeInTheDocument();
      expect(
        screen.getByText(`Ben Smith · ${formatDateTime('2026-02-03T09:30:00Z')}`),
      ).toBeInTheDocument();

      // Child widgets receive the contact and its primary account.
      expect(screen.getByTestId('quick-log-contact')).toHaveTextContent('c1');
      expect(screen.getByTestId('quick-log-account')).toHaveTextContent('acc1');
      expect(screen.getByTestId('timeline')).toHaveTextContent('c1');
    });

    it('falls back to a dash and hides absent optional details', async () => {
      h.getContact.mockResolvedValue(
        makeContact({
          email: undefined,
          phone: undefined,
          address: undefined,
          notes: undefined,
        }),
      );

      renderPage();

      await screen.findByRole('heading', { name: 'Grace Hopper' });
      // Two detail rows fall back to the em dash.
      expect(screen.getAllByText('—')).toHaveLength(2);
      expect(screen.queryByText('1 Navy Yard')).not.toBeInTheDocument();
      expect(screen.queryByText('Met at the conference')).not.toBeInTheDocument();
    });

    it('shows an inactive badge and a title fallback when job and company are missing', async () => {
      h.getContact.mockResolvedValue(
        makeContact({ jobTitle: undefined, company: undefined, status: 'inactive' }),
      );

      renderPage();

      expect(await screen.findByText('No title on file')).toBeInTheDocument();
      expect(screen.getByText('Inactive')).toBeInTheDocument();
    });

    it('renders only the job title when the company is missing', async () => {
      h.getContact.mockResolvedValue(makeContact({ company: undefined }));

      renderPage();

      expect(await screen.findByText('Rear Admiral')).toBeInTheDocument();
    });

    it('renders the empty state when no accounts are linked', async () => {
      h.getContact.mockResolvedValue(makeContact({ accountLinks: [] }));

      renderPage();

      expect(await screen.findByText('No accounts linked.')).toBeInTheDocument();
      // No primary account exists, so the quick-log form gets an empty id.
      expect(screen.getByTestId('quick-log-account')).toBeEmptyDOMElement();
    });

    it('resolves the primary account when no link is flagged primary', async () => {
      h.getContact.mockResolvedValue(
        makeContact({ accountLinks: [link('acc2', false, 'Champion')] }),
      );

      renderPage();

      await screen.findByRole('link', { name: /Initech/ });
      expect(screen.getByTestId('quick-log-account')).toHaveTextContent('acc2');
      expect(screen.queryByText('Primary')).not.toBeInTheDocument();
    });

    it('refreshes meta when a linked account is missing from the cache', async () => {
      h.getContact.mockResolvedValue(makeContact({ accountLinks: [link('acc-missing')] }));

      renderPage();

      await screen.findByRole('heading', { name: 'Grace Hopper' });
      await waitFor(() => expect(h.refresh).toHaveBeenCalledTimes(1));
      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });

    it('does not refresh meta when every linked account is cached', async () => {
      renderPage();

      await screen.findByRole('link', { name: /Acme Corp/ });
      expect(h.refresh).not.toHaveBeenCalled();
    });
  });

  describe('navigation and reload', () => {
    it('routes to the edit form from the Edit button', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByRole('heading', { name: 'Grace Hopper' });

      await user.click(screen.getByRole('button', { name: /Edit/ }));

      expect(h.navigate).toHaveBeenCalledWith('/contacts/c1/edit');
    });

    it('reloads the record when an interaction is logged', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByRole('heading', { name: 'Grace Hopper' });

      await user.click(screen.getByRole('button', { name: 'stub-log-saved' }));

      await waitFor(() => expect(h.getContact).toHaveBeenCalledTimes(2));
    });
  });

  describe('delete', () => {
    it('asks for confirmation in an in-app dialog before deleting', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByRole('heading', { name: 'Grace Hopper' });

      await user.click(screen.getByRole('button', { name: /Delete/ }));

      expect(
        await screen.findByText(
          'Delete this contact? It can be restored by an administrator within 30 days.',
        ),
      ).toBeInTheDocument();
      expect(h.deleteContact).not.toHaveBeenCalled();
    });

    it('deletes after confirmation and returns to the list', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByRole('heading', { name: 'Grace Hopper' });

      await user.click(screen.getByRole('button', { name: /Delete/ }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(h.deleteContact).toHaveBeenCalledWith('c1'));
      expect(h.show).toHaveBeenCalledWith('Contact deleted', 'success');
      expect(h.navigate).toHaveBeenCalledWith('/contacts');
    });

    it('does nothing when the confirmation is dismissed', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByRole('heading', { name: 'Grace Hopper' });

      await user.click(screen.getByRole('button', { name: /Delete/ }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

      expect(
        screen.queryByText(
          'Delete this contact? It can be restored by an administrator within 30 days.',
        ),
      ).not.toBeInTheDocument();
      expect(h.deleteContact).not.toHaveBeenCalled();
      expect(h.navigate).not.toHaveBeenCalled();
    });

    it('shows the server message when the delete fails', async () => {
      const user = userEvent.setup();
      h.deleteContact.mockRejectedValueOnce(new Error('Contact has open opportunities'));
      renderPage();
      await screen.findByRole('heading', { name: 'Grace Hopper' });

      await user.click(screen.getByRole('button', { name: /Delete/ }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

      await waitFor(() =>
        expect(h.show).toHaveBeenCalledWith('Contact has open opportunities', 'error'),
      );
      expect(h.navigate).not.toHaveBeenCalled();
    });

    it('falls back to a generic message for non-Error delete failures', async () => {
      const user = userEvent.setup();
      h.deleteContact.mockRejectedValueOnce('not-an-error');
      renderPage();
      await screen.findByRole('heading', { name: 'Grace Hopper' });

      await user.click(screen.getByRole('button', { name: /Delete/ }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(h.show).toHaveBeenCalledWith('Delete failed', 'error'));
    });
  });

  describe('export', () => {
    it('downloads the record as JSON without leaving the page', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByRole('heading', { name: 'Grace Hopper' });

      await user.click(screen.getByRole('button', { name: /Export data/ }));

      await waitFor(() => expect(h.exportContact).toHaveBeenCalledWith('c1'));
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(clickedAnchor).toMatchObject({
        href: 'blob:contact-export',
        download: 'Grace-Hopper-export.json',
      });
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:contact-export');
      expect(h.show).not.toHaveBeenCalled();
    });

    it('shows the server message when the export fails', async () => {
      const user = userEvent.setup();
      h.exportContact.mockRejectedValueOnce(new Error('Export unavailable'));
      renderPage();
      await screen.findByRole('heading', { name: 'Grace Hopper' });

      await user.click(screen.getByRole('button', { name: /Export data/ }));

      await waitFor(() => expect(h.show).toHaveBeenCalledWith('Export unavailable', 'error'));
      expect(createObjectURL).not.toHaveBeenCalled();
    });

    it('falls back to a generic message for non-Error export failures', async () => {
      const user = userEvent.setup();
      h.exportContact.mockRejectedValueOnce('not-an-error');
      renderPage();
      await screen.findByRole('heading', { name: 'Grace Hopper' });

      await user.click(screen.getByRole('button', { name: /Export data/ }));

      await waitFor(() => expect(h.show).toHaveBeenCalledWith('Export failed', 'error'));
    });
  });

  describe('missing route param', () => {
    /** Renders the page on a route that carries no `:id` segment. */
    function renderWithoutId() {
      return render(
        <MemoryRouter initialEntries={['/contacts']}>
          <Routes>
            <Route path="/contacts" element={<ContactDetailPage />} />
          </Routes>
        </MemoryRouter>,
      );
    }

    it('falls back to an empty id when fetching, deleting, and exporting', async () => {
      const user = userEvent.setup();
      renderWithoutId();

      await screen.findByRole('heading', { name: 'Grace Hopper' });
      expect(h.getContact).toHaveBeenCalledWith('');

      await user.click(screen.getByRole('button', { name: /Delete/ }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
      await waitFor(() => expect(h.deleteContact).toHaveBeenCalledWith(''));

      await user.click(screen.getByRole('button', { name: /Export data/ }));
      await waitFor(() => expect(h.exportContact).toHaveBeenCalledWith(''));
    });
  });
});
