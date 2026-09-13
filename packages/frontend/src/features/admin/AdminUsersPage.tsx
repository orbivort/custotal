import { useMemo, useState, type ReactNode } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorBanner, LoadingBlock } from '../../components/ui/Feedback';
import { Field, Input, Select } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EditIcon, PlusIcon, TrashIcon } from '../../components/icons';
import { useToast } from '../../components/toast';
import { ApiError } from '../../lib/api';
import { useQuery } from '../../lib/hooks';
import { ROLE_LABELS, ALL_ROLES } from '../../lib/rbac';
import { initials } from '../../lib/format';
import { useSession } from '../auth/SessionContext';
import { useMeta } from '../meta/MetaContext';
import { createUser, deleteUser, listUsers, updateUser, type CreateUserResult } from './adminApi';
import type { Role, User } from '../../types/domain';
import { AdminNav } from './AdminNav';

function roleOptions(): ReactNode {
  return ALL_ROLES.map((role) => (
    <option key={role} value={role}>
      {ROLE_LABELS[role]}
    </option>
  ));
}

export default function AdminUsersPage() {
  const { user: current } = useSession();
  const { refresh } = useMeta();
  const toast = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [pendingDelete, setPendingDelete] = useState<User | null>(null);

  const { data, loading, error, errorIsFallback, refetch, setData } = useQuery<User[]>(listUsers);
  const users = useMemo(() => data ?? [], [data]);

  function updateRole(target: User, role: Role) {
    if (role === target.role) return;
    updateUser(target.id, { role })
      .then((updated) => {
        setData((prev) => (prev ?? []).map((u) => (u.id === updated.id ? updated : u)));
        toast.show(`${updated.name} is now ${ROLE_LABELS[updated.role].toLowerCase()}`, 'success');
        refresh();
      })
      .catch((err: unknown) =>
        toast.show(err instanceof Error ? err.message : 'Update failed', 'error'),
      );
  }

  function confirmDelete() {
    const target = pendingDelete;
    if (!target) return;
    setPendingDelete(null);
    deleteUser(target.id)
      .then(() => {
        setData((prev) => (prev ?? []).filter((u) => u.id !== target.id));
        toast.show(`${target.name} removed`, 'success');
        refresh();
      })
      .catch((err: unknown) =>
        toast.show(err instanceof Error ? err.message : 'Delete failed', 'error'),
      );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Users & roles"
        subtitle="Everyone who can sign in, and the role that governs what they see and do."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <PlusIcon className="size-4" /> New user
          </Button>
        }
      />

      <AdminNav />

      {error ? (
        <ErrorBanner message={errorIsFallback ? 'Failed to load users' : error} />
      ) : loading ? (
        <LoadingBlock label="Loading users…" />
      ) : users.length === 0 ? (
        <EmptyState
          title="No users yet"
          description="Create the first teammate's account to get started — they'll receive an email invitation to set their password."
        />
      ) : (
        // The role selector alone is 11rem wide, so the table keeps a floor and
        // scrolls on a phone instead of squashing the name column.
        <div className="overflow-x-auto rounded-xl border hairline bg-white">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead>
              <tr className="border-b hairline text-12 uppercase tracking-label text-ink-faint">
                <th className="px-5 py-3 font-semibold">Name</th>
                <th className="hidden px-5 py-3 font-semibold md:table-cell">Email</th>
                <th className="px-5 py-3 font-semibold">Role</th>
                <th className="px-5 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y hairline">
              {users.map((u) => (
                <tr key={u.id} className="transition-colors hover:bg-fill/50">
                  <td className="px-5 py-3.5">
                    <span className="flex items-center gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-forest/15 text-11 font-semibold text-forest">
                        {initials(u.name)}
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-medium text-ink">{u.name}</span>
                          {u.id === current?.id ? <Badge tone="neutral">you</Badge> : null}
                        </span>
                        <span className="text-12 text-ink-faint md:hidden">{u.email}</span>
                      </span>
                    </span>
                  </td>
                  <td className="hidden px-5 py-3.5 text-ink-muted md:table-cell">{u.email}</td>
                  <td className="px-5 py-3.5">
                    <Select
                      value={u.role}
                      onChange={(e) => updateRole(u, e.target.value as Role)}
                      aria-label={`Role for ${u.name}`}
                      className="w-44 !py-1.5 text-13"
                    >
                      {roleOptions()}
                    </Select>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => {
                          setEditing(u);
                          setFormOpen(true);
                        }}
                        disabled={u.id === current?.id}
                        className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-fill hover:text-ink disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer"
                        aria-label={`Edit ${u.name}`}
                      >
                        <EditIcon className="size-4" />
                      </button>
                      <button
                        onClick={() => setPendingDelete(u)}
                        disabled={u.id === current?.id}
                        className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-danger/5 hover:text-danger disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer"
                        aria-label={`Delete ${u.name}`}
                      >
                        <TrashIcon className="size-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <UserFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        user={editing}
        onSaved={() => {
          void refetch();
          refresh();
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete user"
        message={
          pendingDelete
            ? `Delete ${pendingDelete.name}? Their account will no longer be able to sign in.`
            : ''
        }
        confirmLabel="Delete"
        destructive
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

interface UserFormModalProps {
  open: boolean;
  onClose: () => void;
  user: User | null;
  onSaved: () => void;
}

/**
 * Mounts a fresh inner form per open/edited user, so field state initializes
 * from props directly — no state-syncing effect, and closing the modal
 * discards the draft and the "user created" confirmation screen.
 */
function UserFormModal({ open, user, ...rest }: UserFormModalProps) {
  if (!open) return null;
  return <UserFormModalInner key={user?.id ?? 'new'} open user={user} {...rest} />;
}

function UserFormModalInner({ open, onClose, user, onSaved }: UserFormModalProps) {
  const toast = useToast();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [role, setRole] = useState<Role>(user?.role ?? 'rep');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<CreateUserResult | null>(null);
  const [copied, setCopied] = useState(false);

  function submit() {
    setSaving(true);
    const body = { name, email, role };
    const req = user ? updateUser(user.id, body) : createUser(body);
    req
      .then((result) => {
        if (user) {
          toast.show('User updated', 'success');
          onSaved();
          onClose();
          return;
        }
        // Keep the modal open on a success step: it confirms the invitation
        // and, when email delivery is unavailable, exposes the one-time
        // temporary credential the admin must share out-of-band.
        const createResult = result as CreateUserResult;
        setCreated(createResult);
        onSaved();
        toast.show(
          createResult.inviteSent
            ? `Invitation sent to ${createResult.user.email}`
            : 'User created — email delivery unavailable',
          createResult.inviteSent ? 'success' : 'info',
        );
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

  function copyTempPassword() {
    if (!created?.tempPassword) return;
    navigator.clipboard
      .writeText(created.tempPassword)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => undefined);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={created ? 'User created' : user ? 'Edit user' : 'New user'}
      footer={
        created ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving}>
              {user ? 'Save changes' : 'Create user & send invite'}
            </Button>
          </>
        )
      }
    >
      {created ? (
        <div role="status" className="space-y-4">
          <div className="rounded-xl border border-forest/30 bg-forest/5 p-4 text-sm leading-relaxed text-ink">
            {created.inviteSent ? (
              <>
                An invitation has been sent to{' '}
                <span className="font-semibold">{created.user.email}</span>. They'll receive a
                one-time link to set their password and sign in.
              </>
            ) : (
              <>
                Email delivery is unavailable, so share this temporary password with{' '}
                <span className="font-semibold">{created.user.email}</span> yourself. They'll be
                asked to set a new password the first time they sign in.
              </>
            )}
          </div>
          {created.tempPassword ? (
            <Field
              label="Temporary password"
              htmlFor="temp-password"
              hint="Shown only once. Copy it now and share it securely."
            >
              <div className="flex items-center gap-2">
                <Input
                  id="temp-password"
                  readOnly
                  value={created.tempPassword}
                  className="font-mono"
                />
                <Button
                  variant="secondary"
                  onClick={copyTempPassword}
                  aria-label="Copy temporary password"
                  className="shrink-0"
                >
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </Field>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="Full name" htmlFor="user-name" required error={errors.name}>
            <Input
              id="user-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Jordan Ellis"
            />
          </Field>
          <Field
            label="Email"
            htmlFor="user-email"
            required
            error={errors.email}
            hint="Used to sign in. They'll get an email invitation to set their password."
          >
            <Input
              id="user-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jordan@example.com"
            />
          </Field>
          <Field label="Role" htmlFor="user-role" required error={errors.role}>
            <Select id="user-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {roleOptions()}
            </Select>
          </Field>
        </div>
      )}
    </Modal>
  );
}
