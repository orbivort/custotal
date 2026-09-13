// Completion-history viewer (FR-TA-03). Every completion cycle is retained
// server-side in TaskCompletion, so reopen + complete again keeps the record.
import { Modal } from '../../components/ui/Modal';
import { EmptyState, ErrorBanner, LoadingBlock } from '../../components/ui/Feedback';
import { useQuery } from '../../lib/hooks';
import { formatDateTime } from '../../lib/format';
import { useMeta } from '../meta/MetaContext';
import { listTaskCompletions } from './tasksApi';
import type { TaskCompletionEntry } from './tasksApi';

export function TaskHistoryModal({
  taskId,
  taskTitle,
  onClose,
}: {
  taskId: string;
  taskTitle: string;
  onClose: () => void;
}) {
  const { userName } = useMeta();
  const { data, loading, error } = useQuery<{ items: TaskCompletionEntry[]; total: number }>(
    () => listTaskCompletions(taskId),
    [taskId],
  );

  const items = data?.items ?? [];

  return (
    <Modal open onClose={onClose} title={`Completion history — ${taskTitle}`}>
      {loading ? (
        <LoadingBlock label="Loading history…" />
      ) : error ? (
        <ErrorBanner message={error} />
      ) : items.length === 0 ? (
        <EmptyState
          title="No completions yet"
          description="This task has not been completed so far."
        />
      ) : (
        <ol className="relative space-y-4">
          <span className="absolute bottom-2 left-[5px] top-2 w-px bg-ink/10" aria-hidden />
          {items.map((c) => (
            <li key={c.id} className="relative flex gap-3">
              <span className="relative z-10 mt-1 size-2.5 shrink-0 rounded-full bg-success" />
              <div className="text-sm">
                <p className="text-ink">
                  Completed by <span className="font-medium">{userName(c.completedBy)}</span>
                </p>
                <p className="text-12 text-ink-faint">{formatDateTime(c.completedAt)}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}
