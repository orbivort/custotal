import { useState } from 'react';
import { formatDateTime } from '../../lib/format';
import { useQuery } from '../../lib/hooks';
import { useToast } from '../../components/toast';
import { useMeta } from '../meta/MetaContext';
import { Badge, type BadgeTone } from '../../components/ui/Badge';
import { LoadingBlock, EmptyState, Spinner } from '../../components/ui/Feedback';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { ArrowLeftIcon, EditIcon, TrashIcon } from '../../components/icons';
import { canWrite } from '../../lib/rbac';
import { useSession } from '../auth/SessionContext';
import { deleteInteraction, listInteractions } from './interactionsApi';
import { InteractionFormModal } from './InteractionFormModal';
import type { Interaction, InteractionType, PaginatedResult } from '../../types/domain';
import type { User } from '../../types/domain';

const PAGE_SIZE = 20;

const typeMeta: Record<InteractionType, { label: string; tone: BadgeTone }> = {
  email: { label: 'Email', tone: 'info' },
  call: { label: 'Call', tone: 'forest' },
  meeting: { label: 'Meeting', tone: 'warn' },
  note: { label: 'Note', tone: 'neutral' },
  other: { label: 'Other', tone: 'neutral' },
};

/**
 * Mirrors the server-side assertCanMutate rule for interactions: admins and
 * managers may edit any entry; reps only their own (author or responsible).
 */
function canMutateInteraction(user: User | null, i: Interaction): boolean {
  if (!user || !canWrite(user)) return false;
  return (
    user.role === 'admin' ||
    user.role === 'manager' ||
    i.createdBy === user.id ||
    i.responsibleUserId === user.id
  );
}

export function Timeline({
  contactId,
  accountId,
  opportunityId,
}: {
  contactId?: string;
  accountId?: string;
  opportunityId?: string;
}) {
  const { user } = useSession();
  const { userName } = useMeta();
  const toast = useToast();

  const { data, loading, refetch } = useQuery<PaginatedResult<Interaction>>(() =>
    listInteractions({ contactId, accountId, opportunityId, pageSize: PAGE_SIZE }),
  );
  // Server pagination (page 1 arrives via useQuery); older pages accumulate
  // here as batches. nextPage and hasMore are derived, not stored.
  const [extraBatches, setExtraBatches] = useState<Interaction[][]>([]);
  const [loadingMore, setLoadingMore] = useState(false);

  const [editing, setEditing] = useState<Interaction | null>(null);
  const [deleting, setDeleting] = useState<Interaction | null>(null);

  // Render-phase adjustment ("You Might Not Need an Effect"): reset the
  // accumulated pages whenever the base query resolves a new payload
  // (initial load, refetch after edits, contact switch).
  const [lastData, setLastData] = useState(data);
  if (lastData !== data) {
    setLastData(data);
    setExtraBatches([]);
  }

  const extra = extraBatches.flat();
  const items = [...(data?.items ?? []), ...extra];
  const nextPage = 2 + extraBatches.length;
  const hasMore = (data?.total ?? 0) > items.length;

  async function loadMore() {
    setLoadingMore(true);
    try {
      const res = await listInteractions({
        contactId,
        accountId,
        opportunityId,
        page: nextPage,
        pageSize: PAGE_SIZE,
      });
      setExtraBatches((prev) => [...prev, res.items]);
    } catch (err: unknown) {
      toast.show(err instanceof Error ? err.message : 'Failed to load more interactions', 'error');
    } finally {
      setLoadingMore(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await deleteInteraction(deleting.id);
      toast.show('Interaction deleted', 'success');
      setDeleting(null);
      await refetch();
    } catch (err: unknown) {
      toast.show(err instanceof Error ? err.message : 'Failed to delete', 'error');
    }
  }

  if (loading) return <LoadingBlock label="Loading timeline…" />;
  if (items.length === 0) {
    return (
      <EmptyState
        title="No interactions yet"
        description="Log your first touchpoint to build the history."
      />
    );
  }

  return (
    <div>
      <ol className="relative">
        <span className="absolute bottom-2 left-[15px] top-2 w-px bg-ink/10" aria-hidden />
        {items.map((i) => {
          const meta = typeMeta[i.type] ?? typeMeta.other;
          const mutable = canMutateInteraction(user, i);
          return (
            <li key={i.id} className="group relative flex gap-4 pb-6 last:pb-0">
              <span
                className={`relative z-10 mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border text-11 font-semibold ${
                  meta.tone === 'info'
                    ? 'border-info/20 bg-info/10 text-info'
                    : meta.tone === 'forest'
                      ? 'border-forest/20 bg-forest/10 text-forest'
                      : meta.tone === 'warn'
                        ? 'border-warn/20 bg-warn/10 text-warn'
                        : 'border-ink/10 bg-ink/5 text-ink-muted'
                }`}
              >
                {meta.label[0]}
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                  {i.direction ? (
                    <span className="inline-flex items-center gap-1 text-12 text-ink-faint">
                      {i.direction === 'inbound' ? (
                        <ArrowLeftIcon className="size-3 rotate-180" />
                      ) : (
                        <ArrowLeftIcon className="size-3" />
                      )}
                      {i.direction === 'inbound' ? 'Inbound' : 'Outbound'}
                    </span>
                  ) : null}
                  <span className="text-12 text-ink-faint">{formatDateTime(i.dateTime)}</span>
                  <span className="text-12 text-ink-faint">· {userName(i.responsibleUserId)}</span>
                  {mutable ? (
                    <span className="ml-auto flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      <button
                        type="button"
                        onClick={() => setEditing(i)}
                        className="rounded-md p-1.5 text-ink-faint hover:bg-fill hover:text-ink cursor-pointer"
                        aria-label="Edit interaction"
                        title="Edit interaction"
                      >
                        <EditIcon className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(i)}
                        className="rounded-md p-1.5 text-ink-faint hover:bg-danger/10 hover:text-danger cursor-pointer"
                        aria-label="Delete interaction"
                        title="Delete interaction"
                      >
                        <TrashIcon className="size-3.5" />
                      </button>
                    </span>
                  ) : null}
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-15 leading-relaxed text-ink">
                  {i.summary}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      {hasMore ? (
        <div className="mt-2 flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="inline-flex items-center gap-2 rounded-md border border-ink/15 bg-white px-3 py-1.5 text-13 text-ink-muted hover:bg-fill cursor-pointer disabled:opacity-50"
          >
            {loadingMore ? <Spinner className="size-3.5" /> : null}
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      ) : null}

      {editing ? (
        <InteractionFormModal
          interaction={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            void refetch();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete interaction"
        message="This removes the interaction from the timeline. An administrator can restore it from the recovery page for 30 days."
        confirmLabel="Delete"
        destructive
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
