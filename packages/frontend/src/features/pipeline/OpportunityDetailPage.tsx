import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { ErrorBanner, LoadingBlock } from '../../components/ui/Feedback';
import { ArrowLeftIcon, EditIcon, TrashIcon } from '../../components/icons';
import { useToast } from '../../components/toast';
import { formatCurrency, formatDate, formatDateTime, formatPercent } from '../../lib/format';
import { useQuery } from '../../lib/hooks';
import { canWrite } from '../../lib/rbac';
import { useMeta } from '../meta/MetaContext';
import { useSession } from '../auth/SessionContext';
import { QuickLogForm } from '../interactions/QuickLogForm';
import { Timeline } from '../interactions/Timeline';
import { getAccount } from '../accounts/accountsApi';
import { deleteOpportunity, getOpportunity } from './opportunitiesApi';
import { OpportunityFormModal } from './OpportunityFormModal';
import type { AccountDetailPayload, OpportunityDetail } from '../../types/domain';

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border hairline bg-white p-5">
      <h2 className="mb-3 text-11 font-semibold uppercase tracking-eyebrow text-ink-faint">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function OpportunityDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useSession();
  const { stageName, userName, accountName, stageById } = useMeta();
  const [editOpen, setEditOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [interactionKey, setInteractionKey] = useState(0);

  const write = canWrite(user);

  const { data, loading, error } = useQuery<OpportunityDetail>(
    () => getOpportunity(id ?? ''),
    [id, reloadKey],
  );

  // Account contacts power the quick-log contact selector (the opportunity's
  // own contact, when set, is the default selection).
  const accountId = data?.accountId;
  const { data: accountDetail } = useQuery<AccountDetailPayload | null>(
    () => (accountId ? getAccount(accountId) : Promise.resolve(null)),
    [accountId],
  );

  if (loading) return <LoadingBlock label="Loading deal…" />;
  if (error || !data) return <ErrorBanner message={error ?? 'Deal not found.'} />;

  const accountContacts = (accountDetail?.contacts ?? []).map((c) => ({
    id: c.id,
    name: `${c.firstName} ${c.lastName}`,
  }));

  const stage = stageById(data.stageId);
  const tone =
    stage?.classification === 'won'
      ? 'success'
      : stage?.classification === 'lost'
        ? 'danger'
        : 'forest';

  function confirmDelete() {
    setPendingDelete(false);
    deleteOpportunity(id ?? '')
      .then(() => {
        toast.show('Deal deleted', 'success');
        navigate('/pipeline');
      })
      .catch((err: unknown) =>
        toast.show(err instanceof Error ? err.message : 'Delete failed', 'error'),
      );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <Link
        to="/pipeline"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeftIcon className="size-4" /> Back to pipeline
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-display font-semibold tracking-tight text-ink">
              {data.name}
            </h1>
            {stage ? <Badge tone={tone}>{stage.name}</Badge> : null}
          </div>
          <p className="mt-1 text-15 text-ink-muted">
            {accountName(data.accountId)} · {formatCurrency(data.valueMinor, data.currency)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => setEditOpen(true)}>
            <EditIcon className="size-4" /> Edit
          </Button>
          {write ? (
            <Button
              variant="ghost"
              className="text-danger hover:bg-danger/5"
              onClick={() => setPendingDelete(true)}
            >
              <TrashIcon className="size-4" /> Delete
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {data.description ? (
            <Card title="Description">
              <p className="whitespace-pre-wrap text-15 leading-relaxed text-ink">
                {data.description}
              </p>
            </Card>
          ) : null}

          {stage?.classification === 'lost' ? (
            <Card title="Loss reason">
              <p className="text-15 text-ink">{data.lossReason || 'Not specified'}</p>
            </Card>
          ) : null}

          <QuickLogForm
            contactId={data.contactId ?? undefined}
            opportunityId={data.id}
            contacts={accountContacts.length > 0 ? accountContacts : undefined}
            onSaved={() => setInteractionKey((k) => k + 1)}
          />
          <section>
            <h2 className="mb-3 font-display text-lg text-ink">Timeline</h2>
            <Timeline key={interactionKey} opportunityId={data.id} />
          </section>

          <Card title="Stage history">
            {data.history.length === 0 ? (
              <p className="text-sm text-ink-faint">No stage transitions recorded.</p>
            ) : (
              <ol className="relative space-y-4">
                <span className="absolute bottom-2 left-[5px] top-2 w-px bg-ink/10" aria-hidden />
                {data.history.map((h) => (
                  <li key={h.id} className="relative flex gap-3 pl-0">
                    <span className="relative z-10 mt-1 size-2.5 shrink-0 rounded-full bg-forest" />
                    <div className="text-sm">
                      <p className="text-ink">
                        {h.fromStageId ? (
                          <>
                            Moved from{' '}
                            <span className="font-medium">{stageName(h.fromStageId)}</span> to{' '}
                            <span className="font-medium">{stageName(h.toStageId)}</span>
                          </>
                        ) : (
                          <>
                            Created in <span className="font-medium">{stageName(h.toStageId)}</span>
                          </>
                        )}
                      </p>
                      <p className="text-12 text-ink-faint">
                        {userName(h.userId)} · {formatDateTime(h.timestamp)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Deal details">
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-faint">Account</dt>
                <dd>
                  <Link to={`/accounts/${data.accountId}`} className="text-ink hover:text-forest">
                    {accountName(data.accountId)}
                  </Link>
                </dd>
              </div>
              {data.contactId ? (
                <div className="flex justify-between">
                  <dt className="text-ink-faint">Contact</dt>
                  <dd>
                    <Link to={`/contacts/${data.contactId}`} className="text-ink hover:text-forest">
                      View contact
                    </Link>
                  </dd>
                </div>
              ) : null}
              <div className="flex justify-between">
                <dt className="text-ink-faint">Owner</dt>
                <dd className="text-ink">{userName(data.ownerId)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-faint">Expected close</dt>
                <dd className="text-ink">{formatDate(data.expectedCloseDate)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-faint">Probability</dt>
                <dd className="text-ink">
                  {formatPercent(data.probability)}
                  {data.probabilityManual ? (
                    <span className="text-ink-faint"> (manual)</span>
                  ) : null}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-faint">Value</dt>
                <dd className="text-ink">{formatCurrency(data.valueMinor, data.currency)}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>

      <OpportunityFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        opportunity={data}
        onSaved={() => setReloadKey((k) => k + 1)}
      />

      <ConfirmDialog
        open={pendingDelete}
        title="Delete deal"
        message="Delete this deal? It can be restored by an administrator within 30 days."
        confirmLabel="Delete"
        destructive
        onClose={() => setPendingDelete(false)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
