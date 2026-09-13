// Component tests for AccountDetailPage.
//
// External collaborators are mocked so the tests focus on page behavior:
// - accountsApi.getAccount/deleteAccount/removeAccountLink -> data + mutations
// - MetaContext.useMeta        -> owner/stage name resolution + refresh
// - SessionContext.useSession  -> RBAC (canWrite stays real)
// - toast.useToast             -> success / error feedback
// - QuickLogForm / Timeline / LinkContactModal -> stubbed children, so their own
//   network calls stay out of these tests while their wiring is still asserted
// - react-router.useNavigate   -> redirect assertions (routing stays real, so
//   `useParams` supplies the account id exactly as it does in the app)
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatCurrency, formatDate, formatDateTime } from '../../lib/format';
import type {
  Account,
  AccountDetailPayload,
  AccountLink,
  Contact,
  Opportunity,
  Stage,
  User,
} from '../../types/domain';
import AccountDetailPage from './AccountDetailPage';

const h = vi.hoisted(() => ({
  getAccount: vi.fn(),
  deleteAccount: vi.fn(),
  removeAccountLink: vi.fn(),
  useMeta: vi.fn(),
  useSession: vi.fn(),
  refresh: vi.fn(),
  show: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('./accountsApi', () => ({
  getAccount: h.getAccount,
  deleteAccount: h.deleteAccount,
  removeAccountLink: h.removeAccountLink,
}));
vi.mock('../meta/MetaContext', () => ({ useMeta: h.useMeta }));
vi.mock('../auth/SessionContext', () => ({ useSession: h.useSession }));
vi.mock('../../components/toast', () => ({ useToast: () => ({ show: h.show }) }));
vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return { ...actual, useNavigate: () => h.navigate };
});

vi.mock('../interactions/QuickLogForm', () => ({
  QuickLogForm: ({
    accountId,
    contacts,
    onSaved,
  }: {
    accountId?: string;
    contacts?: { id: string; name: string }[];
    onSaved: () => void;
  }) => (
    <div data-testid="quick-log">
      <span data-testid="quick-log-account">{accountId}</span>
      <span data-testid="quick-log-contacts">{(contacts ?? []).map((c) => c.name).join('|')}</span>
      <button onClick={onSaved}>stub-log-saved</button>
    </div>
  ),
}));

vi.mock('../interactions/Timeline', () => ({
  Timeline: ({ accountId }: { accountId?: string }) => (
    <div data-testid="timeline">{accountId}</div>
  ),
}));

vi.mock('./LinkContactModal', () => ({
  LinkContactModal: ({
    accountId,
    linkedContactIds,
    open,
    onClose,
    onSaved,
  }: {
    accountId: string;
    linkedContactIds: string[];
    open: boolean;
    onClose: () => void;
    onSaved: () => void;
  }) =>
    open ? (
      <div data-testid="link-modal">
        <span data-testid="link-modal-account">{accountId}</span>
        <span data-testid="link-modal-linked">{linkedContactIds.join(',')}</span>
        <button onClick={onSaved}>stub-link-saved</button>
        <button onClick={onClose}>stub-link-close</button>
      </div>
    ) : null,
}));

const ADMIN: User = { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin' };
const READONLY: User = { id: 'u3', name: 'Rea Donly', email: 'rea@example.com', role: 'readonly' };

const STAGE: Stage = {
  id: 's1',
  name: 'Discovery',
  order: 1,
  winProbability: 30,
  classification: 'open',
};

const USER_NAMES: Record<string, string> = { u1: 'Ada Lovelace', u2: 'Ben Smith' };

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'a1',
    name: 'Acme Corp',
    industry: 'SaaS',
    website: 'https://acme.test',
    phone: '555-0100',
    billingAddress: '1 Main St',
    ownerId: 'u2',
    notes: 'Renewal in Q3',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'u1',
    updatedAt: '2026-02-03T09:30:00Z',
    updatedBy: 'u2',
    ...overrides,
  };
}

