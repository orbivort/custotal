// Component tests for ContactFormPage (create + edit modes).
//
// External collaborators are mocked so the tests focus on form behavior:
// - contactsApi.getContact/createContact/updateContact -> load + save paths
// - MetaContext.useMeta    -> account options for the link rows
// - react-router.useNavigate -> redirect assertions (routing itself stays real,
//   so `useParams` drives the create/edit distinction like in the app)
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Contact } from '../../types/domain';
import ContactFormPage from './ContactFormPage';

const h = vi.hoisted(() => ({
  getContact: vi.fn(),
  createContact: vi.fn(),
  updateContact: vi.fn(),
  useMeta: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('./contactsApi', () => ({
  getContact: h.getContact,
  createContact: h.createContact,
  updateContact: h.updateContact,
}));
vi.mock('../meta/MetaContext', () => ({ useMeta: h.useMeta }));
vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return { ...actual, useNavigate: () => h.navigate };
});

const ACCOUNTS = [
  { id: 'acc1', name: 'Acme Corp', ownerId: 'u1' },
  { id: 'acc2', name: 'Initech', ownerId: 'u2' },
];

// Required fields render an extra `*` marker inside their <label>, so the
// accessible label text is "First name*"/"Last name*" — match on the prefix.
const FIRST_NAME = /^First name/;
const LAST_NAME = /^Last name/;

/**
 * `delay: null` drops the artificial pause between keystrokes. The form is
 * controlled, so every character re-renders the whole page; with the default
 * delay the "fills every field" test can exceed the 5s test timeout once
 * coverage instrumentation is enabled.
 */
function setupUser() {
  return userEvent.setup({ delay: null });
}

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
    updatedAt: '2026-01-02T00:00:00Z',
    updatedBy: 'u1',
    ...overrides,
  };
}

