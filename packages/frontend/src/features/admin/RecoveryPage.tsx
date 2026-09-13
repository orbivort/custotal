import { useState, type ReactNode } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState, ErrorBanner, LoadingBlock } from '../../components/ui/Feedback';
import {
  BuildingIcon,
  CheckCircleIcon,
  MailIcon,
  RestoreIcon,
  TargetIcon,
  TrashIcon,
  UsersIcon,
} from '../../components/icons';
import { useToast } from '../../components/toast';
import { useQuery } from '../../lib/hooks';
import { formatCurrency, formatDateTime, formatPercent, initials } from '../../lib/format';
import { useMeta } from '../meta/MetaContext';
import {
  listTrash,
  purgeTrashAccount,
  purgeTrashContact,
  purgeTrashInteraction,
  purgeTrashOpportunity,
  purgeTrashTask,
  restoreTrashAccount,
  restoreTrashContact,
  restoreTrashInteraction,
  restoreTrashOpportunity,
  restoreTrashTask,
} from './adminApi';
import type {
  Account,
  Contact,
  Interaction,
  Opportunity,
  Task,
  TrashPayload,
} from '../../types/domain';
import { AdminNav } from './AdminNav';

/**
 * A purge awaiting confirmation. The destructive call is deferred into `run`
 * so it only fires once the user confirms.
 */
interface PendingPurge {
  title: string;
  message: string;
  run: () => void;
}

