// Component tests for AccountFormPage (create + edit modes).
//
// External collaborators are mocked so the tests focus on form behavior:
// - accountsApi.getAccount/createAccount/updateAccount -> load + save paths
// - MetaContext.useMeta    -> owner options + post-save metadata refresh
// - SessionContext.useSession -> default owner for new accounts
// - react-router.useNavigate  -> redirect assertions (routing itself stays real,
//   so `useParams` drives the create/edit distinction like in the app)
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account, AccountDetailPayload, User } from '../../types/domain';
import AccountFormPage from './AccountFormPage';

const h = vi.hoisted(() => ({
  getAccount: vi.fn(),
  createAccount: vi.fn(),
  updateAccount: vi.fn(),
  useMeta: vi.fn(),
  useSession: vi.fn(),
  refresh: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('./accountsApi', () => ({
  getAccount: h.getAccount,
  createAccount: h.createAccount,
  updateAccount: h.updateAccount,
}));
vi.mock('../meta/MetaContext', () => ({ useMeta: h.useMeta }));
vi.mock('../auth/SessionContext', () => ({ useSession: h.useSession }));
vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return { ...actual, useNavigate: () => h.navigate };
});

const USERS: User[] = [
  { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin' },
  { id: 'u2', name: 'Ben Smith', email: 'ben@example.com', role: 'rep' },
];

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'a1',
    name: 'Acme Corp',
    industry: 'SaaS',
    website: 'https://acme.test',
    phone: '555-0100',
    billingAddress: '1 Main St',
    ownerId: 'u2',
    notes: 'Key account',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'u1',
    updatedAt: '2026-01-02T00:00:00Z',
    updatedBy: 'u1',
    ...overrides,
  };
}

function detail(account: Account): AccountDetailPayload {
  return { account, contacts: [], opportunities: [] };
}

