// Component tests for TasksPage.
//
// External collaborators are mocked so the tests focus on page behavior:
// - tasksApi.listTasks/completeTask/reopenTask/deleteTask -> list + row actions
// - MetaContext.useMeta         -> assignee column + account-name resolution
// - SessionContext.useSession   -> RBAC gates (write access, "all tasks" scope)
// - toast.useToast              -> action feedback
// - TaskFormModal/TaskHistoryModal -> replaced by recording stubs, so their own
//   dependencies (contacts, opportunities) stay out of the page tests.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDate, todayISO } from '../../lib/format';
import type { ListResult, Role, Task, User } from '../../types/domain';
import type { TaskListParams } from './tasksApi';
import TasksPage from './TasksPage';

const h = vi.hoisted(() => ({
  listTasks: vi.fn(),
  completeTask: vi.fn(),
  reopenTask: vi.fn(),
  deleteTask: vi.fn(),
  useMeta: vi.fn(),
  useSession: vi.fn(),
  show: vi.fn(),
  formProps: vi.fn(),
  historyProps: vi.fn(),
}));

vi.mock('./tasksApi', () => ({
  listTasks: h.listTasks,
  completeTask: h.completeTask,
  reopenTask: h.reopenTask,
  deleteTask: h.deleteTask,
}));
vi.mock('../meta/MetaContext', () => ({ useMeta: h.useMeta }));
vi.mock('../auth/SessionContext', () => ({ useSession: h.useSession }));
vi.mock('../../components/toast', () => ({ useToast: () => ({ show: h.show }) }));

vi.mock('./TaskFormModal', () => ({
  TaskFormModal: (props: {
    open: boolean;
    task: Task | null;
    onClose: () => void;
    onSaved: () => void;
  }) => {
    h.formProps(props);
    return props.open ? <div data-testid="task-form-modal" /> : null;
  },
}));

vi.mock('./TaskHistoryModal', () => ({
  TaskHistoryModal: (props: { taskId: string; taskTitle: string; onClose: () => void }) => {
    h.historyProps(props);
    return <div data-testid="task-history-modal" />;
  },
}));

const USERS: User[] = [
  { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'manager' },
  { id: 'u2', name: 'Ben Smith', email: 'ben@example.com', role: 'rep' },
];

function makeUser(role: Role): User {
  return { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'Send proposal',
    description: 'Draft and email it',
    dueDate: '2026-09-01',
    priority: 'medium',
    status: 'open',
    assigneeId: 'u2',
    accountId: 'a1',
    createdAt: '2026-08-20T09:00:00.000Z',
    createdBy: 'u1',
    updatedAt: '2026-08-21T09:00:00.000Z',
    updatedBy: 'u1',
    ...overrides,
  };
}

function listResult(items: Task[]): ListResult<Task> {
  return { items, total: items.length };
}

/** Params of the most recent listTasks call. */
function lastParams(): TaskListParams {
  return (h.listTasks.mock.calls.at(-1)?.[0] ?? {}) as TaskListParams;
}

/** Props of the most recent TaskFormModal render. */
function lastFormProps(): {
  open: boolean;
  task: Task | null;
  onSaved: () => void;
  onClose: () => void;
} {
  return h.formProps.mock.calls.at(-1)?.[0];
}

/** Props of the most recent TaskHistoryModal render. */
function lastHistoryProps(): { taskId: string; taskTitle: string; onClose: () => void } {
  return h.historyProps.mock.calls.at(-1)?.[0];
}

/** Rendered row titles in visual order. */
function rowTitles(): string[] {
  return screen.getAllByRole('listitem').map((row) => row.querySelector('p')?.textContent ?? '');
}

function rowFor(title: string): HTMLElement {
  const row = screen.getAllByRole('listitem').find((li) => li.textContent?.includes(title));
  if (!row) throw new Error(`No row rendered for "${title}"`);
  return row;
}