export default function RecoveryPage() {
  const toast = useToast();
  const { userName } = useMeta();
  const [pendingPurge, setPendingPurge] = useState<PendingPurge | null>(null);

  const {
    data: payload,
    loading,
    error,
    errorIsFallback,
    refetch,
  } = useQuery<TrashPayload>(listTrash);

  function act(action: Promise<unknown>, success: string) {
    action
      .then(() => {
        toast.show(success, 'success');
        void refetch();
      })
      .catch((err: unknown) =>
        toast.show(err instanceof Error ? err.message : 'Action failed', 'error'),
      );
  }

  function confirmPurge() {
    const pending = pendingPurge;
    setPendingPurge(null);
    pending?.run();
  }

  const contacts = payload?.contacts ?? [];
  const accounts = payload?.accounts ?? [];
  const opportunities = payload?.opportunities ?? [];
  const tasks = payload?.tasks ?? [];
  const interactions = payload?.interactions ?? [];
  const total =
    contacts.length + accounts.length + opportunities.length + tasks.length + interactions.length;

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Recovery"
        subtitle="Soft-deleted records stay here for 30 days before they are purged automatically."
      />

      <AdminNav />

      {error ? (
        <ErrorBanner message={errorIsFallback ? 'Failed to load trash' : error} />
      ) : loading ? (
        <LoadingBlock label="Loading trash…" />
      ) : total === 0 ? (
        <EmptyState
          title="Nothing to recover"
          description="When a teammate deletes a contact, account, deal, task, or interaction it lands here so you can restore it."
        />
      ) : (
        <div className="space-y-8">
          <Section
            icon={<UsersIcon className="size-5" />}
            title="Contacts"
            count={contacts.length}
            empty="No deleted contacts."
          >
            {contacts.map((c) => (
              <ContactRow
                key={c.id}
                contact={c}
                onRestore={() => act(restoreTrashContact(c.id), 'Contact restored')}
                onPurge={() =>
                  setPendingPurge({
                    title: 'Purge contact',
                    message: `Permanently purge ${c.firstName} ${c.lastName}? This cannot be undone.`,
                    run: () => act(purgeTrashContact(c.id), 'Contact purged'),
                  })
                }
              />
            ))}
          </Section>

          <Section
            icon={<BuildingIcon className="size-5" />}
            title="Accounts"
            count={accounts.length}
            empty="No deleted accounts."
          >
            {accounts.map((a) => (
              <AccountRow
                key={a.id}
                account={a}
                userName={userName}
                onRestore={() => act(restoreTrashAccount(a.id), 'Account restored')}
                onPurge={() =>
                  setPendingPurge({
                    title: 'Purge account',
                    message: `Permanently purge ${a.name}? This cannot be undone.`,
                    run: () => act(purgeTrashAccount(a.id), 'Account purged'),
                  })
                }
              />
            ))}
          </Section>

          <Section
            icon={<TargetIcon className="size-5" />}
            title="Deals"
            count={opportunities.length}
            empty="No deleted deals."
          >
            {opportunities.map((o) => (
              <OpportunityRow
                key={o.id}
                opportunity={o}
                userName={userName}
                onRestore={() => act(restoreTrashOpportunity(o.id), 'Deal restored')}
                onPurge={() =>
                  setPendingPurge({
                    title: 'Purge deal',
                    message: `Permanently purge ${o.name}? This cannot be undone.`,
                    run: () => act(purgeTrashOpportunity(o.id), 'Deal purged'),
                  })
                }
              />
            ))}
          </Section>

          <Section
            icon={<CheckCircleIcon className="size-5" />}
            title="Tasks"
            count={tasks.length}
            empty="No deleted tasks."
          >
            {tasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                userName={userName}
                onRestore={() => act(restoreTrashTask(t.id), 'Task restored')}
                onPurge={() =>
                  setPendingPurge({
                    title: 'Purge task',
                    message: `Permanently purge "${t.title}"? This cannot be undone.`,
                    run: () => act(purgeTrashTask(t.id), 'Task purged'),
                  })
                }
              />
            ))}
          </Section>

          <Section
            icon={<MailIcon className="size-5" />}
            title="Interactions"
            count={interactions.length}
            empty="No deleted interactions."
          >
            {interactions.map((i) => (
              <InteractionRow
                key={i.id}
                interaction={i}
                userName={userName}
                onRestore={() => act(restoreTrashInteraction(i.id), 'Interaction restored')}
                onPurge={() =>
                  setPendingPurge({
                    title: 'Purge interaction',
                    message: 'Permanently purge this interaction? This cannot be undone.',
                    run: () => act(purgeTrashInteraction(i.id), 'Interaction purged'),
                  })
                }
              />
            ))}
          </Section>
        </div>
      )}

      <ConfirmDialog
        open={pendingPurge !== null}
        title={pendingPurge?.title ?? 'Purge record'}
        message={pendingPurge?.message ?? ''}
        confirmLabel="Purge"
        destructive
        onClose={() => setPendingPurge(null)}
        onConfirm={confirmPurge}
      />
    </div>
  );
}

function Section({
  icon,
  title,
  count,
  empty,
  children,
}: {
  icon: ReactNode;
  title: string;
  count: number;
  empty: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 font-display text-lg text-ink">
        {icon}
        {title}
        <Badge tone="neutral">{count}</Badge>
      </h2>
      {count === 0 ? (
        <p className="rounded-xl border hairline bg-white px-5 py-6 text-sm text-ink-faint">
          {empty}
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border hairline bg-white">
          <ul className="divide-y hairline">{children}</ul>
        </div>
      )}
    </section>
  );
}

