// Component tests for RecoveryPage (soft-deleted records: restore & purge).
//
// External collaborators are mocked so the tests focus on page behavior:
// - adminApi.listTrash + the five restore/purge pairs -> list + actions
// - MetaContext.useMeta  -> owner/assignee name resolution
// - toast.useToast       -> feedback for every action
// Purges are gated by the in-app ConfirmDialog (window.confirm is blocked in
// sandboxed previews), so the tests drive that dialog explicitly.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Account,
  Contact,
  Interaction,
  Opportunity,
  Task,
  TrashPayload,
} from '../../types/domain';
import RecoveryPage from './RecoveryPage';

const h = vi.hoisted(() => ({
  listTrash: vi.fn(),
  restoreTrashContact: vi.fn(),
  restoreTrashAccount: vi.fn(),
  restoreTrashOpportunity: vi.fn(),
  restoreTrashTask: vi.fn(),
  restoreTrashInteraction: vi.fn(),
  purgeTrashContact: vi.fn(),
  purgeTrashAccount: vi.fn(),
  purgeTrashOpportunity: vi.fn(),
  purgeTrashTask: vi.fn(),
  purgeTrashInteraction: vi.fn(),
  useMeta: vi.fn(),
  show: vi.fn(),
}));

vi.mock('./adminApi', () => ({
  listTrash: h.listTrash,
  restoreTrashContact: h.restoreTrashContact,
  restoreTrashAccount: h.restoreTrashAccount,
  restoreTrashOpportunity: h.restoreTrashOpportunity,
  restoreTrashTask: h.restoreTrashTask,
  restoreTrashInteraction: h.restoreTrashInteraction,
  purgeTrashContact: h.purgeTrashContact,
  purgeTrashAccount: h.purgeTrashAccount,
  purgeTrashOpportunity: h.purgeTrashOpportunity,
  purgeTrashTask: h.purgeTrashTask,
  purgeTrashInteraction: h.purgeTrashInteraction,
}));
vi.mock('../meta/MetaContext', () => ({ useMeta: h.useMeta }));
vi.mock('../../components/toast', () => ({ useToast: () => ({ show: h.show }) }));

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'c1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    status: 'active',
    accountLinks: [],
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'u1',
    updatedAt: '2026-01-02T00:00:00Z',
    updatedBy: 'u1',
    deletedAt: '2026-01-03T00:00:00Z',
    ...overrides,
  };
}

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'a1',
    name: 'Acme Corp',
    industry: 'SaaS',
    ownerId: 'u1',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'u1',
    updatedAt: '2026-01-02T00:00:00Z',
    updatedBy: 'u1',
    deletedAt: '2026-01-03T00:00:00Z',
    ...overrides,
  };
}

function makeOpportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: 'o1',
    name: 'Big deal',
    accountId: 'a1',
    valueMinor: 10000,
    currency: 'USD',
    expectedCloseDate: '2026-06-30',
    stageId: 's1',
    probability: 50,
    probabilityManual: false,
    ownerId: 'u1',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'u1',
    updatedAt: '2026-01-02T00:00:00Z',
    updatedBy: 'u1',
    deletedAt: '2026-01-03T00:00:00Z',
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'Call back',
    priority: 'medium',
    status: 'open',
    assigneeId: 'u1',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'u1',
    updatedAt: '2026-01-02T00:00:00Z',
    updatedBy: 'u1',
    deletedAt: '2026-01-03T00:00:00Z',
    ...overrides,
  };
}

function makeInteraction(overrides: Partial<Interaction> = {}): Interaction {
  return {
    id: 'i1',
    type: 'call',
    dateTime: '2026-01-05T10:00:00Z',
    summary: 'Intro call',
    contactId: 'c1',
    responsibleUserId: 'u1',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'u1',
    updatedAt: '2026-01-02T00:00:00Z',
    updatedBy: 'u1',
    deletedAt: '2026-01-03T00:00:00Z',
    ...overrides,
  };
}

