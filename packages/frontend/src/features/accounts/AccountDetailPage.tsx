import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ErrorBanner, LoadingBlock } from '../../components/ui/Feedback';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { ArrowLeftIcon, EditIcon, LinkIcon, TrashIcon } from '../../components/icons';
import { useToast } from '../../components/toast';
import { formatCurrency, formatDate, formatDateTime } from '../../lib/format';
import { canWrite } from '../../lib/rbac';
import { useQuery } from '../../lib/hooks';
import { useSession } from '../auth/SessionContext';
import { useMeta } from '../meta/MetaContext';
import { QuickLogForm } from '../interactions/QuickLogForm';
import { Timeline } from '../interactions/Timeline';
import { deleteAccount, getAccount, removeAccountLink } from './accountsApi';
import { LinkContactModal } from './LinkContactModal';
import type { AccountDetailPayload, Contact } from '../../types/domain';

function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border hairline bg-white p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-11 font-semibold uppercase tracking-eyebrow text-ink-faint">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function AccountDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useSession();
  const { userName, stageById, refresh } = useMeta();
  const [reloadKey, setReloadKey] = useState(0);
  const [linkOpen, setLinkOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [pendingUnlink, setPendingUnlink] = useState<Contact | null>(null);
  const write = canWrite(user);

  const { data, loading, error } = useQuery<AccountDetailPayload>(
    () => getAccount(id ?? ''),
    [id, reloadKey],
  );

  if (loading) return <LoadingBlock label="Loading account…" />;
  if (error || !data) return <ErrorBanner message={error ?? 'Account not found.'} />;

  const { account, contacts, opportunities } = data;

  function confirmUnlink() {
    const contact = pendingUnlink;
    if (!contact) return;
    setPendingUnlink(null);
    removeAccountLink(id ?? '', contact.id)
      .then(() => {
        toast.show('Contact unlinked', 'success');
        setReloadKey((k) => k + 1);
      })
      .catch((err: unknown) =>
        toast.show(err instanceof Error ? err.message : 'Unlink failed', 'error'),
      );
  }

  function confirmDelete() {
    setPendingDelete(false);
    deleteAccount(id ?? '')
      .then(() => {
        toast.show('Account deleted', 'success');
        void refresh();
        navigate('/accounts');
      })
      .catch((err: unknown) =>
        toast.show(err instanceof Error ? err.message : 'Delete failed', 'error'),
      );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <Link
        to="/accounts"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeftIcon className="size-4" /> Back to accounts
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-display font-semibold tracking-tight text-ink">
              {account.name}
            </h1>
          </div>
          <p className="mt-1 text-15 text-ink-muted">
            {account.industry ?? 'No industry'} · Owned by {userName(account.ownerId)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => navigate(`/accounts/${id}/edit`)}>
            <EditIcon className="size-4" /> Edit
          </Button>
          <Button
            variant="ghost"
            className="text-danger hover:bg-danger/5"
            onClick={() => setPendingDelete(true)}
          >
            <TrashIcon className="size-4" /> Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <QuickLogForm
            accountId={account.id}
            contacts={contacts.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}` }))}
            onSaved={() => setReloadKey((k) => k + 1)}
          />
          <section>
            <h2 className="mb-3 font-display text-lg text-ink">Timeline</h2>
            <Timeline key={reloadKey} accountId={account.id} />
          </section>
        </div>

        <div className="space-y-6">
          <Card title="Account details">
            <dl className="space-y-3 text-sm text-ink-muted">
              {account.website ? <dd className="text-ink">{account.website}</dd> : null}
              {account.phone ? <dd className="text-ink">{account.phone}</dd> : null}
              {account.billingAddress ? <dd>{account.billingAddress}</dd> : null}
              {account.notes ? (
                <dd className="whitespace-pre-wrap border-t hairline pt-3">{account.notes}</dd>
              ) : null}
            </dl>
          </Card>

          <Card
            title="Contacts"
            action={
              write ? (
                <Button size="sm" variant="subtle" onClick={() => setLinkOpen(true)}>
                  <LinkIcon className="size-3.5" /> Link contact
                </Button>
              ) : undefined
            }
          >
            {contacts.length === 0 ? (
              <p className="text-sm text-ink-faint">No contacts linked yet.</p>
            ) : (
              <ul className="space-y-1">
                {contacts.map((c) => (
                  <li key={c.id}>
                    <div className="group flex items-center justify-between rounded-md px-2 py-1.5 transition-colors hover:bg-fill">
                      <Link
                        to={`/contacts/${c.id}`}
                        className="flex min-w-0 flex-1 items-center gap-2"
                      >
                        <span className="truncate font-medium text-ink group-hover:text-forest">
                          {c.firstName} {c.lastName}
                        </span>
                        {c.link?.primary ? <Badge tone="forest">Primary</Badge> : null}
                        {c.link?.role ? (
                          <span className="truncate text-12 text-ink-faint">· {c.link.role}</span>
                        ) : null}
                      </Link>
                      {write ? (
                        <button
                          onClick={() => setPendingUnlink(c)}
                          className="tap-target ml-1 shrink-0 rounded p-1.5 text-ink-faint opacity-0 transition-opacity hover:bg-danger/5 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                          aria-label={`Unlink ${c.firstName} ${c.lastName}`}
                        >
                          <TrashIcon className="size-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Opportunities">
            {opportunities.length === 0 ? (
              <p className="text-sm text-ink-faint">No opportunities for this account.</p>
            ) : (
              <ul className="space-y-2">
                {opportunities.map((o) => (
                  <li key={o.id}>
                    <Link
                      to={`/opportunities/${o.id}`}
                      className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-fill"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink">
                          {o.name}
                        </span>
                        <span className="text-12 text-ink-faint">
                          {formatDate(o.expectedCloseDate)}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <Badge tone="forest">{stageById(o.stageId)?.name}</Badge>
                        <span className="text-sm font-medium text-ink">
                          {formatCurrency(o.valueMinor, o.currency)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Record history">
            <dl className="space-y-2 text-13 text-ink-muted">
              <div className="flex justify-between gap-2">
                <dt>Created</dt>
                <dd className="text-right">
                  {userName(account.createdBy)} · {formatDateTime(account.createdAt)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Last modified</dt>
                <dd className="text-right">
                  {userName(account.updatedBy)} · {formatDateTime(account.updatedAt)}
                </dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>

      <LinkContactModal
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        accountId={account.id}
        linkedContactIds={contacts.map((c) => c.id)}
        onSaved={() => setReloadKey((k) => k + 1)}
      />

      <ConfirmDialog
        open={pendingDelete}
        title="Delete account"
        message="Delete this account? It can be restored by an administrator within 30 days."
        confirmLabel="Delete"
        destructive
        onClose={() => setPendingDelete(false)}
        onConfirm={confirmDelete}
      />

      <ConfirmDialog
        open={pendingUnlink !== null}
        title="Unlink contact"
        message={
          pendingUnlink
            ? `Unlink ${pendingUnlink.firstName} ${pendingUnlink.lastName} from this account? The contact record is kept.`
            : ''
        }
        confirmLabel="Unlink"
        destructive
        onClose={() => setPendingUnlink(null)}
        onConfirm={confirmUnlink}
      />
    </div>
  );
}