function makeContact(
  overrides: Partial<Contact & { link?: AccountLink }> = {},
): Contact & { link?: AccountLink } {
  return {
    id: 'c1',
    firstName: 'Grace',
    lastName: 'Hopper',
    status: 'active',
    accountLinks: [],
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'u1',
    updatedAt: '2026-01-02T00:00:00Z',
    updatedBy: 'u1',
    ...overrides,
  };
}

function makeOpportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: 'o1',
    name: 'Platform renewal',
    accountId: 'a1',
    valueMinor: 250000,
    currency: 'USD',
    expectedCloseDate: '2026-06-30',
    stageId: 's1',
    probability: 30,
    probabilityManual: false,
    ownerId: 'u2',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'u1',
    updatedAt: '2026-01-02T00:00:00Z',
    updatedBy: 'u1',
    ...overrides,
  };
}

function payload(overrides: Partial<AccountDetailPayload> = {}): AccountDetailPayload {
  return {
    account: makeAccount(),
    contacts: [],
    opportunities: [],
    ...overrides,
  };
}

function renderPage(id = 'a1') {
  return render(
    <MemoryRouter initialEntries={[`/accounts/${id}`]}>
      <Routes>
        <Route path="/accounts/:id" element={<AccountDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AccountDetailPage', () => {
  // Vitest globals are disabled, so RTL's automatic cleanup does not run.
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    h.refresh.mockResolvedValue(undefined);
    h.useMeta.mockReturnValue({
      userName: (id?: string) => USER_NAMES[id ?? ''] ?? 'Unknown',
      stageById: (id: string) => (id === STAGE.id ? STAGE : undefined),
      refresh: h.refresh,
    });
    h.useSession.mockReturnValue({ user: ADMIN });
    h.getAccount.mockResolvedValue(payload());
    h.deleteAccount.mockResolvedValue(undefined);
    h.removeAccountLink.mockResolvedValue(makeContact());
  });

  describe('query states', () => {
    it('shows the loading block while the account is being fetched', () => {
      h.getAccount.mockImplementationOnce(() => new Promise(() => {}));

      renderPage();

      expect(screen.getByText('Loading account…')).toBeInTheDocument();
      expect(h.getAccount).toHaveBeenCalledWith('a1');
    });

    it('shows the error banner when the fetch fails', async () => {
      h.getAccount.mockRejectedValue(new Error('Account is unavailable'));

      renderPage();

      expect(await screen.findByText('Account is unavailable')).toBeInTheDocument();
      expect(screen.queryByText('Loading account…')).not.toBeInTheDocument();
    });

    it('falls back to a not-found banner when the payload is empty', async () => {
      h.getAccount.mockResolvedValue(null);

      renderPage();

      expect(await screen.findByText('Account not found.')).toBeInTheDocument();
    });
  });

  describe('rendered record', () => {
    it('renders the header, details, and record history', async () => {
      renderPage();

      expect(await screen.findByRole('heading', { name: 'Acme Corp' })).toBeInTheDocument();
      expect(screen.getByText('SaaS · Owned by Ben Smith')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Back to accounts/ })).toHaveAttribute(
        'href',
        '/accounts',
      );

      // Detail card renders only the populated optional fields.
      expect(screen.getByText('https://acme.test')).toBeInTheDocument();
      expect(screen.getByText('555-0100')).toBeInTheDocument();
      expect(screen.getByText('1 Main St')).toBeInTheDocument();
      expect(screen.getByText('Renewal in Q3')).toBeInTheDocument();

      // Audit trail resolves user ids through meta and formats timestamps.
      expect(
        screen.getByText(`Ada Lovelace · ${formatDateTime('2026-01-01T00:00:00Z')}`),
      ).toBeInTheDocument();
      expect(
        screen.getByText(`Ben Smith · ${formatDateTime('2026-02-03T09:30:00Z')}`),
      ).toBeInTheDocument();

      // Child widgets receive the account context.
      expect(screen.getByTestId('quick-log-account')).toHaveTextContent('a1');
      expect(screen.getByTestId('timeline')).toHaveTextContent('a1');
    });

    it('falls back for a missing industry and hides absent detail fields', async () => {
      h.getAccount.mockResolvedValue(
        payload({
          account: makeAccount({
            industry: undefined,
            website: undefined,
            phone: undefined,
            billingAddress: undefined,
            notes: undefined,
            ownerId: 'nobody',
          }),
        }),
      );

      renderPage();

      expect(await screen.findByText('No industry · Owned by Unknown')).toBeInTheDocument();
      expect(screen.queryByText('https://acme.test')).not.toBeInTheDocument();
      expect(screen.queryByText('555-0100')).not.toBeInTheDocument();
      expect(screen.queryByText('1 Main St')).not.toBeInTheDocument();
      expect(screen.queryByText('Renewal in Q3')).not.toBeInTheDocument();
    });

    it('renders linked contacts with primary badge and relationship role', async () => {
      h.getAccount.mockResolvedValue(
        payload({
          contacts: [
            makeContact({ link: { accountId: 'a1', primary: true, role: 'Decision maker' } }),
            makeContact({ id: 'c2', firstName: 'Alan', lastName: 'Turing' }),
          ],
        }),
      );

      renderPage();

      expect(await screen.findByRole('link', { name: /Grace Hopper/ })).toHaveAttribute(
        'href',
        '/contacts/c1',
      );
      expect(screen.getByRole('link', { name: /Alan Turing/ })).toHaveAttribute(
        'href',
        '/contacts/c2',
      );
      expect(screen.getByText('Primary')).toBeInTheDocument();
      expect(screen.getByText('· Decision maker')).toBeInTheDocument();
      // The second contact has no link metadata, so no badge/role is rendered.
      expect(screen.getAllByText('Primary')).toHaveLength(1);
      // Contacts are also offered to the quick-log form.
      expect(screen.getByTestId('quick-log-contacts')).toHaveTextContent(
        'Grace Hopper|Alan Turing',
      );
    });

    it('renders opportunities with stage, value, and close date', async () => {
      h.getAccount.mockResolvedValue({
        ...payload(),
        opportunities: [makeOpportunity()],
      });

      renderPage();

      const link = await screen.findByRole('link', { name: /Platform renewal/ });
      expect(link).toHaveAttribute('href', '/opportunities/o1');
      expect(within(link).getByText(formatDate('2026-06-30'))).toBeInTheDocument();
      expect(within(link).getByText('Discovery')).toBeInTheDocument();
      expect(within(link).getByText(formatCurrency(250000, 'USD'))).toBeInTheDocument();
    });

    it('tolerates an opportunity whose stage is unknown to meta', async () => {
      h.getAccount.mockResolvedValue({
        ...payload(),
        opportunities: [makeOpportunity({ stageId: 'missing' })],
      });

      renderPage();

      expect(await screen.findByRole('link', { name: /Platform renewal/ })).toBeInTheDocument();
      expect(screen.queryByText('Discovery')).not.toBeInTheDocument();
    });

    it('renders both empty states when there are no relations', async () => {
      renderPage();

      expect(await screen.findByText('No contacts linked yet.')).toBeInTheDocument();
      expect(screen.getByText('No opportunities for this account.')).toBeInTheDocument();
    });
  });

  describe('navigation', () => {
    it('routes to the edit form from the Edit button', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByRole('heading', { name: 'Acme Corp' });

      await user.click(screen.getByRole('button', { name: /Edit/ }));

      expect(h.navigate).toHaveBeenCalledWith('/accounts/a1/edit');
    });
  });

  describe('delete', () => {
    it('asks for confirmation in an in-app dialog before deleting', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByRole('heading', { name: 'Acme Corp' });

      await user.click(screen.getByRole('button', { name: /Delete/ }));

      expect(
        await screen.findByText(
          'Delete this account? It can be restored by an administrator within 30 days.',
        ),
      ).toBeInTheDocument();
      expect(h.deleteAccount).not.toHaveBeenCalled();
    });

    it('deletes after confirmation, refreshes meta, and returns to the list', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByRole('heading', { name: 'Acme Corp' });

      await user.click(screen.getByRole('button', { name: /Delete/ }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(h.deleteAccount).toHaveBeenCalledWith('a1'));
      expect(h.show).toHaveBeenCalledWith('Account deleted', 'success');
      expect(h.refresh).toHaveBeenCalledTimes(1);
      expect(h.navigate).toHaveBeenCalledWith('/accounts');
    });

    it('does nothing when the confirmation is dismissed', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByRole('heading', { name: 'Acme Corp' });

      await user.click(screen.getByRole('button', { name: /Delete/ }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

      expect(h.deleteAccount).not.toHaveBeenCalled();
      expect(h.navigate).not.toHaveBeenCalled();
    });

    it('shows the server message when the delete fails', async () => {
      const user = userEvent.setup();
      h.deleteAccount.mockRejectedValueOnce(new Error('Account has open opportunities'));
      renderPage();
      await screen.findByRole('heading', { name: 'Acme Corp' });

      await user.click(screen.getByRole('button', { name: /Delete/ }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

      await waitFor(() =>
        expect(h.show).toHaveBeenCalledWith('Account has open opportunities', 'error'),
      );
      expect(h.navigate).not.toHaveBeenCalled();
    });

    it('falls back to a generic message for non-Error delete failures', async () => {
      const user = userEvent.setup();
      h.deleteAccount.mockRejectedValueOnce('not-an-error');
      renderPage();
      await screen.findByRole('heading', { name: 'Acme Corp' });

      await user.click(screen.getByRole('button', { name: /Delete/ }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(h.show).toHaveBeenCalledWith('Delete failed', 'error'));
    });
  });

  describe('unlink contact', () => {
    beforeEach(() => {
      h.getAccount.mockResolvedValue(
        payload({
          contacts: [makeContact({ link: { accountId: 'a1', primary: false, role: '' } })],
        }),
      );
    });

    it('asks for confirmation in an in-app dialog before unlinking', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByRole('link', { name: /Grace Hopper/ });

      await user.click(screen.getByRole('button', { name: 'Unlink Grace Hopper' }));

      expect(
        await screen.findByText(
          'Unlink Grace Hopper from this account? The contact record is kept.',
        ),
      ).toBeInTheDocument();
      expect(h.removeAccountLink).not.toHaveBeenCalled();
    });

    it('unlinks after confirmation and reloads the record', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByRole('link', { name: /Grace Hopper/ });

      await user.click(screen.getByRole('button', { name: 'Unlink Grace Hopper' }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Unlink' }));

      await waitFor(() => expect(h.removeAccountLink).toHaveBeenCalledWith('a1', 'c1'));
      expect(h.show).toHaveBeenCalledWith('Contact unlinked', 'success');
      // The reload key changes, so the detail query runs again.
      await waitFor(() => expect(h.getAccount).toHaveBeenCalledTimes(2));
    });

    it('does nothing when the confirmation is dismissed', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByRole('link', { name: /Grace Hopper/ });

      await user.click(screen.getByRole('button', { name: 'Unlink Grace Hopper' }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

      expect(h.removeAccountLink).not.toHaveBeenCalled();
      expect(h.getAccount).toHaveBeenCalledTimes(1);
    });

    it('shows the server message when unlinking fails', async () => {
      const user = userEvent.setup();
      h.removeAccountLink.mockRejectedValueOnce(new Error('Link no longer exists'));
      renderPage();
      await screen.findByRole('link', { name: /Grace Hopper/ });

      await user.click(screen.getByRole('button', { name: 'Unlink Grace Hopper' }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Unlink' }));

      await waitFor(() => expect(h.show).toHaveBeenCalledWith('Link no longer exists', 'error'));
      expect(h.getAccount).toHaveBeenCalledTimes(1);
    });

    it('falls back to a generic message for non-Error unlink failures', async () => {
      const user = userEvent.setup();
      h.removeAccountLink.mockRejectedValueOnce('not-an-error');
      renderPage();
      await screen.findByRole('link', { name: /Grace Hopper/ });

      await user.click(screen.getByRole('button', { name: 'Unlink Grace Hopper' }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Unlink' }));

      await waitFor(() => expect(h.show).toHaveBeenCalledWith('Unlink failed', 'error'));
    });
  });

  describe('link contact modal', () => {
    beforeEach(() => {
      h.getAccount.mockResolvedValue(payload({ contacts: [makeContact()] }));
    });

    it('opens the modal with the account and already-linked ids', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByRole('link', { name: /Grace Hopper/ });

      expect(screen.queryByTestId('link-modal')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /Link contact/ }));

      expect(screen.getByTestId('link-modal-account')).toHaveTextContent('a1');
      expect(screen.getByTestId('link-modal-linked')).toHaveTextContent('c1');
    });

    it('reloads the record after a successful link and closes on demand', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByRole('link', { name: /Grace Hopper/ });

      await user.click(screen.getByRole('button', { name: /Link contact/ }));
      await user.click(screen.getByRole('button', { name: 'stub-link-saved' }));

      await waitFor(() => expect(h.getAccount).toHaveBeenCalledTimes(2));

      await user.click(screen.getByRole('button', { name: 'stub-link-close' }));
      expect(screen.queryByTestId('link-modal')).not.toBeInTheDocument();
    });

    it('reloads the record when an interaction is logged', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByRole('link', { name: /Grace Hopper/ });

      await user.click(screen.getByRole('button', { name: 'stub-log-saved' }));

      await waitFor(() => expect(h.getAccount).toHaveBeenCalledTimes(2));
    });
  });

  describe('missing route param', () => {
    /** Renders the page on a route that carries no `:id` segment. */
    function renderWithoutId() {
      return render(
        <MemoryRouter initialEntries={['/accounts']}>
          <Routes>
            <Route path="/accounts" element={<AccountDetailPage />} />
          </Routes>
        </MemoryRouter>,
      );
    }

    beforeEach(() => {
      h.getAccount.mockResolvedValue(
        payload({
          contacts: [makeContact({ link: { accountId: 'a1', primary: false, role: '' } })],
        }),
      );
    });

    it('falls back to an empty id when fetching and unlinking', async () => {
      const user = userEvent.setup();
      renderWithoutId();

      await screen.findByRole('link', { name: /Grace Hopper/ });
      expect(h.getAccount).toHaveBeenCalledWith('');

      await user.click(screen.getByRole('button', { name: 'Unlink Grace Hopper' }));
      const unlinkDialog = await screen.findByRole('dialog');
      await user.click(within(unlinkDialog).getByRole('button', { name: 'Unlink' }));

      await waitFor(() => expect(h.removeAccountLink).toHaveBeenCalledWith('', 'c1'));
    });

    it('falls back to an empty id when deleting', async () => {
      const user = userEvent.setup();
      renderWithoutId();
      await screen.findByRole('heading', { name: 'Acme Corp' });

      await user.click(screen.getByRole('button', { name: /Delete/ }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(h.deleteAccount).toHaveBeenCalledWith(''));
      expect(h.navigate).toHaveBeenCalledWith('/accounts');
    });
  });

  describe('read-only access', () => {
    beforeEach(() => {
      h.useSession.mockReturnValue({ user: READONLY });
      h.getAccount.mockResolvedValue(
        payload({
          contacts: [makeContact({ link: { accountId: 'a1', primary: true, role: 'Champion' } })],
        }),
      );
    });

    it('hides the link and unlink controls for read-only users', async () => {
      renderPage();

      await screen.findByRole('link', { name: /Grace Hopper/ });
      expect(screen.queryByRole('button', { name: /Link contact/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Unlink Grace Hopper' })).not.toBeInTheDocument();
      // Read-only users still see the record itself.
      expect(screen.getByText('Primary')).toBeInTheDocument();
    });
  });
});