/** Renders the page in create mode (no `:id` route param). */
function renderCreate() {
  return render(
    <MemoryRouter initialEntries={['/contacts/new']}>
      <Routes>
        <Route path="/contacts/new" element={<ContactFormPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Renders the page in edit mode, where `:id` triggers the initial load. */
function renderEdit(id = 'c1') {
  return render(
    <MemoryRouter initialEntries={[`/contacts/${id}/edit`]}>
      <Routes>
        <Route path="/contacts/:id/edit" element={<ContactFormPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ContactFormPage', () => {
  // Vitest globals are disabled, so RTL's automatic cleanup does not run.
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    h.useMeta.mockReturnValue({ accounts: ACCOUNTS });
    h.getContact.mockResolvedValue(makeContact());
    h.createContact.mockResolvedValue(
      makeContact({ id: 'c9', firstName: 'Alan', lastName: 'Turing' }),
    );
    h.updateContact.mockResolvedValue(makeContact());
  });

  describe('create mode', () => {
    it('renders an empty form with no initial load', () => {
      renderCreate();

      expect(screen.getByRole('heading', { name: 'New contact' })).toBeInTheDocument();
      expect(h.getContact).not.toHaveBeenCalled();
      expect(screen.queryByText('Loading contact…')).not.toBeInTheDocument();

      expect(screen.getByLabelText(FIRST_NAME)).toHaveValue('');
      expect(screen.getByLabelText(LAST_NAME)).toHaveValue('');
      expect(screen.getByLabelText('Email')).toHaveValue('');
      expect(screen.getByLabelText('Phone')).toHaveValue('');
      expect(screen.getByLabelText('Job title')).toHaveValue('');
      expect(screen.getByLabelText('Company')).toHaveValue('');
      expect(screen.getByLabelText('Address')).toHaveValue('');
      expect(screen.getByLabelText('Notes')).toHaveValue('');
      expect(screen.getByLabelText('Status')).toHaveValue('active');
      expect(screen.getByRole('button', { name: 'Create contact' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Back/ })).toHaveAttribute('href', '/contacts');
    });

    it('starts with no account link rows', () => {
      renderCreate();

      expect(
        screen.getByText('No accounts linked yet. A contact can belong to one or more accounts.'),
      ).toBeInTheDocument();
      expect(screen.queryByLabelText('Account')).not.toBeInTheDocument();
    });

    it('requires both names before submitting', async () => {
      const user = setupUser();
      renderCreate();

      await user.click(screen.getByRole('button', { name: 'Create contact' }));

      expect(await screen.findByText('First name is required.')).toBeInTheDocument();
      expect(screen.getByText('Last name is required.')).toBeInTheDocument();
      // With no email either, the phone requirement is surfaced too.
      expect(screen.getByText('At least one of email or phone is required.')).toBeInTheDocument();
      expect(h.createContact).not.toHaveBeenCalled();
    });

    it('treats whitespace-only names as empty', async () => {
      const user = setupUser();
      renderCreate();

      await user.type(screen.getByLabelText(FIRST_NAME), '   ');
      await user.type(screen.getByLabelText('Email'), 'grace@example.com');
      await user.click(screen.getByRole('button', { name: 'Create contact' }));

      expect(await screen.findByText('First name is required.')).toBeInTheDocument();
      expect(h.createContact).not.toHaveBeenCalled();
    });

    it('requires a phone when no email is supplied', async () => {
      const user = setupUser();
      renderCreate();

      await user.type(screen.getByLabelText(FIRST_NAME), 'Grace');
      await user.type(screen.getByLabelText(LAST_NAME), 'Hopper');
      await user.click(screen.getByRole('button', { name: 'Create contact' }));

      expect(
        await screen.findByText('At least one of email or phone is required.'),
      ).toBeInTheDocument();
      expect(h.createContact).not.toHaveBeenCalled();

      await user.type(screen.getByLabelText('Phone'), '555-0100');
      await user.click(screen.getByRole('button', { name: 'Create contact' }));

      await waitFor(() => expect(h.createContact).toHaveBeenCalledTimes(1));
      expect(
        screen.queryByText('At least one of email or phone is required.'),
      ).not.toBeInTheDocument();
    });

    it('rejects a malformed email address', async () => {
      const user = setupUser();
      renderCreate();

      await user.type(screen.getByLabelText(FIRST_NAME), 'Grace');
      await user.type(screen.getByLabelText(LAST_NAME), 'Hopper');
      await user.type(screen.getByLabelText('Email'), 'grace@localhost');
      await user.click(screen.getByRole('button', { name: 'Create contact' }));

      expect(await screen.findByText('Invalid email format.')).toBeInTheDocument();
      expect(h.createContact).not.toHaveBeenCalled();
    });

    it('creates the contact with trimmed values and redirects to the record', async () => {
      const user = setupUser();
      renderCreate();

      await user.type(screen.getByLabelText(FIRST_NAME), ' Alan ');
      await user.type(screen.getByLabelText(LAST_NAME), ' Turing ');
      await user.type(screen.getByLabelText('Email'), ' alan@example.com ');
      await user.type(screen.getByLabelText('Phone'), ' 555-0199 ');
      await user.type(screen.getByLabelText('Job title'), ' Cryptanalyst ');
      await user.type(screen.getByLabelText('Company'), ' Bletchley Park ');
      await user.type(screen.getByLabelText('Address'), ' 2 Elm St ');
      await user.type(screen.getByLabelText('Notes'), ' Met at Bletchley ');
      await user.selectOptions(screen.getByLabelText('Status'), 'inactive');
      await user.click(screen.getByRole('button', { name: 'Create contact' }));

      await waitFor(() =>
        expect(h.createContact).toHaveBeenCalledWith({
          firstName: 'Alan',
          lastName: 'Turing',
          email: 'alan@example.com',
          phone: '555-0199',
          jobTitle: 'Cryptanalyst',
          company: 'Bletchley Park',
          address: '2 Elm St',
          status: 'inactive',
          notes: 'Met at Bletchley',
          accountLinks: [],
        }),
      );
      // Create never sends the optimistic-lock token.
      expect(h.createContact.mock.calls[0][0]).not.toHaveProperty('updatedAt');
      expect(h.updateContact).not.toHaveBeenCalled();
      expect(h.navigate).toHaveBeenCalledWith('/contacts/c9');
    });

    it('disables the submit button and shows progress while saving', async () => {
      const user = setupUser();
      let resolveCreate!: (value: Contact) => void;
      h.createContact.mockImplementationOnce(
        () => new Promise<Contact>((resolve) => (resolveCreate = resolve)),
      );
      renderCreate();

      await user.type(screen.getByLabelText(FIRST_NAME), 'Alan');
      await user.type(screen.getByLabelText(LAST_NAME), 'Turing');
      await user.type(screen.getByLabelText('Email'), 'alan@example.com');
      await user.click(screen.getByRole('button', { name: 'Create contact' }));

      expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled();

      resolveCreate(makeContact({ id: 'c9' }));

      await waitFor(() => expect(h.navigate).toHaveBeenCalledWith('/contacts/c9'));
    });

    it('shows the server message when the save fails and re-enables the form', async () => {
      const user = setupUser();
      h.createContact.mockRejectedValueOnce(new Error('Email already in use'));
      renderCreate();

      await user.type(screen.getByLabelText(FIRST_NAME), 'Alan');
      await user.type(screen.getByLabelText(LAST_NAME), 'Turing');
      await user.type(screen.getByLabelText('Email'), 'alan@example.com');
      await user.click(screen.getByRole('button', { name: 'Create contact' }));

      expect(await screen.findByText('Email already in use')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Create contact' })).toBeEnabled();
      expect(h.navigate).not.toHaveBeenCalled();
    });

    it('falls back to a generic message for non-Error save failures', async () => {
      const user = setupUser();
      h.createContact.mockRejectedValueOnce('not-an-error');
      renderCreate();

      await user.type(screen.getByLabelText(FIRST_NAME), 'Alan');
      await user.type(screen.getByLabelText(LAST_NAME), 'Turing');
      await user.type(screen.getByLabelText('Email'), 'alan@example.com');
      await user.click(screen.getByRole('button', { name: 'Create contact' }));

      expect(await screen.findByText('Save failed')).toBeInTheDocument();
    });

    it('navigates back in history from the Cancel button', async () => {
      const user = setupUser();
      renderCreate();

      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(h.navigate).toHaveBeenCalledWith(-1);
      expect(h.createContact).not.toHaveBeenCalled();
    });
  });

  describe('account links', () => {
    /** Fills the required name fields so a submit can succeed. */
    async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
      await user.type(screen.getByLabelText(FIRST_NAME), 'Grace');
      await user.type(screen.getByLabelText(LAST_NAME), 'Hopper');
      await user.type(screen.getByLabelText('Email'), 'grace@example.com');
    }

    it('adds a row defaulted to primary and removes it again', async () => {
      const user = setupUser();
      renderCreate();

      await user.click(screen.getByRole('button', { name: /Add account/ }));

      expect(screen.getByLabelText('Account')).toHaveValue('');
      expect(screen.getByLabelText('Role at account')).toHaveValue('');
      // The first row added becomes the primary one.
      expect(screen.getByRole('checkbox', { name: 'Primary' })).toBeChecked();

      await user.click(screen.getByRole('button', { name: 'Remove account link' }));

      expect(screen.queryByLabelText('Account')).not.toBeInTheDocument();
      expect(
        screen.getByText('No accounts linked yet. A contact can belong to one or more accounts.'),
      ).toBeInTheDocument();
    });

    it('marks only the first row primary and keeps later rows secondary', async () => {
      const user = setupUser();
      renderCreate();

      await user.click(screen.getByRole('button', { name: /Add account/ }));
      await user.click(screen.getByRole('button', { name: /Add account/ }));

      const boxes = screen.getAllByRole('checkbox', { name: 'Primary' });
      expect(boxes).toHaveLength(2);
      expect(boxes[0]).toBeChecked();
      expect(boxes[1]).not.toBeChecked();
    });

    it('moves the primary flag to another row and can clear it entirely', async () => {
      const user = setupUser();
      renderCreate();

      await user.click(screen.getByRole('button', { name: /Add account/ }));
      await user.click(screen.getByRole('button', { name: /Add account/ }));

      // Making the second row primary clears the flag on the first.
      await user.click(screen.getAllByRole('checkbox', { name: 'Primary' })[1]);
      let boxes = screen.getAllByRole('checkbox', { name: 'Primary' });
      expect(boxes[0]).not.toBeChecked();
      expect(boxes[1]).toBeChecked();

      // Unchecking leaves no primary at all.
      await user.click(screen.getAllByRole('checkbox', { name: 'Primary' })[1]);
      boxes = screen.getAllByRole('checkbox', { name: 'Primary' });
      expect(boxes[0]).not.toBeChecked();
      expect(boxes[1]).not.toBeChecked();
    });

    it('submits only rows that have an account selected', async () => {
      const user = setupUser();
      renderCreate();
      await fillRequired(user);

      await user.click(screen.getByRole('button', { name: /Add account/ }));
      await user.click(screen.getByRole('button', { name: /Add account/ }));
      await user.selectOptions(screen.getAllByLabelText('Account')[1], 'acc2');
      await user.type(screen.getAllByLabelText('Role at account')[1], 'Champion');

      await user.click(screen.getByRole('button', { name: 'Create contact' }));

      await waitFor(() => expect(h.createContact).toHaveBeenCalledTimes(1));
      // The row left on "Select account…" is dropped. Unlike the profile fields,
      // link roles are submitted verbatim (no trimming).
      expect(h.createContact.mock.calls[0][0]).toMatchObject({
        accountLinks: [{ accountId: 'acc2', primary: false, role: 'Champion' }],
      });
    });

    it('offers every meta account as an option', async () => {
      const user = setupUser();
      renderCreate();

      await user.click(screen.getByRole('button', { name: /Add account/ }));

      // Scoped to the account select: the status select renders its own options.
      const accountSelect = screen.getByLabelText('Account');
      expect(
        within(accountSelect)
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['Select account…', 'Acme Corp', 'Initech']);
    });
  });

  describe('edit mode', () => {
    it('loads the contact and prefills every field', async () => {
      renderEdit();

      expect(screen.getByText('Loading contact…')).toBeInTheDocument();

      expect(await screen.findByRole('heading', { name: 'Edit contact' })).toBeInTheDocument();
      expect(h.getContact).toHaveBeenCalledWith('c1');
      expect(screen.getByLabelText(FIRST_NAME)).toHaveValue('Grace');
      expect(screen.getByLabelText(LAST_NAME)).toHaveValue('Hopper');
      expect(screen.getByLabelText('Email')).toHaveValue('grace@example.com');
      expect(screen.getByLabelText('Phone')).toHaveValue('555-0100');
      expect(screen.getByLabelText('Job title')).toHaveValue('Rear Admiral');
      expect(screen.getByLabelText('Company')).toHaveValue('US Navy');
      expect(screen.getByLabelText('Address')).toHaveValue('1 Navy Yard');
      expect(screen.getByLabelText('Notes')).toHaveValue('Met at the conference');
      expect(screen.getByLabelText('Status')).toHaveValue('active');
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
      // Back returns to the record being edited rather than the list.
      expect(screen.getByRole('link', { name: /Back/ })).toHaveAttribute('href', '/contacts/c1');
    });

    it('prefills the linked account rows', async () => {
      h.getContact.mockResolvedValue(
        makeContact({
          accountLinks: [
            { accountId: 'acc1', primary: true, role: 'Decision maker' },
            { accountId: 'acc2', primary: false, role: 'Champion' },
          ],
        }),
      );

      renderEdit();

      await screen.findByRole('heading', { name: 'Edit contact' });
      const accounts = screen.getAllByLabelText('Account');
      expect(accounts[0]).toHaveValue('acc1');
      expect(accounts[1]).toHaveValue('acc2');
      expect(screen.getAllByLabelText('Role at account')[0]).toHaveValue('Decision maker');
      const boxes = screen.getAllByRole('checkbox', { name: 'Primary' });
      expect(boxes[0]).toBeChecked();
      expect(boxes[1]).not.toBeChecked();
    });

    it('normalizes missing optional fields to empty strings', async () => {
      h.getContact.mockResolvedValue(
        makeContact({
          email: undefined,
          phone: undefined,
          jobTitle: undefined,
          company: undefined,
          address: undefined,
          notes: undefined,
          accountLinks: [],
        }),
      );

      renderEdit();

      await screen.findByRole('heading', { name: 'Edit contact' });
      expect(screen.getByLabelText('Email')).toHaveValue('');
      expect(screen.getByLabelText('Phone')).toHaveValue('');
      expect(screen.getByLabelText('Job title')).toHaveValue('');
      expect(screen.getByLabelText('Company')).toHaveValue('');
      expect(screen.getByLabelText('Address')).toHaveValue('');
      expect(screen.getByLabelText('Notes')).toHaveValue('');
      expect(
        screen.getByText('No accounts linked yet. A contact can belong to one or more accounts.'),
      ).toBeInTheDocument();
    });

    it('patches the contact with the optimistic-lock token and redirects', async () => {
      const user = setupUser();
      renderEdit();
      await screen.findByRole('heading', { name: 'Edit contact' });

      const first = screen.getByLabelText(FIRST_NAME);
      await user.clear(first);
      await user.type(first, 'Grace B.');
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() =>
        expect(h.updateContact).toHaveBeenCalledWith('c1', {
          firstName: 'Grace B.',
          lastName: 'Hopper',
          email: 'grace@example.com',
          phone: '555-0100',
          jobTitle: 'Rear Admiral',
          company: 'US Navy',
          address: '1 Navy Yard',
          status: 'active',
          notes: 'Met at the conference',
          accountLinks: [{ accountId: 'acc1', primary: true, role: 'Decision maker' }],
          updatedAt: '2026-01-02T00:00:00Z',
        }),
      );
      expect(h.createContact).not.toHaveBeenCalled();
      expect(h.navigate).toHaveBeenCalledWith('/contacts/c1');
    });

    it('omits the conflict token when the loaded record has none', async () => {
      const user = setupUser();
      h.getContact.mockResolvedValue(makeContact({ updatedAt: '' }));
      renderEdit();
      await screen.findByRole('heading', { name: 'Edit contact' });

      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() => expect(h.updateContact).toHaveBeenCalledTimes(1));
      expect(h.updateContact.mock.calls[0][1]).not.toHaveProperty('updatedAt');
    });

    it('surfaces update conflicts without navigating away', async () => {
      const user = setupUser();
      h.updateContact.mockRejectedValueOnce(new Error('The record changed since you loaded it.'));
      renderEdit();
      await screen.findByRole('heading', { name: 'Edit contact' });

      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      expect(
        await screen.findByText('The record changed since you loaded it.'),
      ).toBeInTheDocument();
      expect(h.navigate).not.toHaveBeenCalled();
    });

    it('blocks submission in edit mode when validation fails', async () => {
      const user = setupUser();
      renderEdit();
      await screen.findByRole('heading', { name: 'Edit contact' });

      await user.clear(screen.getByLabelText(LAST_NAME));
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      expect(await screen.findByText('Last name is required.')).toBeInTheDocument();
      expect(h.updateContact).not.toHaveBeenCalled();
    });
  });
});