function fullPayload(): TrashPayload {
  return {
    contacts: [makeContact()],
    accounts: [makeAccount()],
    opportunities: [makeOpportunity()],
    tasks: [makeTask()],
    interactions: [makeInteraction()],
  };
}

function emptyPayload(): TrashPayload {
  return { contacts: [], accounts: [], opportunities: [], tasks: [], interactions: [] };
}

/** The list item for the record whose primary name line is `name`. */
function rowOf(name: string): HTMLElement {
  return screen.getByText(name).closest('li') as HTMLElement;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <RecoveryPage />
    </MemoryRouter>,
  );
}

describe('RecoveryPage', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    h.useMeta.mockReturnValue({ userName: () => 'Dana Owner' });
    h.listTrash.mockResolvedValue(fullPayload());
    h.restoreTrashContact.mockResolvedValue(makeContact());
    h.restoreTrashAccount.mockResolvedValue(makeAccount());
    h.restoreTrashOpportunity.mockResolvedValue(makeOpportunity());
    h.restoreTrashTask.mockResolvedValue(makeTask());
    h.restoreTrashInteraction.mockResolvedValue(makeInteraction());
    h.purgeTrashContact.mockResolvedValue(undefined);
    h.purgeTrashAccount.mockResolvedValue(undefined);
    h.purgeTrashOpportunity.mockResolvedValue(undefined);
    h.purgeTrashTask.mockResolvedValue(undefined);
    h.purgeTrashInteraction.mockResolvedValue(undefined);
  });

  it('shows the loading state before the trash payload arrives', async () => {
    let resolveList!: (value: TrashPayload) => void;
    h.listTrash.mockImplementationOnce(
      () => new Promise<TrashPayload>((resolve) => (resolveList = resolve)),
    );

    renderPage();

    expect(await screen.findByText('Loading trash…')).toBeInTheDocument();

    resolveList(emptyPayload());
    await screen.findByText('Nothing to recover');
  });

  it('renders every section with its rows and owner metadata', async () => {
    renderPage();

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Contacts/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Accounts/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Deals/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Tasks/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Interactions/ })).toBeInTheDocument();

    expect(rowOf('Acme Corp')).toHaveTextContent('owned by Dana Owner');
    expect(rowOf('Big deal')).toHaveTextContent('$100.00');
    expect(rowOf('Big deal')).toHaveTextContent('owned by Dana Owner');
    expect(rowOf('Call back')).toHaveTextContent('Assigned to Dana Owner');
    expect(rowOf('Intro call')).toHaveTextContent('call');
    expect(rowOf('Intro call')).toHaveTextContent('responsible: Dana Owner');
  });

  it('renders empty section copy for sections without records', async () => {
    h.listTrash.mockResolvedValue({
      ...emptyPayload(),
      contacts: [makeContact()],
    });

    renderPage();

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('No deleted accounts.')).toBeInTheDocument();
    expect(screen.getByText('No deleted deals.')).toBeInTheDocument();
    expect(screen.getByText('No deleted tasks.')).toBeInTheDocument();
    expect(screen.getByText('No deleted interactions.')).toBeInTheDocument();
  });

  it('renders the empty state when the trash is empty', async () => {
    h.listTrash.mockResolvedValue(emptyPayload());

    renderPage();

    expect(await screen.findByText('Nothing to recover')).toBeInTheDocument();
    expect(screen.queryByText('Loading trash…')).not.toBeInTheDocument();
  });

  it('shows an error banner when the trash load fails', async () => {
    h.listTrash.mockRejectedValue(new Error('Server down'));

    renderPage();

    expect(await screen.findByText('Server down')).toBeInTheDocument();
  });

  it('falls back to a generic message for non-Error load failures', async () => {
    h.listTrash.mockRejectedValue('boom');

    renderPage();

    expect(await screen.findByText('Failed to load trash')).toBeInTheDocument();
  });

  it.each([
    ['contact', 'Ada Lovelace', 'Contact restored', h.restoreTrashContact],
    ['account', 'Acme Corp', 'Account restored', h.restoreTrashAccount],
    ['opportunity', 'Big deal', 'Deal restored', h.restoreTrashOpportunity],
    ['task', 'Call back', 'Task restored', h.restoreTrashTask],
    ['interaction', 'Intro call', 'Interaction restored', h.restoreTrashInteraction],
  ] as const)(
    'restores a %s from its row, toasts, and reloads the trash list',
    async (_kind, rowName, message, restore) => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Ada Lovelace');

      await user.click(within(rowOf(rowName)).getByRole('button', { name: 'Restore' }));

      await waitFor(() => expect(restore).toHaveBeenCalledTimes(1));
      expect(h.show).toHaveBeenCalledWith(message, 'success');
      expect(h.listTrash).toHaveBeenCalledTimes(2);
    },
  );

  it('toasts the server message when a restore fails', async () => {
    const user = userEvent.setup();
    h.restoreTrashContact.mockRejectedValueOnce(new Error('Restore failed'));
    renderPage();
    await screen.findByText('Ada Lovelace');

    await user.click(within(rowOf('Ada Lovelace')).getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(h.show).toHaveBeenCalledWith('Restore failed', 'error'));
    expect(h.listTrash).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'contact',
      'Ada Lovelace',
      'Permanently purge Ada Lovelace? This cannot be undone.',
      'Contact purged',
      h.purgeTrashContact,
    ],
    [
      'account',
      'Acme Corp',
      'Permanently purge Acme Corp? This cannot be undone.',
      'Account purged',
      h.purgeTrashAccount,
    ],
    [
      'opportunity',
      'Big deal',
      'Permanently purge Big deal? This cannot be undone.',
      'Deal purged',
      h.purgeTrashOpportunity,
    ],
    [
      'task',
      'Call back',
      'Permanently purge "Call back"? This cannot be undone.',
      'Task purged',
      h.purgeTrashTask,
    ],
    [
      'interaction',
      'Intro call',
      'Permanently purge this interaction? This cannot be undone.',
      'Interaction purged',
      h.purgeTrashInteraction,
    ],
  ] as const)(
    'purges a %s after the user confirms, toasts, and reloads',
    async (_kind, rowName, confirmText, message, purge) => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Ada Lovelace');

      await user.click(within(rowOf(rowName)).getByRole('button', { name: 'Purge' }));

      // The click only opens the confirmation dialog — nothing is purged yet.
      const dialog = await screen.findByRole('dialog');
      expect(dialog).toHaveTextContent(confirmText);
      expect(purge).not.toHaveBeenCalled();

      await user.click(within(dialog).getByRole('button', { name: 'Purge' }));

      await waitFor(() => expect(purge).toHaveBeenCalledTimes(1));
      expect(h.show).toHaveBeenCalledWith(message, 'success');
      expect(h.listTrash).toHaveBeenCalledTimes(2);
    },
  );

  it('does not purge when the user cancels the confirmation', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Ada Lovelace');

    await user.click(within(rowOf('Ada Lovelace')).getByRole('button', { name: 'Purge' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }),
    );

    expect(h.purgeTrashContact).not.toHaveBeenCalled();
    expect(h.listTrash).toHaveBeenCalledTimes(1);
  });

  it('toasts the server message when a purge fails', async () => {
    const user = userEvent.setup();
    h.purgeTrashAccount.mockRejectedValueOnce(new Error('Purge failed'));
    renderPage();
    await screen.findByText('Ada Lovelace');

    await user.click(within(rowOf('Acme Corp')).getByRole('button', { name: 'Purge' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Purge' }),
    );

    await waitFor(() => expect(h.show).toHaveBeenCalledWith('Purge failed', 'error'));
    expect(h.listTrash).toHaveBeenCalledTimes(1);
  });
});