/** Renders the page in create mode (no `:id` route param). */
function renderCreate() {
  return render(
    <MemoryRouter initialEntries={['/accounts/new']}>
      <Routes>
        <Route path="/accounts/new" element={<AccountFormPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Renders the page in edit mode, where `:id` triggers the initial load. */
function renderEdit(id = 'a1') {
  return render(
    <MemoryRouter initialEntries={[`/accounts/${id}/edit`]}>
      <Routes>
        <Route path="/accounts/:id/edit" element={<AccountFormPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const NAME_FIELD = /^Account name/;

/**
 * `delay: null` drops user-event's per-keystroke `setTimeout`. The heavy tests
 * below type ~80 characters, and those timer round-trips pushed the slowest one
 * past Vitest's 5s default on a loaded machine; the abandoned async body then
 * kept typing into the *next* test's DOM and corrupted it.
 */
function setupUser() {
  return userEvent.setup({ delay: null });
}

describe('AccountFormPage', () => {
  // Vitest globals are disabled, so RTL's automatic cleanup does not run.
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    h.refresh.mockResolvedValue(undefined);
    h.useMeta.mockReturnValue({ users: USERS, refresh: h.refresh });
    h.useSession.mockReturnValue({ user: USERS[0] });
    h.getAccount.mockResolvedValue(detail(makeAccount()));
    h.createAccount.mockResolvedValue(makeAccount({ id: 'a9', name: 'Globex' }));
    h.updateAccount.mockResolvedValue(makeAccount());
  });

  describe('create mode', () => {
    it('renders an empty form defaulted to the signed-in owner', () => {
      renderCreate();

      expect(screen.getByRole('heading', { name: 'New account' })).toBeInTheDocument();
      expect(
        screen.getByText('Organizations are the anchor for contacts and deals.'),
      ).toBeInTheDocument();
      // No record to load, so the loading block is skipped entirely.
      expect(h.getAccount).not.toHaveBeenCalled();
      expect(screen.queryByText('Loading account…')).not.toBeInTheDocument();

      expect(screen.getByLabelText(NAME_FIELD)).toHaveValue('');
      expect(screen.getByLabelText('Industry')).toHaveValue('');
      expect(screen.getByLabelText('Owner')).toHaveValue('u1');
      expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Back/ })).toHaveAttribute('href', '/accounts');
    });

    it('offers every meta user as an owner option', () => {
      renderCreate();

      expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
        'Ada Lovelace',
        'Ben Smith',
      ]);
    });

    it('blocks submission and shows a field error when the name is blank', async () => {
      const user = setupUser();
      renderCreate();

      await user.type(screen.getByLabelText(NAME_FIELD), '   ');
      await user.click(screen.getByRole('button', { name: 'Create account' }));

      expect(await screen.findByText('Account name is required.')).toBeInTheDocument();
      expect(h.createAccount).not.toHaveBeenCalled();
    });

    it('clears the field error once a valid name is submitted', async () => {
      const user = setupUser();
      renderCreate();

      await user.click(screen.getByRole('button', { name: 'Create account' }));
      expect(await screen.findByText('Account name is required.')).toBeInTheDocument();

      await user.type(screen.getByLabelText(NAME_FIELD), 'Globex');
      await user.click(screen.getByRole('button', { name: 'Create account' }));

      await waitFor(() => expect(h.createAccount).toHaveBeenCalledTimes(1));
      expect(screen.queryByText('Account name is required.')).not.toBeInTheDocument();
    });

    it('creates the account with trimmed values, refreshes meta, and redirects', async () => {
      const user = setupUser();
      renderCreate();

      await user.type(screen.getByLabelText(NAME_FIELD), '  Globex  ');
      await user.type(screen.getByLabelText('Industry'), ' Manufacturing ');
      await user.type(screen.getByLabelText('Website'), ' https://globex.test ');
      await user.type(screen.getByLabelText('Phone'), ' 555-0199 ');
      await user.type(screen.getByLabelText('Billing address'), ' 2 Elm St ');
      await user.type(screen.getByLabelText('Notes'), ' Prospect ');
      await user.selectOptions(screen.getByLabelText('Owner'), 'u2');
      await user.click(screen.getByRole('button', { name: 'Create account' }));

      await waitFor(() =>
        expect(h.createAccount).toHaveBeenCalledWith({
          name: 'Globex',
          industry: 'Manufacturing',
          website: 'https://globex.test',
          phone: '555-0199',
          billingAddress: '2 Elm St',
          ownerId: 'u2',
          notes: 'Prospect',
        }),
      );
      // Create never sends the optimistic-lock token.
      expect(h.createAccount.mock.calls[0][0]).not.toHaveProperty('updatedAt');
      expect(h.refresh).toHaveBeenCalledTimes(1);
      expect(h.navigate).toHaveBeenCalledWith('/accounts/a9');
    });

    it('sends an empty owner when there is no signed-in user', async () => {
      const user = setupUser();
      h.useSession.mockReturnValue({ user: null });
      renderCreate();

      await user.type(screen.getByLabelText(NAME_FIELD), 'Globex');
      await user.click(screen.getByRole('button', { name: 'Create account' }));

      await waitFor(() =>
        expect(h.createAccount).toHaveBeenCalledWith(expect.objectContaining({ ownerId: '' })),
      );
    });

    it('disables the submit button and shows progress while saving', async () => {
      const user = setupUser();
      let resolveCreate!: (value: Account) => void;
      h.createAccount.mockImplementationOnce(
        () => new Promise<Account>((resolve) => (resolveCreate = resolve)),
      );
      renderCreate();

      await user.type(screen.getByLabelText(NAME_FIELD), 'Globex');
      await user.click(screen.getByRole('button', { name: 'Create account' }));

      const saving = await screen.findByRole('button', { name: 'Saving…' });
      expect(saving).toBeDisabled();

      resolveCreate(makeAccount({ id: 'a9' }));

      await waitFor(() => expect(h.navigate).toHaveBeenCalledWith('/accounts/a9'));
    });

    it('shows the server message when the save fails and re-enables the form', async () => {
      const user = setupUser();
      h.createAccount.mockRejectedValueOnce(new Error('Name already in use'));
      renderCreate();

      await user.type(screen.getByLabelText(NAME_FIELD), 'Globex');
      await user.click(screen.getByRole('button', { name: 'Create account' }));

      expect(await screen.findByText('Name already in use')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled();
      expect(h.navigate).not.toHaveBeenCalled();
      expect(h.refresh).not.toHaveBeenCalled();
    });

    it('falls back to a generic message for non-Error save failures', async () => {
      const user = setupUser();
      h.createAccount.mockRejectedValueOnce('not-an-error');
      renderCreate();

      await user.type(screen.getByLabelText(NAME_FIELD), 'Globex');
      await user.click(screen.getByRole('button', { name: 'Create account' }));

      expect(await screen.findByText('Save failed')).toBeInTheDocument();
    });

    it('navigates back in history from the Cancel button', async () => {
      const user = setupUser();
      renderCreate();

      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(h.navigate).toHaveBeenCalledWith(-1);
      expect(h.createAccount).not.toHaveBeenCalled();
    });
  });

  describe('edit mode', () => {
    it('loads the account and prefills every field', async () => {
      renderEdit();

      expect(screen.getByText('Loading account…')).toBeInTheDocument();

      expect(await screen.findByRole('heading', { name: 'Edit account' })).toBeInTheDocument();
      expect(h.getAccount).toHaveBeenCalledWith('a1');
      expect(screen.getByLabelText(NAME_FIELD)).toHaveValue('Acme Corp');
      expect(screen.getByLabelText('Industry')).toHaveValue('SaaS');
      expect(screen.getByLabelText('Website')).toHaveValue('https://acme.test');
      expect(screen.getByLabelText('Phone')).toHaveValue('555-0100');
      expect(screen.getByLabelText('Billing address')).toHaveValue('1 Main St');
      expect(screen.getByLabelText('Notes')).toHaveValue('Key account');
      expect(screen.getByLabelText('Owner')).toHaveValue('u2');
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
      // Back returns to the record being edited rather than the list.
      expect(screen.getByRole('link', { name: /Back/ })).toHaveAttribute('href', '/accounts/a1');
    });

    it('normalizes missing optional fields to empty strings', async () => {
      h.getAccount.mockResolvedValue(
        detail(
          makeAccount({
            industry: undefined,
            website: undefined,
            phone: undefined,
            billingAddress: undefined,
            notes: undefined,
          }),
        ),
      );

      renderEdit();

      await screen.findByRole('heading', { name: 'Edit account' });
      expect(screen.getByLabelText('Industry')).toHaveValue('');
      expect(screen.getByLabelText('Website')).toHaveValue('');
      expect(screen.getByLabelText('Phone')).toHaveValue('');
      expect(screen.getByLabelText('Billing address')).toHaveValue('');
      expect(screen.getByLabelText('Notes')).toHaveValue('');
    });

    it('updates the account with the optimistic-lock token and redirects', async () => {
      const user = setupUser();
      renderEdit();
      await screen.findByRole('heading', { name: 'Edit account' });

      const name = screen.getByLabelText(NAME_FIELD);
      await user.clear(name);
      await user.type(name, 'Acme Corporation');
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() =>
        expect(h.updateAccount).toHaveBeenCalledWith('a1', {
          name: 'Acme Corporation',
          industry: 'SaaS',
          website: 'https://acme.test',
          phone: '555-0100',
          billingAddress: '1 Main St',
          ownerId: 'u2',
          notes: 'Key account',
          updatedAt: '2026-01-02T00:00:00Z',
        }),
      );
      expect(h.createAccount).not.toHaveBeenCalled();
      expect(h.refresh).toHaveBeenCalledTimes(1);
      expect(h.navigate).toHaveBeenCalledWith('/accounts/a1');
    });

    it('omits the conflict token when the loaded record has none', async () => {
      const user = setupUser();
      h.getAccount.mockResolvedValue(detail(makeAccount({ updatedAt: '' })));
      renderEdit();
      await screen.findByRole('heading', { name: 'Edit account' });

      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() => expect(h.updateAccount).toHaveBeenCalledTimes(1));
      expect(h.updateAccount.mock.calls[0][1]).not.toHaveProperty('updatedAt');
    });

    it('surfaces update conflicts without navigating away', async () => {
      const user = setupUser();
      h.updateAccount.mockRejectedValueOnce(new Error('The record changed since you loaded it.'));
      renderEdit();
      await screen.findByRole('heading', { name: 'Edit account' });

      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      expect(
        await screen.findByText('The record changed since you loaded it.'),
      ).toBeInTheDocument();
      expect(h.navigate).not.toHaveBeenCalled();
    });
  });
});
