import { useMemo, useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { Badge, type BadgeTone } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorBanner, LoadingBlock } from '../../components/ui/Feedback';
import { Select } from '../../components/ui/Field';
import { CheckIcon, ClockIcon, EditIcon, PlusIcon, TrashIcon } from '../../components/icons';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/toast';
import { completeTask, deleteTask, listTasks, reopenTask } from './tasksApi';
import { formatDate, isOverdue } from '../../lib/format';
import { canWrite } from '../../lib/rbac';
import { useQuery } from '../../lib/hooks';
import { useMeta } from '../meta/MetaContext';
import { useSession } from '../auth/SessionContext';
import { TaskFormModal } from './TaskFormModal';
import { TaskHistoryModal } from './TaskHistoryModal';
import type { ListResult, Task, TaskPriority } from '../../types/domain';

const priorityTone: Record<TaskPriority, BadgeTone> = {
  high: 'danger',
  medium: 'warn',
  low: 'neutral',
};

type SortKey = 'due' | 'priority' | 'created';

export default function TasksPage() {
  const { user } = useSession();
  const { userName, accountName, users } = useMeta();
  const toast = useToast();
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [owner, setOwner] = useState('');
  const [related, setRelated] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('due');
  const [formOpen, setFormOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null);
  const [historyTask, setHistoryTask] = useState<Task | null>(null);

  const canViewAll =
    user?.role === 'manager' || user?.role === 'admin' || user?.role === 'readonly';
  const write = canWrite(user);

  const { data, loading, error, errorIsFallback, refetch, setData } = useQuery<ListResult<Task>>(
    () =>
      listTasks({
        scope,
        status,
        priority,
        owner: scope === 'all' ? owner : undefined,
        related,
      }),
    [scope, status, priority, owner, related],
  );
  const tasks = useMemo(() => data?.items ?? [], [data]);

  /** Patch a single task in the query state without a refetch. */
  function patchTask(updated: Task) {
    setData((prev) =>
      prev ? { ...prev, items: prev.items.map((t) => (t.id === updated.id ? updated : t)) } : prev,
    );
  }

  // Memoized so unrelated re-renders (modal keystrokes, toasts) do not re-sort.
  const sorted = useMemo(
    () =>
      tasks.toSorted((a, b) => {
        if (sortKey === 'due') {
          return (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999');
        }
        if (sortKey === 'priority') {
          const order = { high: 0, medium: 1, low: 2 } as const;
          return order[a.priority] - order[b.priority];
        }
        return b.createdAt.localeCompare(a.createdAt);
      }),
    [tasks, sortKey],
  );

  function toggleComplete(task: Task) {
    const opening = task.status === 'open';
    // Optimistic flip: the checkbox reacts instantly, the server response
    // reconciles the record, and a failure reverts to the original.
    patchTask({ ...task, status: opening ? 'completed' : 'open' });
    const req = opening ? completeTask(task.id) : reopenTask(task.id);
    req.then(patchTask).catch((err: unknown) => {
      toast.show(err instanceof Error ? err.message : 'Failed', 'error');
      patchTask(task);
    });
  }

  function confirmDelete() {
    const task = pendingDelete;
    if (!task) return;
    setPendingDelete(null);
    deleteTask(task.id)
      .then(() => {
        toast.show('Task deleted', 'success');
        setData((prev) =>
          prev ? { ...prev, items: prev.items.filter((t) => t.id !== task.id) } : prev,
        );
      })
      .catch((err: unknown) => toast.show(err instanceof Error ? err.message : 'Failed', 'error'));
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Tasks"
        subtitle={scope === 'mine' ? 'Your open follow-ups' : 'Every task across the team'}
        actions={
          write ? (
            <Button
              onClick={() => {
                setEditTask(null);
                setFormOpen(true);
              }}
            >
              <PlusIcon className="size-4" /> New task
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        {canViewAll ? (
          <div className="flex rounded-lg border border-ink/10 bg-white p-0.5">
            <button
              onClick={() => setScope('mine')}
              className={`rounded-md px-3 py-1.5 text-sm ${scope === 'mine' ? 'bg-forest text-paper' : 'text-ink-muted'} cursor-pointer`}
            >
              My tasks
            </button>
            <button
              onClick={() => setScope('all')}
              className={`rounded-md px-3 py-1.5 text-sm ${scope === 'all' ? 'bg-forest text-paper' : 'text-ink-muted'} cursor-pointer`}
            >
              All tasks
            </button>
          </div>
        ) : null}
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-full sm:w-36"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="completed">Completed</option>
        </Select>
        <Select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="w-full sm:w-36"
          aria-label="Filter by priority"
        >
          <option value="">All priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </Select>
        {scope === 'all' && canViewAll ? (
          <Select
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            className="w-full sm:w-44"
            aria-label="Filter by owner"
          >
            <option value="">All owners</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        ) : null}
        <Select
          value={related}
          onChange={(e) => setRelated(e.target.value)}
          className="w-full sm:w-48"
          aria-label="Filter by related record"
        >
          <option value="">All related records</option>
          <option value="contact">Linked to a contact</option>
          <option value="account">Linked to an account</option>
          <option value="opportunity">Linked to a deal</option>
          <option value="none">No linked record</option>
        </Select>
        <Select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="w-full sm:w-40"
          aria-label="Sort by"
        >
          <option value="due">Sort: Due date</option>
          <option value="priority">Sort: Priority</option>
          <option value="created">Sort: Created</option>
        </Select>
      </div>

      {error ? (
        <ErrorBanner message={errorIsFallback ? 'Failed to load' : error} />
      ) : loading ? (
        <LoadingBlock />
      ) : sorted.length === 0 ? (
        <EmptyState
          title="No tasks here"
          description="Create a follow-up to keep the next step moving."
          action={
            write ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setEditTask(null);
                  setFormOpen(true);
                }}
              >
                New task
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-2">
          {sorted.map((task) => {
            const overdue = task.status === 'open' && isOverdue(task.dueDate);
            return (
              <li
                key={task.id}
                className="flex items-center gap-3 rounded-xl border hairline bg-white px-4 py-3 transition-colors hover:border-ink/20"
              >
                <button
                  onClick={() => write && toggleComplete(task)}
                  disabled={!write}
                  // 24px, not 20px: the complete/reopen control is the row's
                  // primary action and must clear the WCAG 2.5.8 minimum.
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
                    task.status === 'completed'
                      ? 'border-success bg-success text-white'
                      : 'border-ink/25 text-transparent hover:border-forest'
                  } ${write ? 'cursor-pointer' : 'cursor-default'}`}
                  aria-label={task.status === 'open' ? 'Complete task' : 'Reopen task'}
                >
                  <CheckIcon className="size-3" />
                </button>

                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-15 ${task.status === 'completed' ? 'text-ink-faint line-through' : 'text-ink'}`}
                  >
                    {task.title}
                  </p>
                  <p className="truncate text-12 text-ink-faint">
                    {task.accountId ? accountName(task.accountId) : 'No account'}
                    {task.contactId ? ' · linked to a contact' : ''}
                    {task.opportunityId ? ' · linked to a deal' : ''}
                  </p>
                </div>

                <Badge tone={priorityTone[task.priority]} className="capitalize">
                  {task.priority}
                </Badge>

                <div className="hidden w-40 shrink-0 sm:block">
                  <span
                    className={`text-13 ${overdue ? 'font-medium text-danger' : 'text-ink-faint'}`}
                  >
                    {task.dueDate ? formatDate(task.dueDate) : 'No due date'}
                    {overdue ? ' · overdue' : ''}
                  </span>
                </div>

                {scope === 'all' ? (
                  <span className="hidden w-32 shrink-0 text-13 text-ink-muted md:block">
                    {userName(task.assigneeId)}
                  </span>
                ) : null}

                {write ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => setHistoryTask(task)}
                      className="rounded-md p-2 text-ink-faint transition-colors hover:bg-fill hover:text-ink cursor-pointer"
                      aria-label="View completion history"
                      title="Completion history"
                    >
                      <ClockIcon className="size-4" />
                    </button>
                    <button
                      onClick={() => {
                        setEditTask(task);
                        setFormOpen(true);
                      }}
                      className="rounded-md p-2 text-ink-faint transition-colors hover:bg-fill hover:text-ink cursor-pointer"
                      aria-label="Edit task"
                    >
                      <EditIcon className="size-4" />
                    </button>
                    <button
                      onClick={() => setPendingDelete(task)}
                      className="rounded-md p-2 text-ink-faint transition-colors hover:bg-danger/5 hover:text-danger cursor-pointer"
                      aria-label="Delete task"
                    >
                      <TrashIcon className="size-4" />
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <TaskFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        task={editTask}
        onSaved={() => void refetch()}
      />

      {historyTask ? (
        <TaskHistoryModal
          taskId={historyTask.id}
          taskTitle={historyTask.title}
          onClose={() => setHistoryTask(null)}
        />
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete task"
        message={pendingDelete ? `Delete "${pendingDelete.title}"? This cannot be undone.` : ''}
        confirmLabel="Delete"
        destructive
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
