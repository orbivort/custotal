// Component tests for LinkContactModal.
//
// External collaborators are mocked so the tests focus on modal behavior:
// - contactsApi.listContacts -> drives loading / list / failure states
// - accountsApi.addAccountLink -> link submission outcome
// - toast.useToast            -> success / error feedback
//
// The real Modal is used (it portals into document.body, which jsdom supports),
// so dialog affordances such as the header close button are covered too.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Contact, PaginatedResult } from '../../types/domain';
import { LinkContactModal } from './LinkContactModal';

const h = vi.hoisted(() => ({
  listContacts: vi.fn(),
  addAccountLink: vi.fn(),
  show: vi.fn(),
}));

vi.mock('../contacts/contactsApi', () => ({ listContacts: h.listContacts }));
vi.mock('./accountsApi', () => ({ addAccountLink: h.addAccountLink }));
vi.mock('../../components/toast', () => ({ useToast: () => ({ show: h.show }) }));

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'c1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    status: 'active',
    accountLinks: [],
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'u1',
    updatedAt: '2026-01-02T00:00:00Z',
    updatedBy: 'u1',
    ...overrides,
  };
}

function pageResult(items: Contact[]): PaginatedResult<Contact> {
  return { items, total: items.length, page: 1, pageSize: 10000 };
}

const ADA = makeContact({ id: 'c1', firstName: 'Ada', lastName: 'Lovelace', jobTitle: 'Engineer' });
const GRACE = makeContact({ id: 'c2', firstName: 'Grace', lastName: 'Hopper' });
const ZOE = makeContact({ id: 'c3', firstName: 'Zoe', lastName: 'Yang', jobTitle: 'CFO' });

// Stable identities: `linkedContactIds` is an effect dependency, so a fresh
// array per render would retrigger the fetch.
const NO_LINKS: string[] = [];

const onClose = vi.fn();
const onSaved = vi.fn();

function renderModal(props: { open?: boolean; linkedContactIds?: string[] } = {}) {
  return render(
    <LinkContactModal
      accountId="a1"
      linkedContactIds={props.linkedContactIds ?? NO_LINKS}
      open={props.open ?? true}
      onClose={onClose}
      onSaved={onSaved}
    />,
  );
}

