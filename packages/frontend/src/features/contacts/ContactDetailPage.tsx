import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ErrorBanner, LoadingBlock } from '../../components/ui/Feedback';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { ArrowLeftIcon, EditIcon, MailIcon, PhoneIcon, TrashIcon } from '../../components/icons';
import { useToast } from '../../components/toast';
import { formatDateTime } from '../../lib/format';
import { useQuery } from '../../lib/hooks';
import { useMeta } from '../meta/MetaContext';
import { deleteContact, exportContact, getContact } from './contactsApi';
import { QuickLogForm } from '../interactions/QuickLogForm';
import { Timeline } from '../interactions/Timeline';
import type { Contact } from '../../types/domain';

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

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

export default function ContactDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { accountName, userName, accounts, refresh } = useMeta();
  const [reloadKey, setReloadKey] = useState(0);
  const [pendingDelete, setPendingDelete] = useState(false);

  const {
    data: contact,
    loading,
    error,
  } = useQuery<Contact>(() => getContact(id ?? ''), [id, reloadKey]);

  // Self-heal: if a linked account is missing from the shared meta cache
  // (e.g. it was created in another tab or before the cache was primed),
  // refresh the cache so account names resolve instead of showing "Unknown".
  const linkedIds = contact?.accountLinks.map((l) => l.accountId) ?? [];
  const hasMissingAccount = linkedIds.some(
    (accountId) => !accounts.some((a) => a.id === accountId),
  );
  useEffect(() => {
    if (hasMissingAccount) void refresh();
  }, [hasMissingAccount, refresh]);

  if (loading) return <LoadingBlock label="Loading contact…" />;
  if (error || !contact) return <ErrorBanner message={error ?? 'Contact not found.'} />;

  const primaryAccountId =
    contact.accountLinks.find((l) => l.primary)?.accountId ?? contact.accountLinks[0]?.accountId;
  const exportName = `${contact.firstName}-${contact.lastName}-export.json`;

  function confirmDelete() {
    setPendingDelete(false);
    deleteContact(id ?? '')
      .then(() => {
        toast.show('Contact deleted', 'success');
        navigate('/contacts');
      })
      .catch((err: unknown) =>
        toast.show(err instanceof Error ? err.message : 'Delete failed', 'error'),
      );
  }

  function handleExport() {
    exportContact(id ?? '')
      .then((data) => downloadJson(data, exportName))
      .catch((err: unknown) =>
        toast.show(err instanceof Error ? err.message : 'Export failed', 'error'),
      );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <Link
        to="/contacts"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeftIcon className="size-4" /> Back to contacts
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-display font-semibold tracking-tight text-ink">
              {contact.firstName} {contact.lastName}
            </h1>
            <Badge tone={contact.status === 'active' ? 'success' : 'neutral'}>
              {contact.status === 'active' ? 'Active' : 'Inactive'}
            </Badge>
          </div>
          <p className="mt-1 text-15 text-ink-muted">
            {[contact.jobTitle, contact.company].filter(Boolean).join(' · ') || 'No title on file'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={handleExport}>
            Export data
          </Button>
          <Button variant="secondary" onClick={() => navigate(`/contacts/${id}/edit`)}>
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
            contactId={contact.id}
            accountId={primaryAccountId}
            onSaved={() => setReloadKey((k) => k + 1)}
          />
          <section>
            <h2 className="mb-3 font-display text-lg text-ink">Timeline</h2>
            <Timeline key={reloadKey} contactId={contact.id} />
          </section>
        </div>

        <div className="space-y-6">
          <Card title="Contact details">
            <dl className="space-y-3 text-sm">
              <div className="flex gap-3">
                <MailIcon className="size-4 shrink-0 text-ink-faint" />
                <span className="text-ink">{contact.email ?? '—'}</span>
              </div>
              <div className="flex gap-3">
                <PhoneIcon className="size-4 shrink-0 text-ink-faint" />
                <span className="text-ink">{contact.phone ?? '—'}</span>
              </div>
              {contact.address ? <p className="text-ink-muted">{contact.address}</p> : null}
              {contact.notes ? (
                <p className="whitespace-pre-wrap border-t hairline pt-3 text-ink-muted">
                  {contact.notes}
                </p>
              ) : null}
            </dl>
          </Card>

          <Card title="Linked accounts">
            {contact.accountLinks.length === 0 ? (
              <p className="text-sm text-ink-faint">No accounts linked.</p>
            ) : (
              <ul className="space-y-2.5">
                {contact.accountLinks.map((l) => (
                  <li key={l.accountId}>
                    <Link
                      to={`/accounts/${l.accountId}`}
                      className="group block rounded-md px-2 py-1.5 transition-colors hover:bg-fill"
                    >
                      <span className="flex items-center justify-between">
                        <span className="font-medium text-ink group-hover:text-forest">
                          {accountName(l.accountId)}
                        </span>
                        {l.primary ? <Badge tone="forest">Primary</Badge> : null}
                      </span>
                      {l.role ? <span className="text-13 text-ink-faint">{l.role}</span> : null}
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
                  {userName(contact.createdBy)} · {formatDateTime(contact.createdAt)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Last modified</dt>
                <dd className="text-right">
                  {userName(contact.updatedBy)} · {formatDateTime(contact.updatedAt)}
                </dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={pendingDelete}
        title="Delete contact"
        message="Delete this contact? It can be restored by an administrator within 30 days."
        confirmLabel="Delete"
        destructive
        onClose={() => setPendingDelete(false)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
