import { useMemo, useState, type DragEvent } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '../../components/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ErrorBanner, LoadingBlock } from '../../components/ui/Feedback';
import { Field, Select, Textarea } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { DownloadIcon, PlusIcon } from '../../components/icons';
import { useToast } from '../../components/toast';
import { downloadCsv, toCsv } from '../../lib/csv';
import { formatCurrency, formatDate, initials, valueLabel } from '../../lib/format';
import { useQuery } from '../../lib/hooks';
import { useMeta } from '../meta/MetaContext';
import { useSession } from '../auth/SessionContext';
import { listOpportunities, moveOpportunityStage } from './opportunitiesApi';
import { OpportunityFormModal } from './OpportunityFormModal';
import type { ListResult, Opportunity, Stage } from '../../types/domain';

export default function PipelinePage() {
  const { stages, stageById, accountName, userName, users } = useMeta();
  const { user } = useSession();
  const toast = useToast();

  const [view, setView] = useState<'board' | 'list'>('board');
  const [owner, setOwner] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editOpp, setEditOpp] = useState<Opportunity | null>(null);
  const [probMove, setProbMove] = useState<{ opp: Opportunity; toStage: Stage } | null>(null);
  const [lossMove, setLossMove] = useState<{ opp: Opportunity; toStage: Stage } | null>(null);
  const [lossReason, setLossReason] = useState('');

  const [sortKey, setSortKey] = useState<'value' | 'close' | 'stage' | 'owner'>('value');
  const [sortDesc, setSortDesc] = useState(true);

  const { data, loading, error, errorIsFallback, refetch, setData } = useQuery<
    ListResult<Opportunity>
  >(() => listOpportunities());
  const opps = useMemo(() => data?.items ?? [], [data]);

  const columns = useMemo(() => [...stages].sort((a, b) => a.order - b.order), [stages]);
  const visible = useMemo(
    () =>
      opps.filter(
        (o) => (!owner || o.ownerId === owner) && (!stageFilter || o.stageId === stageFilter),
      ),
    [opps, owner, stageFilter],
  );

  function moveStage(
    opp: Opportunity,
    toStageId: string,
    choice: 'keep' | 'default',
    lossReasonText?: string,
  ) {
    const toStage = stageById(toStageId);
    // Optimistic stage change; the server response reconciles the record.
    setData((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((o) =>
              o.id === opp.id
                ? {
                    ...o,
                    stageId: toStageId,
                    probability:
                      choice === 'keep'
                        ? o.probability
                        : (toStage?.winProbability ?? o.probability),
                    probabilityManual: choice === 'keep',
                    lossReason: toStage?.classification === 'lost' ? lossReasonText : undefined,
                  }
                : o,
            ),
          }
        : prev,
    );
    moveOpportunityStage(opp.id, {
      toStageId,
      probabilityChoice: choice,
      lossReason: lossReasonText,
    })
      .then((updated) =>
        setData((prev) =>
          prev
            ? { ...prev, items: prev.items.map((o) => (o.id === updated.id ? updated : o)) }
            : prev,
        ),
      )
      .catch((err: unknown) => {
        toast.show(err instanceof Error ? err.message : 'Move failed', 'error');
        void refetch();
      });
  }

  function handleMove(opp: Opportunity, toStageId: string) {
    const toStage = stageById(toStageId);
    if (!toStage || opp.stageId === toStageId) return;
    if (toStage.classification === 'lost') {
      setLossReason('');
      setLossMove({ opp, toStage });
    } else if (opp.probabilityManual) {
      setProbMove({ opp, toStage });
    } else {
      moveStage(opp, toStageId, 'default');
    }
  }

  function onColumnDrop(e: DragEvent<HTMLDivElement>, stageId: string) {
    e.preventDefault();
    const oppId = e.dataTransfer.getData('text/plain') || draggingId;
    const opp = opps.find((o) => o.id === oppId);
    if (opp) handleMove(opp, stageId);
    setDraggingId(null);
  }

  const sorted = useMemo(() => {
    const list = [...visible];
    list.sort((a, b) => {
      const av =
        sortKey === 'value'
          ? a.valueMinor
          : sortKey === 'close'
            ? a.expectedCloseDate
            : sortKey === 'stage'
              ? (stageById(a.stageId)?.order ?? 0)
              : userName(a.ownerId);
      const bv =
        sortKey === 'value'
          ? b.valueMinor
          : sortKey === 'close'
            ? b.expectedCloseDate
            : sortKey === 'stage'
              ? (stageById(b.stageId)?.order ?? 0)
              : userName(b.ownerId);
      return sortDesc ? (bv > av ? 1 : -1) : av > bv ? 1 : -1;
    });
    return list;
  }, [visible, sortKey, sortDesc, stageById, userName]);

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDesc((v) => !v);
    else {
      setSortKey(key);
      setSortDesc(key === 'stage' ? false : true);
    }
  }

  const canViewAllOwners =
    user?.role === 'manager' || user?.role === 'admin' || user?.role === 'readonly';

  function exportCsv() {
    const headers = ['Deal', 'Account', valueLabel('Value'), 'Close date', 'Stage', 'Owner'];
    const rows = sorted.map((o) => [
      o.name,
      accountName(o.accountId),
      (o.valueMinor / 100).toFixed(2),
      o.expectedCloseDate,
      stageById(o.stageId)?.name ?? '',
      userName(o.ownerId),
    ]);
    downloadCsv('pipeline.csv', toCsv(headers, rows));
    toast.show(`Exported ${sorted.length} deals`, 'success');
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Pipeline"
        subtitle="Drag deals between stages, or use the stage selector on each card."
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv} disabled={visible.length === 0}>
              <DownloadIcon className="size-4" /> Export
            </Button>
            <div className="flex rounded-lg border border-ink/10 bg-white p-0.5">
              <button
                onClick={() => setView('board')}
                className={`rounded-md px-3 py-1.5 text-sm ${view === 'board' ? 'bg-forest text-paper' : 'text-ink-muted'} cursor-pointer`}
              >
                Board
              </button>
              <button
                onClick={() => setView('list')}
                className={`rounded-md px-3 py-1.5 text-sm ${view === 'list' ? 'bg-forest text-paper' : 'text-ink-muted'} cursor-pointer`}
              >
                List
              </button>
            </div>
            <Button
              onClick={() => {
                setEditOpp(null);
                setFormOpen(true);
              }}
            >
              <PlusIcon className="size-4" /> New deal
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        {canViewAllOwners ? (
          <Select
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            className="w-full sm:w-48"
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
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          className="w-full sm:w-44"
          aria-label="Filter by stage"
        >
          <option value="">All stages</option>
          {columns.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <span className="text-sm text-ink-faint">
          {visible.length} deals · {formatCurrency(visible.reduce((s, o) => s + o.valueMinor, 0))}{' '}
          total value
        </span>
      </div>

      {error ? (
        <ErrorBanner message={errorIsFallback ? 'Failed to load' : error} />
      ) : loading ? (
        <LoadingBlock />
      ) : view === 'board' ? (
        // Bleeds to the page gutter on phones so the swipe is edge-to-edge,
        // and snaps column-to-column instead of stopping mid-card.
        <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:-mx-2 sm:px-2">
          {columns.map((stage) => {
            const stageOpps = visible.filter((o) => o.stageId === stage.id);
            const stageValue = stageOpps.reduce((s, o) => s + o.valueMinor, 0);
            return (
              <div
                key={stage.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onColumnDrop(e, stage.id)}
                // Narrower than `w-72` on a phone so the next column peeks in
                // and the horizontal scroll is discoverable.
                className="flex w-[85vw] max-w-72 shrink-0 snap-start flex-col rounded-xl border hairline bg-cream/50 sm:w-72"
              >
                <div className="flex items-center justify-between border-b hairline px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`size-2 rounded-full ${
                        stage.classification === 'won'
                          ? 'bg-success'
                          : stage.classification === 'lost'
                            ? 'bg-danger'
                            : 'bg-forest'
                      }`}
                    />
                    <span className="text-sm font-semibold text-ink">{stage.name}</span>
                    <span className="text-12 text-ink-faint">{stageOpps.length}</span>
                  </div>
                  <span className="text-12 text-ink-faint">{formatCurrency(stageValue)}</span>
                </div>
                <div className="flex min-h-24 flex-1 flex-col gap-2 p-2">
                  {stageOpps.length === 0 ? (
                    <p className="px-2 py-4 text-center text-12 text-ink-faint">Drop a deal here</p>
                  ) : (
                    stageOpps.map((o) => (
                      <div
                        key={o.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', o.id);
                          setDraggingId(o.id);
                        }}
                        onDragEnd={() => setDraggingId(null)}
                        className={`rounded-lg border border-ink/10 bg-white p-3 shadow-sm transition-shadow hover:shadow-md ${
                          draggingId === o.id ? 'opacity-50' : ''
                        }`}
                      >
                        <Link to={`/opportunities/${o.id}`} className="block">
                          <p className="text-sm font-medium text-ink hover:text-forest">{o.name}</p>
                          <p className="mt-0.5 truncate text-12 text-ink-faint">
                            {accountName(o.accountId)}
                          </p>
                          <p className="mt-2 font-display text-17 font-semibold text-ink">
                            {formatCurrency(o.valueMinor, o.currency)}
                          </p>
                        </Link>
                        <div className="mt-2 flex items-center justify-between border-t hairline pt-2">
                          <div className="flex items-center gap-1.5">
                            <span className="flex size-5 items-center justify-center rounded-full bg-forest/15 text-9 font-semibold text-forest">
                              {initials(userName(o.ownerId))}
                            </span>
                            <span className="text-12 text-ink-faint">
                              {formatDate(o.expectedCloseDate)}
                            </span>
                          </div>
                          <select
                            value={o.stageId}
                            onChange={(e) => handleMove(o, e.target.value)}
                            aria-label={`Move ${o.name} to stage`}
                            className="max-w-28 cursor-pointer rounded border border-ink/10 bg-transparent px-1.5 py-1 text-12 text-ink-muted focus:outline-none"
                          >
                            {columns.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // Every column is meaningful here (unlike the contacts table, which
        // drops two below `md`), so the list scrolls sideways rather than
        // squashing the deal names to nothing.
        <div className="overflow-x-auto rounded-xl border hairline bg-white">
          <table className="w-full min-w-[42rem] text-left text-sm">
            <thead>
              <tr className="border-b hairline text-12 uppercase tracking-label text-ink-faint">
                <th className="px-5 py-3 font-semibold">Deal</th>
                <th
                  className="px-5 py-3 font-semibold"
                  aria-sort={sortKey === 'value' ? (sortDesc ? 'descending' : 'ascending') : 'none'}
                >
                  <button
                    onClick={() => toggleSort('value')}
                    className="-mx-1 -my-1 inline-flex items-center gap-1 px-1 py-1 hover:text-ink cursor-pointer"
                  >
                    Value {sortKey === 'value' ? (sortDesc ? '↓' : '↑') : ''}
                  </button>
                </th>
                <th
                  className="px-5 py-3 font-semibold"
                  aria-sort={sortKey === 'close' ? (sortDesc ? 'descending' : 'ascending') : 'none'}
                >
                  <button
                    onClick={() => toggleSort('close')}
                    className="-mx-1 -my-1 inline-flex items-center gap-1 px-1 py-1 hover:text-ink cursor-pointer"
                  >
                    Close date {sortKey === 'close' ? (sortDesc ? '↓' : '↑') : ''}
                  </button>
                </th>
                <th
                  className="px-5 py-3 font-semibold"
                  aria-sort={sortKey === 'stage' ? (sortDesc ? 'descending' : 'ascending') : 'none'}
                >
                  <button
                    onClick={() => toggleSort('stage')}
                    className="-mx-1 -my-1 inline-flex items-center gap-1 px-1 py-1 hover:text-ink cursor-pointer"
                  >
                    Stage {sortKey === 'stage' ? (sortDesc ? '↓' : '↑') : ''}
                  </button>
                </th>
                <th
                  className="px-5 py-3 font-semibold"
                  aria-sort={sortKey === 'owner' ? (sortDesc ? 'descending' : 'ascending') : 'none'}
                >
                  <button
                    onClick={() => toggleSort('owner')}
                    className="-mx-1 -my-1 inline-flex items-center gap-1 px-1 py-1 hover:text-ink cursor-pointer"
                  >
                    Owner {sortKey === 'owner' ? (sortDesc ? '↓' : '↑') : ''}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y hairline">
              {sorted.map((o) => (
                <tr key={o.id} className="transition-colors hover:bg-fill/50">
                  <td className="px-5 py-3.5">
                    <Link
                      to={`/opportunities/${o.id}`}
                      className="font-medium text-ink hover:text-forest"
                    >
                      {o.name}
                    </Link>
                    <p className="text-12 text-ink-faint">{accountName(o.accountId)}</p>
                  </td>
                  <td className="px-5 py-3.5 font-medium text-ink">
                    {formatCurrency(o.valueMinor, o.currency)}
                  </td>
                  <td className="px-5 py-3.5 text-ink-muted">{formatDate(o.expectedCloseDate)}</td>
                  <td className="px-5 py-3.5">
                    <Badge
                      tone={
                        stageById(o.stageId)?.classification === 'won'
                          ? 'success'
                          : stageById(o.stageId)?.classification === 'lost'
                            ? 'danger'
                            : 'forest'
                      }
                    >
                      {stageById(o.stageId)?.name}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5 text-ink-muted">{userName(o.ownerId)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <OpportunityFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        opportunity={editOpp}
        onSaved={() => void refetch()}
      />

      <Modal
        open={Boolean(probMove)}
        onClose={() => setProbMove(null)}
        title="Update probability?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setProbMove(null)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                if (probMove) moveStage(probMove.opp, probMove.toStage.id, 'default');
                setProbMove(null);
              }}
            >
              Use {probMove?.toStage.winProbability}%
            </Button>
            <Button
              onClick={() => {
                if (probMove) moveStage(probMove.opp, probMove.toStage.id, 'keep');
                setProbMove(null);
              }}
            >
              Keep {probMove?.opp.probability}%
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-muted">
          Moving to <span className="font-medium text-ink">{probMove?.toStage.name}</span> would
          normally set the probability to{' '}
          <span className="font-medium text-ink">{probMove?.toStage.winProbability}%</span>. You
          previously set a manual value of{' '}
          <span className="font-medium text-ink">{probMove?.opp.probability}%</span>.
        </p>
      </Modal>

      <Modal
        open={Boolean(lossMove)}
        onClose={() => setLossMove(null)}
        title="Mark as lost"
        footer={
          <>
            <Button variant="ghost" onClick={() => setLossMove(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (lossMove) moveStage(lossMove.opp, lossMove.toStage.id, 'default', lossReason);
                setLossMove(null);
              }}
            >
              Mark lost
            </Button>
          </>
        }
      >
        <Field label="Loss reason (optional)" htmlFor="loss-reason">
          <Textarea
            id="loss-reason"
            value={lossReason}
            onChange={(e) => setLossReason(e.target.value)}
            placeholder="Why was this deal lost?"
          />
        </Field>
      </Modal>
    </div>
  );
}
