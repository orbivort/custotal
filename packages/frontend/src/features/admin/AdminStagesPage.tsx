import { useMemo, useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { Badge, type BadgeTone } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { LoadingBlock } from '../../components/ui/Feedback';
import { Field, Input, Select } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  EditIcon,
  LockIcon,
  PlusIcon,
  TrashIcon,
} from '../../components/icons';
import { useToast } from '../../components/toast';
import { ApiError } from '../../lib/api';
import { useQuery } from '../../lib/hooks';
import { useMeta } from '../meta/MetaContext';
import { useEnsureStages } from '../meta/useEnsureStages';
import { listOpportunities } from '../pipeline/opportunitiesApi';
import { createStage, deleteStage, reorderStages, updateStage } from './adminApi';
import type { ListResult, Opportunity, Stage, StageClassification } from '../../types/domain';
import { AdminNav } from './AdminNav';

const classificationTone: Record<StageClassification, BadgeTone> = {
  open: 'neutral',
  won: 'success',
  lost: 'danger',
};

const classificationLabel: Record<StageClassification, string> = {
  open: 'Open',
  won: 'Won',
  lost: 'Lost',
};

export default function AdminStagesPage() {
  const { stages, refresh } = useMeta();
  const toast = useToast();

  // First visit provisions the default pipeline if the instance has none yet.
  useEnsureStages();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Stage | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Stage | null>(null);

  const { data: oppData, loading: oppLoading } = useQuery<ListResult<Opportunity>>(() =>
    listOpportunities(),
  );

  const sorted = useMemo(() => [...stages].sort((a, b) => a.order - b.order), [stages]);
  const occupancy = useMemo(() => {
    const map = new Map<string, number>();
    for (const opp of oppData?.items ?? []) map.set(opp.stageId, (map.get(opp.stageId) ?? 0) + 1);
    return map;
  }, [oppData]);

  function moveStage(stage: Stage, dir: -1 | 1) {
    const index = sorted.findIndex((s) => s.id === stage.id);
    const target = index + dir;
    if (index < 0 || target < 0 || target >= sorted.length) return;
    const reordered = [...sorted];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    reorderStages(reordered.map((s) => s.id))
      .then(() => refresh())
      .catch((err: unknown) =>
        toast.show(err instanceof Error ? err.message : 'Reorder failed', 'error'),
      );
  }

  function confirmDelete() {
    const stage = pendingDelete;
    if (!stage) return;
    setPendingDelete(null);
    deleteStage(stage.id)
      .then(() => {
        toast.show('Stage deleted', 'success');
        refresh();
      })
      .catch((err: unknown) =>
        toast.show(err instanceof Error ? err.message : 'Delete failed', 'error'),
      );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Pipeline stages"
        subtitle="Order, rename, and tune the win probability of each stage in the sales pipeline."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <PlusIcon className="size-4" /> New stage
          </Button>
        }
      />

      <AdminNav />

      {oppLoading ? (
        <LoadingBlock label="Loading pipeline…" />
      ) : (
        <div className="overflow-x-auto rounded-xl border hairline bg-white">
          <ul className="divide-y hairline">
            {sorted.map((stage, index) => {
              const count = occupancy.get(stage.id) ?? 0;
              const isFirst = index === 0;
              const isLast = index === sorted.length - 1;
              return (
                <li
                  key={stage.id}
                  className="flex flex-wrap items-center gap-3 px-5 py-3.5 transition-colors hover:bg-fill/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                      <button
                        onClick={() => moveStage(stage, -1)}
                        disabled={isFirst}
                        className="rounded p-1.5 text-ink-faint hover:text-ink disabled:opacity-25 cursor-pointer"
                        aria-label={`Move ${stage.name} up`}
                      >
                        <ArrowUpIcon className="size-3.5" />
                      </button>
                      <button
                        onClick={() => moveStage(stage, 1)}
                        disabled={isLast}
                        className="rounded p-1.5 text-ink-faint hover:text-ink disabled:opacity-25 cursor-pointer"
                        aria-label={`Move ${stage.name} down`}
                      >
                        <ArrowDownIcon className="size-3.5" />
                      </button>
                    </div>
                    <span
                      className={`size-2.5 rounded-full ${
                        stage.classification === 'won'
                          ? 'bg-success'
                          : stage.classification === 'lost'
                            ? 'bg-danger'
                            : 'bg-forest'
                      }`}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-15 font-medium text-ink">{stage.name}</p>
                    <p className="text-12 text-ink-faint">#{index + 1} in pipeline order</p>
                  </div>

                  <Badge tone={classificationTone[stage.classification]}>
                    {classificationLabel[stage.classification]}
                  </Badge>

                  <span className="hidden w-32 text-right text-13 text-ink-muted sm:block">
                    Default win:{' '}
                    <span className="font-medium text-ink">{stage.winProbability}%</span>
                  </span>

                  <span
                    className={`flex w-20 items-center justify-end gap-1 text-13 ${count > 0 ? 'text-ink-muted' : 'text-ink-faint'}`}
                  >
                    {count > 0 ? <LockIcon className="size-3.5 text-warn" /> : null}
                    {count} {count === 1 ? 'deal' : 'deals'}
                  </span>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditing(stage);
                        setFormOpen(true);
                      }}
                      className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-fill hover:text-ink cursor-pointer"
                      aria-label={`Edit ${stage.name}`}
                    >
                      <EditIcon className="size-4" />
                    </button>
                    <button
                      onClick={() => setPendingDelete(stage)}
                      disabled={count > 0}
                      className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-danger/5 hover:text-danger disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer"
                      aria-label={`Delete ${stage.name}`}
                    >
                      <TrashIcon className="size-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {!oppLoading ? (
        <p className="text-13 leading-relaxed text-ink-faint">
          A stage holding deals is locked: move or close those deals before deleting it. Renaming is
          always allowed and existing deals inherit the new name.
        </p>
      ) : null}

      <StageFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        stage={editing}
        orderHint={editing ? undefined : sorted.length + 1}
        onSaved={refresh}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete stage"
        message={
          pendingDelete ? `Delete stage "${pendingDelete.name}"? This cannot be undone.` : ''
        }
        confirmLabel="Delete"
        destructive
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

interface StageFormModalProps {
  open: boolean;
  onClose: () => void;
  stage: Stage | null;
  orderHint?: number;
  onSaved: () => void;
}

/**
 * Mounts a fresh inner form per open/edited stage, so field state initializes
 * from props directly — no state-syncing effect, and closing the modal
 * discards the draft.
 */
function StageFormModal({ open, stage, ...rest }: StageFormModalProps) {
  if (!open) return null;
  return <StageFormModalInner key={stage?.id ?? 'new'} open stage={stage} {...rest} />;
}

function StageFormModalInner({ open, onClose, stage, orderHint, onSaved }: StageFormModalProps) {
  const toast = useToast();
  const [name, setName] = useState(stage?.name ?? '');
  const [probability, setProbability] = useState(String(stage?.winProbability ?? 10));
  const [classification, setClassification] = useState<StageClassification>(
    stage?.classification ?? 'open',
  );
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit() {
    setSaving(true);
    const body = { name, winProbability: Number(probability), classification };
    const req = stage ? updateStage(stage.id, body) : createStage(body);
    req
      .then(() => {
        toast.show(stage ? 'Stage updated' : 'Stage created', 'success');
        onSaved();
        onClose();
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.details) {
          const map: Record<string, string> = {};
          err.details.forEach((d) => {
            map[d.field] = d.message;
          });
          setErrors(map);
        } else {
          toast.show(err instanceof Error ? err.message : 'Save failed', 'error');
        }
      })
      .finally(() => setSaving(false));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={stage ? 'Edit stage' : 'New stage'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {stage ? 'Save changes' : 'Add stage'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field
          label="Stage name"
          htmlFor="stage-name"
          required
          error={errors.name}
          hint={
            orderHint !== undefined
              ? `New stages append at the end of the pipeline (position ${orderHint}).`
              : undefined
          }
        >
          <Input
            id="stage-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Pilot"
          />
        </Field>
        {/* Two fields side by side would each be too narrow to show their own
            input inside a phone-width dialog, so they stack below `sm`. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Default win probability"
            htmlFor="stage-prob"
            required
            error={errors.winProbability}
          >
            <Input
              id="stage-prob"
              type="number"
              min={0}
              max={100}
              value={probability}
              onChange={(e) => setProbability(e.target.value)}
            />
          </Field>
          <Field
            label="Classification"
            htmlFor="stage-class"
            required
            error={errors.classification}
          >
            <Select
              id="stage-class"
              value={classification}
              onChange={(e) => setClassification(e.target.value as StageClassification)}
            >
              <option value="open">Open</option>
              <option value="won">Won</option>
              <option value="lost">Lost</option>
            </Select>
          </Field>
        </div>
      </div>
    </Modal>
  );
}
