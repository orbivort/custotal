// Component tests for TaskFormModal (create + edit modes).
//
// External collaborators are mocked so the tests focus on form behavior:
// - tasksApi.createTask/updateTask         -> save payload + outcome
// - opportunitiesApi.listOpportunities     -> deal options
// - contactsApi.listContacts               -> contact options
// - MetaContext.useMeta                    -> assignee + account options
// - SessionContext.useSession              -> default assignee for new tasks
// - toast.useToast                         -> success feedback
//
// The real Modal is used (it portals into document.body, which jsdom supports),
// so dialog affordances such as Escape and the header close button are covered.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Contact, Opportunity, Task, User } from '../../types/domain';
import { TaskFormModal } from './TaskFormModal';

const h = vi.hoisted(() => ({
  createTask: vi.fn(),
  updateTask: vi.fn(),
  listOpportunities: vi.fn(),
  listContacts: vi.fn(),
  useMeta: vi.fn(),
  useSession: vi.fn(),
  show: vi.fn(),
}));

vi.mock('./tasksApi', () => ({ createTask: h.createTask, updateTask: h.updateTask }));
vi.mock('../pipeline/opportunitiesApi', () => ({ listOpportunities: h.listOpportunities }));
vi.mock('../contacts/contactsApi', () => ({ listContacts: h.listContacts }));
vi.mock('../meta/MetaContext', () => ({ useMeta: h.useMeta }));
vi.mock('../auth/SessionContext', () => ({ useSession: h.useSession }));
vi.mock('../../components/toast', () => ({ useToast: () => ({ show: h.show }) }));

/** The label renders "Title*" because the field is required. */
const TITLE_FIELD = /^Title/;

const USERS: User[] = [
  { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'manager' },
  { id: 'u2', name: 'Ben Smith', email: 'ben@example.com', role: 'rep' },
];

const ACCOUNTS = [
  { id: 'a1', name: 'Acme Corp', ownerId: 'u1' },
  { id: 'a2', name: 'Initech', ownerId: 'u2' },
];

const onClose = vi.fn();
const onSaved = vi.fn();

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'Send proposal',
    description: 'Draft and email the renewal proposal',
    dueDate: '2026-09-01',
    priority: 'high',
    status: 'open',
    assigneeId: 'u2',
    contactId: 'c1',
    accountId: 'a1',
    opportunityId: 'o1',
    createdAt: '2026-08-20T09:00:00.000Z',
    createdBy: 'u1',
    updatedAt: '2026-08-21T09:00:00.000Z',
    updatedBy: 'u1',
    ...overrides,
  };
}

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'c1',
    firstName: 'Grace',
    lastName: 'Hopper',
    email: 'grace@example.com',
    status: 'active',
    accountLinks: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'u1',
    updatedAt: '2026-01-02T00:00:00.000Z',
    updatedBy: 'u1',
    ...overrides,
  };
}

function makeOpportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: 'o1',
    name: 'Q3 Renewal',
    accountId: 'a1',
    contactId: 'c1',
    valueMinor: 1200000,
    currency: 'USD',
    expectedCloseDate: '2026-10-01',
    stageId: 's1',
    probability: 40,
    probabilityManual: false,
    ownerId: 'u1',
    createdAt: '2026-07-01T00:00:00.000Z',
    createdBy: 'u1',
    updatedAt: '2026-07-05T00:00:00.000Z',
    updatedBy: 'u1',
    ...overrides,
  };
}

/** Renders the modal in create mode (`task` omitted) or edit mode (`task` set). */
function renderModal(task: Task | null = null, open = true) {
  return render(<TaskFormModal open={open} onClose={onClose} task={task} onSaved={onSaved} />);
}

/** Payload of the most recent create/update call, whichever one happened. */
function savedPayload(): Record<string, unknown> {
  const updateCall = h.updateTask.mock.calls.at(-1);
  if (updateCall) return updateCall[1] as Record<string, unknown>;
  return (h.createTask.mock.calls.at(-1)?.[0] ?? {}) as Record<string, unknown>;
}

