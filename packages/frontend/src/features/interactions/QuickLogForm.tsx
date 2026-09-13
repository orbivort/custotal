import { useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { Field, Select, Textarea } from '../../components/ui/Field';
import { useToast } from '../../components/toast';
import { canWrite } from '../../lib/rbac';
import { createInteraction } from './interactionsApi';
import type { InteractionDirection, InteractionType } from '../../types/domain';
import { useSession } from '../auth/SessionContext';

const TYPES: InteractionType[] = ['call', 'email', 'meeting', 'note', 'other'];

export function QuickLogForm({
  contactId,
  accountId,
  opportunityId,
  contacts,
  onSaved,
}: {
  contactId?: string;
  accountId?: string;
  opportunityId?: string;
  contacts?: { id: string; name: string }[];
  onSaved: () => void;
}) {
  const { user } = useSession();
  const toast = useToast();
  const [type, setType] = useState<InteractionType>('call');
  const [direction, setDirection] = useState<InteractionDirection>('inbound');
  const [summary, setSummary] = useState('');
  const [selectedContactId, setSelectedContactId] = useState(contactId ?? '');
  const [saving, setSaving] = useState(false);

  if (!canWrite(user)) {
    return null;
  }

  const effectiveContactId = contacts ? selectedContactId : (contactId ?? '');

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!summary.trim() || !effectiveContactId) return;
    setSaving(true);
    createInteraction({
      type,
      direction: type === 'note' ? undefined : direction,
      summary: summary.trim(),
      contactId: effectiveContactId,
      accountId,
      opportunityId,
      responsibleUserId: user?.id,
    })
      .then(() => {
        setSummary('');
        toast.show('Interaction logged', 'success');
        onSaved();
      })
      .catch((err: unknown) =>
        toast.show(err instanceof Error ? err.message : 'Failed to log', 'error'),
      )
      .finally(() => setSaving(false));
  }

  return (
    <form onSubmit={submit} className="rounded-xl border hairline bg-cream/50 p-4">
      <p className="mb-3 font-display text-17 text-ink">Log an interaction</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {contacts ? (
          <Field label="Contact" htmlFor="qlog-contact">
            <Select
              id="qlog-contact"
              value={selectedContactId}
              onChange={(e) => setSelectedContactId(e.target.value)}
            >
              <option value="">Select a contact…</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label="Type" htmlFor="qlog-type">
          <Select
            id="qlog-type"
            value={type}
            onChange={(e) => setType(e.target.value as InteractionType)}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t[0].toUpperCase() + t.slice(1)}
              </option>
            ))}
          </Select>
        </Field>
        {type !== 'note' ? (
          <Field label="Direction" htmlFor="qlog-direction">
            <Select
              id="qlog-direction"
              value={direction}
              onChange={(e) => setDirection(e.target.value as InteractionDirection)}
            >
              <option value="inbound">Inbound</option>
              <option value="outbound">Outbound</option>
            </Select>
          </Field>
        ) : null}
      </div>
      <div className="mt-3">
        <Field label="Summary" htmlFor="qlog-summary">
          <Textarea
            id="qlog-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="What happened?"
            maxLength={5000}
          />
        </Field>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="min-w-0 text-12 text-ink-faint">
          Logged by {user?.name ?? 'you'} · {new Date().toLocaleDateString('en-US')}
        </span>
        <Button
          type="submit"
          className="shrink-0"
          disabled={saving || !summary.trim() || !effectiveContactId}
          size="sm"
        >
          {saving ? 'Saving…' : 'Save interaction'}
        </Button>
      </div>
    </form>
  );
}