describe('LinkContactModal', () => {
  // Vitest globals are disabled, so RTL's automatic cleanup does not run.
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    h.listContacts.mockResolvedValue(pageResult([ZOE, ADA, GRACE]));
    h.addAccountLink.mockResolvedValue(ADA);
  });

  it('renders nothing and fetches nothing while closed', () => {
    renderModal({ open: false });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(h.listContacts).not.toHaveBeenCalled();
  });

  it('shows the loading state until the contact list resolves', async () => {
    let resolveList!: (value: PaginatedResult<Contact>) => void;
    h.listContacts.mockImplementationOnce(
      () => new Promise<PaginatedResult<Contact>>((resolve) => (resolveList = resolve)),
    );

    renderModal();

    expect(screen.getByText('Loading contacts…')).toBeInTheDocument();
    expect(h.listContacts).toHaveBeenCalledWith({ pageSize: 10000 });

    resolveList(pageResult([ADA]));

    expect(await screen.findByRole('combobox')).toBeInTheDocument();
    expect(screen.queryByText('Loading contacts…')).not.toBeInTheDocument();
  });

  it('lists selectable contacts sorted by full name with the job title suffix', async () => {
    renderModal();

    await screen.findByRole('combobox');

    // Placeholder first, then alphabetical order regardless of API ordering.
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Choose a contact…',
      'Ada Lovelace — Engineer',
      'Grace Hopper',
      'Zoe Yang — CFO',
    ]);
  });

  it('excludes contacts already linked to the account', async () => {
    renderModal({ linkedContactIds: ['c1', 'c3'] });

    await screen.findByRole('combobox');

    expect(screen.getByRole('option', { name: 'Grace Hopper' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Ada Lovelace/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Zoe Yang/ })).not.toBeInTheDocument();
  });

  it('shows the empty state when every contact is already linked', async () => {
    h.listContacts.mockResolvedValue(pageResult([ADA]));

    renderModal({ linkedContactIds: ['c1'] });

    expect(await screen.findByText('No contacts to link')).toBeInTheDocument();
    expect(
      screen.getByText('Every existing contact is already linked to this account.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('falls back to the empty state when the contact fetch fails', async () => {
    h.listContacts.mockRejectedValue(new Error('Network down'));

    renderModal();

    expect(await screen.findByText('No contacts to link')).toBeInTheDocument();
    // A failed lookup must not surface as a toast; the empty state carries it.
    expect(h.show).not.toHaveBeenCalled();
  });

  it('keeps the submit button disabled until a contact is chosen', async () => {
    const user = userEvent.setup();
    renderModal();
    await screen.findByRole('combobox');

    const submit = screen.getByRole('button', { name: 'Link contact' });
    expect(submit).toBeDisabled();

    await user.selectOptions(screen.getByRole('combobox'), 'c2');

    expect(submit).toBeEnabled();
  });

  it('links the selected contact without optional metadata', async () => {
    const user = userEvent.setup();
    renderModal();
    await screen.findByRole('combobox');

    await user.selectOptions(screen.getByRole('combobox'), 'c2');
    await user.click(screen.getByRole('button', { name: 'Link contact' }));

    await waitFor(() =>
      // A blank relationship is sent as undefined, not an empty string.
      expect(h.addAccountLink).toHaveBeenCalledWith('a1', {
        contactId: 'c2',
        primary: false,
        role: undefined,
      }),
    );
    expect(h.show).toHaveBeenCalledWith('Contact linked', 'success');
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('trims the relationship and forwards the primary flag', async () => {
    const user = userEvent.setup();
    renderModal();
    await screen.findByRole('combobox');

    await user.selectOptions(screen.getByRole('combobox'), 'c1');
    await user.type(screen.getByRole('textbox'), '  Decision maker  ');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Link contact' }));

    await waitFor(() =>
      expect(h.addAccountLink).toHaveBeenCalledWith('a1', {
        contactId: 'c1',
        primary: true,
        role: 'Decision maker',
      }),
    );
  });

  it('disables the submit button while the link request is in flight', async () => {
    const user = userEvent.setup();
    let resolveLink!: (value: Contact) => void;
    h.addAccountLink.mockImplementationOnce(
      () => new Promise<Contact>((resolve) => (resolveLink = resolve)),
    );
    renderModal();
    await screen.findByRole('combobox');

    await user.selectOptions(screen.getByRole('combobox'), 'c1');
    const submit = screen.getByRole('button', { name: 'Link contact' });
    await user.click(submit);

    expect(submit).toBeDisabled();

    resolveLink(ADA);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('surfaces the server message when linking fails and keeps the modal open', async () => {
    const user = userEvent.setup();
    h.addAccountLink.mockRejectedValueOnce(new Error('Contact already linked'));
    renderModal();
    await screen.findByRole('combobox');

    await user.selectOptions(screen.getByRole('combobox'), 'c1');
    await user.click(screen.getByRole('button', { name: 'Link contact' }));

    await waitFor(() => expect(h.show).toHaveBeenCalledWith('Contact already linked', 'error'));
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('falls back to a generic message for non-Error link failures', async () => {
    const user = userEvent.setup();
    h.addAccountLink.mockRejectedValueOnce('not-an-error');
    renderModal();
    await screen.findByRole('combobox');

    await user.selectOptions(screen.getByRole('combobox'), 'c1');
    await user.click(screen.getByRole('button', { name: 'Link contact' }));

    await waitFor(() => expect(h.show).toHaveBeenCalledWith('Link failed', 'error'));
  });

  it('closes from the footer Cancel button and the dialog close control', async () => {
    const user = userEvent.setup();
    renderModal();
    await screen.findByRole('combobox');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(h.addAccountLink).not.toHaveBeenCalled();
  });
});