function ContactRow({
  contact,
  onRestore,
  onPurge,
}: {
  contact: Contact;
  onRestore: () => void;
  onPurge: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-danger/10 text-11 font-semibold text-danger">
        {initials(`${contact.firstName} ${contact.lastName}`)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-15 font-medium text-ink">
          {contact.firstName} {contact.lastName}
        </p>
        <p className="truncate text-13 text-ink-faint">
          {contact.email ?? contact.phone ?? 'No contact info'} · deleted{' '}
          {contact.deletedAt ? formatDateTime(contact.deletedAt) : ''}
        </p>
      </div>
      <Button variant="secondary" size="sm" onClick={onRestore}>
        <RestoreIcon className="size-4" /> Restore
      </Button>
      <Button variant="ghost" size="sm" className="text-danger hover:bg-danger/5" onClick={onPurge}>
        <TrashIcon className="size-4" /> Purge
      </Button>
    </li>
  );
}

function OpportunityRow({
  opportunity,
  userName,
  onRestore,
  onPurge,
}: {
  opportunity: Opportunity;
  userName: (id?: string) => string;
  onRestore: () => void;
  onPurge: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-danger/10 text-11 font-semibold text-danger">
        {initials(opportunity.name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-15 font-medium text-ink">{opportunity.name}</p>
        <p className="truncate text-13 text-ink-faint">
          {formatCurrency(opportunity.valueMinor, opportunity.currency)} ·{' '}
          {formatPercent(opportunity.probability)} · owned by {userName(opportunity.ownerId)} ·
          deleted {opportunity.deletedAt ? formatDateTime(opportunity.deletedAt) : ''}
        </p>
      </div>
      <Button variant="secondary" size="sm" onClick={onRestore}>
        <RestoreIcon className="size-4" /> Restore
      </Button>
      <Button variant="ghost" size="sm" className="text-danger hover:bg-danger/5" onClick={onPurge}>
        <TrashIcon className="size-4" /> Purge
      </Button>
    </li>
  );
}

function TaskRow({
  task,
  userName,
  onRestore,
  onPurge,
}: {
  task: Task;
  userName: (id?: string) => string;
  onRestore: () => void;
  onPurge: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-danger/10 text-11 font-semibold text-danger">
        <CheckCircleIcon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-15 font-medium text-ink">{task.title}</p>
        <p className="truncate text-13 text-ink-faint">
          Assigned to {userName(task.assigneeId)} · deleted{' '}
          {task.deletedAt ? formatDateTime(task.deletedAt) : ''}
        </p>
      </div>
      <Button variant="secondary" size="sm" onClick={onRestore}>
        <RestoreIcon className="size-4" /> Restore
      </Button>
      <Button variant="ghost" size="sm" className="text-danger hover:bg-danger/5" onClick={onPurge}>
        <TrashIcon className="size-4" /> Purge
      </Button>
    </li>
  );
}

function InteractionRow({
  interaction,
  userName,
  onRestore,
  onPurge,
}: {
  interaction: Interaction;
  userName: (id?: string) => string;
  onRestore: () => void;
  onPurge: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-danger/10 text-11 font-semibold uppercase text-danger">
        {interaction.type[0]}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-15 font-medium text-ink">{interaction.summary}</p>
        <p className="truncate text-13 text-ink-faint">
          <span className="capitalize">{interaction.type}</span> · responsible:{' '}
          {userName(interaction.responsibleUserId)} · deleted{' '}
          {interaction.deletedAt ? formatDateTime(interaction.deletedAt) : ''}
        </p>
      </div>
      <Button variant="secondary" size="sm" onClick={onRestore}>
        <RestoreIcon className="size-4" /> Restore
      </Button>
      <Button variant="ghost" size="sm" className="text-danger hover:bg-danger/5" onClick={onPurge}>
        <TrashIcon className="size-4" /> Purge
      </Button>
    </li>
  );
}

function AccountRow({
  account,
  userName,
  onRestore,
  onPurge,
}: {
  account: Account;
  userName: (id?: string) => string;
  onRestore: () => void;
  onPurge: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-danger/10 text-11 font-semibold text-danger">
        {initials(account.name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-15 font-medium text-ink">{account.name}</p>
        <p className="truncate text-13 text-ink-faint">
          {account.industry ?? 'No industry'} · owned by {userName(account.ownerId)} · deleted{' '}
          {account.deletedAt ? formatDateTime(account.deletedAt) : ''}
        </p>
      </div>
      <Button variant="secondary" size="sm" onClick={onRestore}>
        <RestoreIcon className="size-4" /> Restore
      </Button>
      <Button variant="ghost" size="sm" className="text-danger hover:bg-danger/5" onClick={onPurge}>
        <TrashIcon className="size-4" /> Purge
      </Button>
    </li>
  );
}