describe('TaskFormModal', () => {
  // Vitest globals are disabled, so RTL's automatic cleanup does not run.
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    h.useMeta.mockReturnValue({ users: USERS, accounts: ACCOUNTS });
    h.useSession.mockReturnValue({ user: USERS[0] });
    h.listOpportunities.mockResolvedValue({ items: [makeOpportunity()], total: 1 });
    h.listContacts.mockResolvedValue({ items: [makeContact()], total: 1, page: 1, pageSize: 100 });
    h.createTask.mockResolvedValue(makeTask());
    h.updateTask.mockResolvedValue(makeTask());
  });

  describe('lifecycle and initial values', () => {
    it('renders nothing and loads no options while closed', () => {
      renderModal(null, false);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(h.listContacts).not.toHaveBeenCalled();
      expect(h.listOpportunities).not.toHaveBeenCalled();
    });

    it('opens a blank form preassigned to the signed-in user', async () => {
      renderModal();

      expect(await screen.findByRole('heading', { name: 'New task' })).toBeInTheDocument();
      expect(screen.getByLabelText(TITLE_FIELD)).toHaveValue('');
      expect(screen.getByLabelText('Description')).toHaveValue('');
      expect(screen.getByLabelText('Due date')).toHaveValue('');
      expect(screen.getByLabelText('Priority')).toHaveValue('medium');
      expect(screen.getByLabelText('Assignee')).toHaveValue('u1');
      expect(screen.getByLabelText('Account')).toHaveValue('');
      expect(screen.getByLabelText('Contact')).toHaveValue('');
      expect(screen.getByLabelText('Opportunity')).toHaveValue('');
      expect(screen.getByRole('button', { name: 'Create task' })).toBeInTheDocument();
    });

    it('submits an empty assignee when there is no signed-in user', async () => {
      const user = userEvent.setup();
      h.useSession.mockReturnValue({ user: null });
      renderModal();

      await user.type(await screen.findByLabelText(TITLE_FIELD), 'Call Ada');
      await user.click(screen.getByRole('button', { name: 'Create task' }));

      // The rendered select cannot display '' (no matching option), so assert
      // the submitted payload instead.
      await waitFor(() => expect(savedPayload().assigneeId).toBe(''));
    });

    it('prefills every editable field when editing an existing task', async () => {
      const task = makeTask();
      renderModal(task);

      expect(await screen.findByRole('heading', { name: 'Edit task' })).toBeInTheDocument();
      expect(screen.getByLabelText(TITLE_FIELD)).toHaveValue('Send proposal');
      expect(screen.getByLabelText('Description')).toHaveValue(
        'Draft and email the renewal proposal',
      );
      expect(screen.getByLabelText('Due date')).toHaveValue('2026-09-01');
      expect(screen.getByLabelText('Priority')).toHaveValue('high');
      expect(screen.getByLabelText('Assignee')).toHaveValue('u2');
      expect(screen.getByLabelText('Account')).toHaveValue('a1');
      expect(screen.getByLabelText('Contact')).toHaveValue('c1');
      expect(screen.getByLabelText('Opportunity')).toHaveValue('o1');
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
    });

    it('normalizes missing optional values to empty strings when editing', async () => {
      renderModal(
        makeTask({
          description: undefined,
          dueDate: undefined,
          contactId: undefined,
          opportunityId: undefined,
        }),
      );

      expect(await screen.findByLabelText('Description')).toHaveValue('');
      expect(screen.getByLabelText('Due date')).toHaveValue('');
      expect(screen.getByLabelText('Contact')).toHaveValue('');
      expect(screen.getByLabelText('Opportunity')).toHaveValue('');
    });

    it('resets back to blank defaults when reopened without a task', async () => {
      const { rerender } = renderModal(makeTask());
      await screen.findByLabelText(TITLE_FIELD);

      rerender(<TaskFormModal open={false} onClose={onClose} task={null} onSaved={onSaved} />);
      rerender(<TaskFormModal open onClose={onClose} task={null} onSaved={onSaved} />);

      await waitFor(() => expect(screen.getByLabelText(TITLE_FIELD)).toHaveValue(''));
      expect(screen.getByLabelText('Priority')).toHaveValue('medium');
      expect(screen.getByLabelText('Assignee')).toHaveValue('u1');
    });
  });

  describe('option lists', () => {
    it('lists every meta user as an assignee option', async () => {
      renderModal();

      const assignee = await screen.findByLabelText('Assignee');
      expect(assignee.querySelectorAll('option')).toHaveLength(2);
      expect(screen.getByRole('option', { name: 'Ada Lovelace' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Ben Smith' })).toBeInTheDocument();
    });

    it('offers every priority as an option', async () => {
      renderModal();

      const priority = await screen.findByLabelText('Priority');
      expect(priority.querySelectorAll('option')).toHaveLength(3);
      expect(screen.getByRole('option', { name: 'High' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Medium' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Low' })).toBeInTheDocument();
    });

    it('lists accounts, contacts and opportunities alongside a None placeholder', async () => {
      h.listContacts.mockResolvedValue({
        items: [makeContact(), makeContact({ id: 'c2', firstName: 'Alan', lastName: 'Turing' })],
        total: 2,
        page: 1,
        pageSize: 100,
      });
      h.listOpportunities.mockResolvedValue({ items: [makeOpportunity()], total: 1 });

      renderModal();

      expect(await screen.findByLabelText('Account')).toHaveValue('');
      expect(screen.getByLabelText('Account').querySelectorAll('option')).toHaveLength(3); // None + 2
      expect(screen.getByRole('option', { name: 'Acme Corp' })).toBeInTheDocument();

      expect(screen.getByLabelText('Contact').querySelectorAll('option')).toHaveLength(3);
      expect(screen.getByRole('option', { name: 'Grace Hopper' })).toBeInTheDocument();

      expect(screen.getByLabelText('Opportunity').querySelectorAll('option')).toHaveLength(2);
      expect(screen.getByRole('option', { name: 'Q3 Renewal' })).toBeInTheDocument();
    });

    it('requests a single large contact page for the picker', async () => {
      renderModal();

      await screen.findByLabelText('Contact');
      expect(h.listContacts).toHaveBeenCalledWith({ pageSize: 100 });
    });

    it('falls back to empty relation lists when the lookups fail', async () => {
      h.listContacts.mockRejectedValueOnce(new Error('unreachable'));
      h.listOpportunities.mockRejectedValueOnce(new Error('unreachable'));

      renderModal();

      await waitFor(() => expect(screen.getByLabelText('Opportunity')).toBeInTheDocument());
      expect(screen.getByLabelText('Contact').querySelectorAll('option')).toHaveLength(1); // None
      expect(screen.getByLabelText('Opportunity').querySelectorAll('option')).toHaveLength(1);
      // Account options come from meta, so they are unaffected.
      expect(screen.getByLabelText('Account').querySelectorAll('option')).toHaveLength(3);
    });
  });

  describe('validation', () => {
    it('blocks creation and shows an error when the title is blank', async () => {
      const user = userEvent.setup();
      renderModal();

      await user.click(screen.getByRole('button', { name: 'Create task' }));

      expect(await screen.findByText('Title is required.')).toBeInTheDocument();
      expect(h.createTask).not.toHaveBeenCalled();
      expect(onSaved).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('blocks updates when the title is only whitespace', async () => {
      const user = userEvent.setup();
      renderModal(makeTask());

      const title = await screen.findByLabelText(TITLE_FIELD);
      await user.clear(title);
      await user.type(title, '   ');
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      expect(await screen.findByText('Title is required.')).toBeInTheDocument();
      expect(h.updateTask).not.toHaveBeenCalled();
    });

    it('clears the field error once a valid title is submitted', async () => {
      const user = userEvent.setup();
      renderModal();

      await user.click(screen.getByRole('button', { name: 'Create task' }));
      expect(await screen.findByText('Title is required.')).toBeInTheDocument();

      await user.type(screen.getByLabelText(TITLE_FIELD), 'Follow up');
      await user.click(screen.getByRole('button', { name: 'Create task' }));

      await waitFor(() => expect(h.createTask).toHaveBeenCalledTimes(1));
      expect(screen.queryByText('Title is required.')).not.toBeInTheDocument();
    });
  });

  describe('saving', () => {
    it('creates a task with trimmed values and omits empty optional links', async () => {
      const user = userEvent.setup();
      renderModal();

      await user.type(screen.getByLabelText(TITLE_FIELD), '  Call Ada  ');
      await user.type(screen.getByLabelText('Description'), '  Renewal follow-up  ');
      fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-09-15' } });
      await user.selectOptions(screen.getByLabelText('Priority'), 'high');
      await user.click(screen.getByRole('button', { name: 'Create task' }));

      await waitFor(() =>
        expect(h.createTask).toHaveBeenCalledWith({
          title: 'Call Ada',
          description: 'Renewal follow-up',
          dueDate: '2026-09-15',
          priority: 'high',
          assigneeId: 'u1',
          contactId: undefined,
          accountId: undefined,
          opportunityId: undefined,
        }),
      );
    });

    it('sends the selected relations instead of undefined', async () => {
      const user = userEvent.setup();
      renderModal();

      await user.type(screen.getByLabelText(TITLE_FIELD), 'Negotiate terms');
      await user.selectOptions(screen.getByLabelText('Assignee'), 'u2');
      await user.selectOptions(screen.getByLabelText('Account'), 'a2');
      await user.selectOptions(screen.getByLabelText('Contact'), 'c1');
      await user.selectOptions(screen.getByLabelText('Opportunity'), 'o1');
      await user.click(screen.getByRole('button', { name: 'Create task' }));

      await waitFor(() =>
        expect(h.createTask).toHaveBeenCalledWith(
          expect.objectContaining({
            assigneeId: 'u2',
            accountId: 'a2',
            contactId: 'c1',
            opportunityId: 'o1',
          }),
        ),
      );
    });

    it('omits the due date when the field is left empty', async () => {
      const user = userEvent.setup();
      renderModal();

      await user.type(screen.getByLabelText(TITLE_FIELD), 'Nudge');
      await user.click(screen.getByRole('button', { name: 'Create task' }));

      await waitFor(() => expect(h.createTask).toHaveBeenCalled());
      expect(savedPayload().dueDate).toBeUndefined();
    });

    it('patches the existing task when editing', async () => {
      const user = userEvent.setup();
      renderModal(makeTask());

      const title = await screen.findByLabelText(TITLE_FIELD);
      await user.clear(title);
      await user.type(title, 'Renamed task');
      await user.selectOptions(screen.getByLabelText('Priority'), 'low');
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() =>
        expect(h.updateTask).toHaveBeenCalledWith('t1', {
          title: 'Renamed task',
          description: 'Draft and email the renewal proposal',
          dueDate: '2026-09-01',
          priority: 'low',
          assigneeId: 'u2',
          contactId: 'c1',
          accountId: 'a1',
          opportunityId: 'o1',
        }),
      );
      expect(h.createTask).not.toHaveBeenCalled();
    });

    it('toasts once when a task is created, then updates the list before closing', async () => {
      const user = userEvent.setup();
      renderModal();

      await user.type(screen.getByLabelText(TITLE_FIELD), 'Call Ada');
      await user.click(screen.getByRole('button', { name: 'Create task' }));

      await waitFor(() => expect(h.show).toHaveBeenCalledWith('Task created', 'success'));
      expect(onSaved).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
      // onSaved must run first so the parent refetches before the modal closes.
      expect(onSaved.mock.invocationCallOrder[0]).toBeLessThan(onClose.mock.invocationCallOrder[0]);
    });

    it('toasts the updated message when editing', async () => {
      const user = userEvent.setup();
      renderModal(makeTask());

      await user.click(await screen.findByRole('button', { name: 'Save changes' }));

      await waitFor(() => expect(h.show).toHaveBeenCalledWith('Task updated', 'success'));
    });

    it('disables the submit button and shows a saving label while in flight', async () => {
      const user = userEvent.setup();
      let resolveCreate!: (value: Task) => void;
      h.createTask.mockImplementationOnce(
        () => new Promise<Task>((resolve) => (resolveCreate = resolve)),
      );
      renderModal();

      await user.type(screen.getByLabelText(TITLE_FIELD), 'Call Ada');
      await user.click(screen.getByRole('button', { name: 'Create task' }));

      expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();

      resolveCreate(makeTask());

      await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it('surfaces server errors in the banner and keeps the modal open', async () => {
      const user = userEvent.setup();
      h.createTask.mockRejectedValueOnce(new Error('Assignee not found'));
      renderModal();

      await user.type(screen.getByLabelText(TITLE_FIELD), 'Call Ada');
      await user.click(screen.getByRole('button', { name: 'Create task' }));

      expect(await screen.findByText('Assignee not found')).toBeInTheDocument();
      expect(onSaved).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('falls back to a generic message for non-Error failures', async () => {
      const user = userEvent.setup();
      h.createTask.mockRejectedValueOnce('not-an-error');
      renderModal();

      await user.type(screen.getByLabelText(TITLE_FIELD), 'Call Ada');
      await user.click(screen.getByRole('button', { name: 'Create task' }));

      expect(await screen.findByText('Save failed')).toBeInTheDocument();
    });

    it('clears the previous error once a retry succeeds', async () => {
      const user = userEvent.setup();
      h.createTask.mockRejectedValueOnce(new Error('Temporary outage'));
      renderModal();

      await user.type(screen.getByLabelText(TITLE_FIELD), 'Call Ada');
      await user.click(screen.getByRole('button', { name: 'Create task' }));
      await screen.findByText('Temporary outage');

      h.createTask.mockResolvedValue(makeTask());
      await user.click(screen.getByRole('button', { name: 'Create task' }));

      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(screen.queryByText('Temporary outage')).not.toBeInTheDocument();
    });
  });

  describe('dismissal', () => {
    it('closes from Cancel without saving', async () => {
      const user = userEvent.setup();
      renderModal();

      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(h.createTask).not.toHaveBeenCalled();
      expect(onSaved).not.toHaveBeenCalled();
    });

    it('closes from the dialog close control and on Escape', async () => {
      const user = userEvent.setup();
      renderModal();

      await user.click(screen.getByRole('button', { name: 'Close' }));
      await user.keyboard('{Escape}');

      expect(onClose).toHaveBeenCalledTimes(2);
      expect(h.createTask).not.toHaveBeenCalled();
    });
  });
});