/** A date `days` from today, in the YYYY-MM-DD form due dates use. */
function offsetDate(days: number): string {
  const d = new Date(`${todayISO()}T00:00:00`);
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function renderPage() {
  return render(<TasksPage />);
}

describe('TasksPage', () => {
  // Vitest globals are disabled, so RTL's automatic cleanup does not run.
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    h.useMeta.mockReturnValue({
      users: USERS,
      userName: (id?: string) => USERS.find((u) => u.id === id)?.name ?? 'Unknown',
      accountName: (id?: string) => (id === 'a1' ? 'Acme Corp' : 'Unknown'),
    });
    h.useSession.mockReturnValue({ user: makeUser('manager') });
    h.listTasks.mockResolvedValue(listResult([makeTask()]));
    h.completeTask.mockResolvedValue(makeTask({ status: 'completed' }));
    h.reopenTask.mockResolvedValue(makeTask());
    h.deleteTask.mockResolvedValue(undefined);
  });

  describe('initial load', () => {
    it('requests the default "mine" scope and shows the loading state', async () => {
      let resolveList!: (value: ListResult<Task>) => void;
      h.listTasks.mockImplementationOnce(
        () => new Promise<ListResult<Task>>((resolve) => (resolveList = resolve)),
      );

      renderPage();

      expect(await screen.findByText('Loading…')).toBeInTheDocument();
      expect(h.listTasks).toHaveBeenCalledTimes(1);
      expect(lastParams()).toEqual({
        scope: 'mine',
        status: '',
        priority: '',
        owner: undefined,
        related: '',
      });

      resolveList(listResult([]));
      expect(await screen.findByText('No tasks here')).toBeInTheDocument();
    });

    it('subtitles the page for the personal scope', async () => {
      renderPage();

      await screen.findByText('Send proposal');
      expect(screen.getByText('Your open follow-ups')).toBeInTheDocument();
    });

    it('surfaces load failures in the error banner', async () => {
      h.listTasks.mockRejectedValueOnce(new Error('unreachable'));

      renderPage();

      expect(await screen.findByText('unreachable')).toBeInTheDocument();
      expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    });

    it('falls back to a generic load error message for non-Error failures', async () => {
      h.listTasks.mockRejectedValueOnce('nope');

      renderPage();

      expect(await screen.findByText('Failed to load')).toBeInTheDocument();
    });

    it('offers a create button in the empty state for users with write access', async () => {
      h.listTasks.mockResolvedValue(listResult([]));
      const user = userEvent.setup();

      renderPage();
      const empty = (await screen.findByText('No tasks here')).closest('div');
      if (!empty) throw new Error('Empty state container not found');

      // The page header also renders a "New task" button, so scope the query.
      await user.click(within(empty).getByRole('button', { name: 'New task' }));

      expect(screen.getByTestId('task-form-modal')).toBeInTheDocument();
      expect(lastFormProps().task).toBeNull();
    });
  });

  describe('row rendering', () => {
    it('renders the account name, due date and priority badge', async () => {
      // A future due date keeps the row out of the overdue state, so the cell
      // renders the formatted date on its own.
      const dueDate = offsetDate(5);
      h.listTasks.mockResolvedValue(listResult([makeTask({ dueDate })]));

      renderPage();

      await screen.findByRole('listitem');
      const row = rowFor('Send proposal');
      expect(within(row).getByText('Acme Corp')).toBeInTheDocument();
      expect(within(row).getByText(formatDate(dueDate))).toBeInTheDocument();
      expect(within(row).getByText('medium')).toBeInTheDocument();
      expect(within(row).queryByText(/overdue/)).not.toBeInTheDocument();
    });

    it('falls back to "No account" and "No due date" when those are unset', async () => {
      h.listTasks.mockResolvedValue(
        listResult([makeTask({ accountId: undefined, dueDate: undefined })]),
      );

      renderPage();

      await screen.findByText('No due date');
      const row = rowFor('Send proposal');
      expect(within(row).getByText('No due date')).toBeInTheDocument();
      expect(row).toHaveTextContent('No account');
    });

    it('flags the linked contact and deal', async () => {
      h.listTasks.mockResolvedValue(
        listResult([makeTask({ contactId: 'c1', opportunityId: 'o1' })]),
      );

      renderPage();

      await screen.findByText('Send proposal');
      const row = rowFor('Send proposal');
      expect(row).toHaveTextContent('linked to a contact');
      expect(row).toHaveTextContent('linked to a deal');
    });

    it('marks open tasks past their due date as overdue', async () => {
      const overdue = offsetDate(-1);
      h.listTasks.mockResolvedValue(listResult([makeTask({ dueDate: overdue, status: 'open' })]));

      renderPage();

      expect(await screen.findByText(/overdue/)).toBeInTheDocument();
    });

    it('does not mark completed tasks as overdue', async () => {
      h.listTasks.mockResolvedValue(
        listResult([makeTask({ dueDate: offsetDate(-5), status: 'completed' })]),
      );

      renderPage();

      await screen.findByText('Send proposal');
      expect(screen.queryByText(/overdue/)).not.toBeInTheDocument();
    });
  });

  describe('filters', () => {
    const filterCases = [
      ['Filter by status', 'open', 'status'],
      ['Filter by priority', 'high', 'priority'],
      ['Filter by related record', 'contact', 'related'],
    ] as const;

    it.each(filterCases)('reloads once %s changes to %s', async (ariaLabel, optionValue, param) => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Send proposal');

      await user.selectOptions(screen.getByLabelText(ariaLabel), optionValue);

      await waitFor(() => expect(lastParams()[param as keyof TaskListParams]).toBe(optionValue));
      expect(h.listTasks).toHaveBeenCalledTimes(2);
    });

    it('never sends an owner filter while scoped to my tasks', async () => {
      renderPage();

      await screen.findByText('Send proposal');
      expect(lastParams().owner).toBeUndefined();
    });

    it('sends an empty owner filter once the all-tasks scope is selected', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Send proposal');

      await user.click(screen.getByRole('button', { name: 'All tasks' }));

      await waitFor(() => expect(lastParams().scope).toBe('all'));
      expect(lastParams().owner).toBe('');
      expect(screen.getByText('Every task across the team')).toBeInTheDocument();
    });

    it('exposes an owner picker only inside the all-tasks scope', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Send proposal');

      expect(screen.queryByLabelText('Filter by owner')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'All tasks' }));

      expect(await screen.findByLabelText('Filter by owner')).toBeInTheDocument();
      await user.selectOptions(screen.getByLabelText('Filter by owner'), 'u2');

      await waitFor(() => expect(lastParams().owner).toBe('u2'));
    });

    it('switches back to the personal scope from All tasks', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Send proposal');

      await user.click(screen.getByRole('button', { name: 'All tasks' }));
      await waitFor(() => expect(lastParams().scope).toBe('all'));

      await user.click(screen.getByRole('button', { name: 'My tasks' }));

      await waitFor(() => expect(lastParams().scope).toBe('mine'));
      expect(screen.getByText('Your open follow-ups')).toBeInTheDocument();
    });

    it('shows the assignee column only inside the all-tasks scope', async () => {
      const user = userEvent.setup();
      h.listTasks.mockResolvedValue(listResult([makeTask({ assigneeId: 'u2' })]));
      renderPage();
      await screen.findByText('Send proposal');
      expect(rowFor('Send proposal')).not.toHaveTextContent('Ben Smith');

      await user.click(screen.getByRole('button', { name: 'All tasks' }));

      await waitFor(() => expect(rowFor('Send proposal')).toHaveTextContent('Ben Smith'));
    });
  });

  describe('sorting', () => {
    it('sorts by due date by default, pushing dateless tasks to the end', async () => {
      h.listTasks.mockResolvedValue(
        listResult([
          makeTask({ id: 't1', title: 'Later task', dueDate: '2026-09-10' }),
          makeTask({ id: 't2', title: 'Soonest task', dueDate: '2026-09-02' }),
          makeTask({ id: 't3', title: 'Dateless task', dueDate: undefined }),
        ]),
      );

      renderPage();

      await screen.findByText('Soonest task');
      expect(rowTitles()).toEqual(['Soonest task', 'Later task', 'Dateless task']);
    });

    it('sorts high to low by priority', async () => {
      const user = userEvent.setup();
      h.listTasks.mockResolvedValue(
        listResult([
          makeTask({ id: 't1', title: 'Low one', priority: 'low' }),
          makeTask({ id: 't2', title: 'High one', priority: 'high' }),
          makeTask({ id: 't3', title: 'Medium one', priority: 'medium' }),
        ]),
      );

      renderPage();
      await screen.findByText('Low one');

      await user.selectOptions(screen.getByLabelText('Sort by'), 'priority');

      expect(rowTitles()).toEqual(['High one', 'Medium one', 'Low one']);
    });

    it('sorts newest first by creation date', async () => {
      const user = userEvent.setup();
      h.listTasks.mockResolvedValue(
        listResult([
          makeTask({ id: 't1', title: 'Older task', createdAt: '2026-08-01T09:00:00.000Z' }),
          makeTask({ id: 't2', title: 'Newest task', createdAt: '2026-08-30T09:00:00.000Z' }),
        ]),
      );

      renderPage();
      await screen.findByText('Older task');

      await user.selectOptions(screen.getByLabelText('Sort by'), 'created');

      expect(rowTitles()).toEqual(['Newest task', 'Older task']);
    });
  });

  describe('scope visibility by role', () => {
    it.each(['manager', 'admin', 'readonly'] as Role[])(
      'lets a %s switch between my tasks and all tasks',
      async (role) => {
        h.useSession.mockReturnValue({ user: makeUser(role) });

        renderPage();

        expect(await screen.findByRole('button', { name: 'My tasks' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'All tasks' })).toBeInTheDocument();
      },
    );

    it('hides the scope switch for a sales rep', async () => {
      h.useSession.mockReturnValue({ user: makeUser('rep') });

      renderPage();

      await screen.findByText('Send proposal');
      expect(screen.queryByRole('button', { name: 'My tasks' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'All tasks' })).not.toBeInTheDocument();
    });
  });

  describe('write access', () => {
    it('hides every mutating control from read-only users', async () => {
      h.useSession.mockReturnValue({ user: makeUser('readonly') });

      renderPage();

      await screen.findByText('Send proposal');
      expect(screen.queryByRole('button', { name: 'New task' })).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Edit task')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Delete task')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('View completion history')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Complete task')).toBeDisabled();
    });

    it('keeps the complete toggle inert for read-only users', async () => {
      const user = userEvent.setup();
      h.useSession.mockReturnValue({ user: makeUser('readonly') });

      renderPage();
      await screen.findByText('Send proposal');

      await user.click(screen.getByLabelText('Complete task'));

      expect(h.completeTask).not.toHaveBeenCalled();
    });

    it('shows no create button in the empty state for read-only users', async () => {
      h.useSession.mockReturnValue({ user: makeUser('readonly') });
      h.listTasks.mockResolvedValue(listResult([]));

      renderPage();

      expect(await screen.findByText('No tasks here')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'New task' })).not.toBeInTheDocument();
    });
  });

  describe('completion toggling', () => {
    it('completes an open task and reflects the new status in place', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Send proposal');

      await user.click(screen.getByLabelText('Complete task'));

      await waitFor(() => expect(h.completeTask).toHaveBeenCalledWith('t1'));
      // Optimistic in-place update: the row flips without a list refetch.
      await waitFor(() => expect(screen.getByLabelText('Reopen task')).toBeInTheDocument());
    });

    it('reopens a completed task and reflects the new status in place', async () => {
      const user = userEvent.setup();
      h.listTasks.mockResolvedValue(listResult([makeTask({ status: 'completed' })]));

      renderPage();
      await screen.findByText('Send proposal');

      await user.click(screen.getByLabelText('Reopen task'));

      await waitFor(() => expect(h.reopenTask).toHaveBeenCalledWith('t1'));
      await waitFor(() => expect(screen.getByLabelText('Complete task')).toBeInTheDocument());
    });

    it('toasts the failure message when toggling fails', async () => {
      const user = userEvent.setup();
      h.completeTask.mockRejectedValueOnce(new Error('Task already completed'));

      renderPage();
      await screen.findByText('Send proposal');

      await user.click(screen.getByLabelText('Complete task'));

      await waitFor(() => expect(h.show).toHaveBeenCalledWith('Task already completed', 'error'));
      expect(h.listTasks).toHaveBeenCalledTimes(1);
    });

    it('falls back to a generic toast for non-Error toggle failures', async () => {
      const user = userEvent.setup();
      h.completeTask.mockRejectedValueOnce('nope');

      renderPage();
      await screen.findByText('Send proposal');

      await user.click(screen.getByLabelText('Complete task'));

      await waitFor(() => expect(h.show).toHaveBeenCalledWith('Failed', 'error'));
    });
  });

  describe('deletion', () => {
    it('asks for confirmation using the task title', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Send proposal');

      await user.click(screen.getByLabelText('Delete task'));

      expect(
        await screen.findByText('Delete "Send proposal"? This cannot be undone.'),
      ).toBeInTheDocument();
      expect(h.deleteTask).not.toHaveBeenCalled();
    });

    it('deletes, toasts, and removes the row once confirmed', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Send proposal');

      await user.click(screen.getByLabelText('Delete task'));
      await user.click(await screen.findByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(h.deleteTask).toHaveBeenCalledWith('t1'));
      await waitFor(() => expect(h.show).toHaveBeenCalledWith('Task deleted', 'success'));
      // The row is removed in place from the confirmed delete — no refetch.
      await waitFor(() => expect(screen.queryByText('Send proposal')).not.toBeInTheDocument());
      expect(
        screen.queryByText('Delete "Send proposal"? This cannot be undone.'),
      ).not.toBeInTheDocument();
    });

    it('closes without deleting when cancelled', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Send proposal');

      await user.click(screen.getByLabelText('Delete task'));
      await user.click(await screen.findByRole('button', { name: 'Cancel' }));

      await waitFor(() =>
        expect(
          screen.queryByText('Delete "Send proposal"? This cannot be undone.'),
        ).not.toBeInTheDocument(),
      );
      expect(h.deleteTask).not.toHaveBeenCalled();
    });

    it('toasts the failure message when the delete rejects', async () => {
      const user = userEvent.setup();
      h.deleteTask.mockRejectedValueOnce(new Error('Forbidden'));

      renderPage();
      await screen.findByText('Send proposal');

      await user.click(screen.getByLabelText('Delete task'));
      await user.click(await screen.findByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(h.show).toHaveBeenCalledWith('Forbidden', 'error'));
      expect(h.listTasks).toHaveBeenCalledTimes(1);
    });
  });

  describe('modal wiring', () => {
    it('opens the form with the task being edited', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Send proposal');

      await user.click(screen.getByLabelText('Edit task'));

      expect(screen.getByTestId('task-form-modal')).toBeInTheDocument();
      expect(lastFormProps().open).toBe(true);
      expect(lastFormProps().task).toEqual(makeTask());
    });

    it('reloads the list when the form reports a save', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Send proposal');

      await user.click(screen.getByRole('button', { name: 'New task' }));
      lastFormProps().onSaved();

      await waitFor(() => expect(h.listTasks).toHaveBeenCalledTimes(2));
    });

    it('closes the form again when it reports closure', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Send proposal');

      await user.click(screen.getByRole('button', { name: 'New task' }));
      expect(screen.getByTestId('task-form-modal')).toBeInTheDocument();

      lastFormProps().onClose();

      await waitFor(() => expect(screen.queryByTestId('task-form-modal')).not.toBeInTheDocument());
    });

    it('opens the completion history for the row that was clicked', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Send proposal');

      await user.click(screen.getByLabelText('View completion history'));

      expect(screen.getByTestId('task-history-modal')).toBeInTheDocument();
      expect(lastHistoryProps()).toEqual(
        expect.objectContaining({ taskId: 't1', taskTitle: 'Send proposal' }),
      );
    });

    it('unmounts the history modal once it reports closure', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Send proposal');

      await user.click(screen.getByLabelText('View completion history'));
      expect(screen.getByTestId('task-history-modal')).toBeInTheDocument();

      lastHistoryProps().onClose();

      await waitFor(() =>
        expect(screen.queryByTestId('task-history-modal')).not.toBeInTheDocument(),
      );
    });
  });
});
