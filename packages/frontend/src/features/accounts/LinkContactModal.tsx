import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { EmptyState, LoadingBlock } from '../../components/ui/Feedback';
import { Field, Input, Select } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/toast';
import { addAccountLink } from './accountsApi';
import { listContacts } from '../contacts/contactsApi';
import type { Contact } from '../../types/domain';

interface LinkContactModalProps {
  accountId: string;
  linkedContactIds: string[];
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Mounts a fresh inner modal per account/links combination, so the contact
 * list fetch initializes once per open instead of syncing state in an effect.
 */
export function LinkContactModal(props: LinkContactModalProps) {
  if (!props.open) return null;
  return (
    <LinkContactModalInner
      key={`${props.accountId}-${props.linkedContactIds.join(',')}`}
      {...props}
    />
  );
}

function LinkContactModalInner({
  accountId,
  linkedContactIds,
  open,
  onClose,
  onSaved,
}: LinkContactModalProps) {
  const toast = useToast();
  // Snapshot the links at mount; the outer key guarantees a remount whenever
  // the account or its links change.
  const [initialLinked] = useState(linkedContactIds);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [contactId, setContactId] = useState('');
  const [role, setRole] = useState('');
  const [primary, setPrimary] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    listContacts({ pageSize: 10000 })
      .then((res) => {
        if (!active) return;
        const linked = new Set(initialLinked);
        setContacts(
          res.items
            .filter((c) => !linked.has(c.id))
            .sort((a, b) =>
              `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`),
            ),
        );
      })
      .catch(() => {
        if (active) setContacts([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [initialLinked]);

  const available = useMemo(() => contacts.length > 0, [contacts]);

  function submit() {
    if (!contactId) return;
    setSaving(true);
    addAccountLink(accountId, { contactId, primary, role: role.trim() || undefined })
      .then(() => {
        toast.show('Contact linked', 'success');
        onSaved();
        onClose();
      })
      .catch((err: unknown) =>
        toast.show(err instanceof Error ? err.message : 'Link failed', 'error'),
      )
      .finally(() => setSaving(false));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Link a contact"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || !contactId}>
            Link contact
          </Button>
        </>
      }
    >
      {loading ? (
        <LoadingBlock label="Loading contacts…" />
      ) : !available ? (
        <EmptyState
          title="No contacts to link"
          description="Every existing contact is already linked to this account."
        />
      ) : (
        <div className="space-y-4">
          <Field label="Contact" htmlFor="link-contact" required>
            <Select
              id="link-contact"
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
            >
              <option value="">Choose a contact…</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.firstName} {c.lastName}
                  {c.jobTitle ? ` — ${c.jobTitle}` : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Relationship"
            htmlFor="link-role"
            hint="Free text such as “Decision maker”, “Champion”, or “Legal review”."
          >
            <Input
              id="link-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Decision maker"
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input
              type="checkbox"
              checked={primary}
              onChange={(e) => setPrimary(e.target.checked)}
              className="accent-forest"
            />
            Primary contact for this account
          </label>
        </div>
      )}
    </Modal>
  );
}
