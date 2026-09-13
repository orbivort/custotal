import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select, Textarea } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { ErrorBanner } from '../../components/ui/Feedback';
import { useToast } from '../../components/toast';
import { env } from '../../config/env';
import { valueLabel } from '../../lib/format';
import { useMeta } from '../meta/MetaContext';
import { useEnsureStages } from '../meta/useEnsureStages';
import { useSession } from '../auth/SessionContext';
import { listContacts } from '../contacts/contactsApi';
import { createOpportunity, updateOpportunity } from './opportunitiesApi';
import type { Contact, Opportunity } from '../../types/domain';

interface OpportunityFormModalProps {
  open: boolean;
  onClose: () => void;
  opportunity?: Opportunity | null;
  onSaved: () => void;
}

/**
 * Mounts a fresh inner form per open/edited deal, so field state initializes
 * from props directly — no state-syncing effect, and closing the modal
 * discards the draft.
 */
export function OpportunityFormModal({ open, opportunity, ...rest }: OpportunityFormModalProps) {
  if (!open) return null;
  return (
    <OpportunityFormModalInner
      key={opportunity?.id ?? 'new'}
      open
      opportunity={opportunity}
      {...rest}
    />
  );
}

function OpportunityFormModalInner({
  open,
  onClose,
  opportunity,
  onSaved,
}: OpportunityFormModalProps) {
  const { accounts, stages, users } = useMeta();
  const { user } = useSession();
  const toast = useToast();

  // First visit to the deal form provisions the default pipeline if the
  // instance has none yet, so the Stage dropdown is never empty out of the box.
  useEnsureStages();

  // Default stage is the first open stage by order — never a hard-coded
  // id, since admin-configured pipelines can use arbitrary stage ids.
  const defaultStage = stages.find((s) => s.classification === 'open');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [name, setName] = useState(opportunity?.name ?? '');
  const [accountId, setAccountId] = useState(opportunity?.accountId ?? '');
  const [contactId, setContactId] = useState(opportunity?.contactId ?? '');
  const [valueDollars, setValueDollars] = useState(
    opportunity ? String(opportunity.valueMinor / 100) : '0',
  );
  const [closeDate, setCloseDate] = useState(opportunity?.expectedCloseDate ?? '');
  const [stageId, setStageId] = useState(opportunity?.stageId ?? defaultStage?.id ?? '');
  const [probability, setProbability] = useState(
    opportunity?.probability ?? defaultStage?.winProbability ?? 10,
  );
  const [manualProb, setManualProb] = useState(opportunity?.probabilityManual ?? false);
  const [ownerId, setOwnerId] = useState(opportunity?.ownerId ?? user?.id ?? '');
  const [description, setDescription] = useState(opportunity?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; accountId?: string }>({});

  // Reference data for the select; setStates happen in async callbacks.
  useEffect(() => {
    listContacts({})
      .then((r) => setContacts(r.items))
      .catch(() => setContacts([]));
  }, []);

  function handleStageChange(next: string) {
    setStageId(next);
    const stage = stages.find((s) => s.id === next);
    setProbability(stage?.winProbability ?? 0);
    setManualProb(false);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const errors: { name?: string; accountId?: string } = {};
    if (!name.trim()) errors.name = 'Name is required.';
    if (!accountId) errors.accountId = 'Account is required.';

    if (errors.name || errors.accountId) {
      setFieldErrors(errors);
      // Move focus to the first invalid control so keyboard and screen-reader
      // users land directly on what needs fixing.
      const firstInvalid = errors.name ? 'opp-name' : 'opp-account';
      document.getElementById(firstInvalid)?.focus();
      return;
    }
    setFieldErrors({});
    setSaving(true);
    setError('');

    const payload = {
      name: name.trim(),
      accountId,
      contactId: contactId || undefined,
      valueMinor: Math.round(parseFloat(valueDollars || '0') * 100),
      currency: env.defaultCurrency,
      expectedCloseDate: closeDate,
      stageId,
      probability,
      probabilityManual: manualProb,
      ownerId,
      description: description.trim(),
    };

    const req = opportunity
      ? updateOpportunity(opportunity.id, payload)
      : createOpportunity(payload);

    req
      .then(() => {
        toast.show(opportunity ? 'Deal updated' : 'Deal created', 'success');
        onSaved();
        onClose();
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Save failed'))
      .finally(() => setSaving(false));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={opportunity ? 'Edit deal' : 'New deal'}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button form="opportunity-form" type="submit" disabled={saving}>
            {saving ? 'Saving…' : opportunity ? 'Save changes' : 'Create deal'}
          </Button>
        </>
      }
    >
      <form id="opportunity-form" onSubmit={submit} className="space-y-4">
        {error ? <ErrorBanner message={error} /> : null}
        <Field label="Deal name" htmlFor="opp-name" required error={fieldErrors.name}>
          <Input
            id="opp-name"
            value={name}
            invalid={Boolean(fieldErrors.name)}
            onChange={(e) => {
              setName(e.target.value);
              if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: undefined }));
            }}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Account" htmlFor="opp-account" required error={fieldErrors.accountId}>
            <Select
              id="opp-account"
              value={accountId}
              invalid={Boolean(fieldErrors.accountId)}
              onChange={(e) => {
                setAccountId(e.target.value);
                if (fieldErrors.accountId)
                  setFieldErrors((prev) => ({ ...prev, accountId: undefined }));
              }}
            >
              <option value="">Select account…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Contact" htmlFor="opp-contact">
            <Select
              id="opp-contact"
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
            >
              <option value="">None</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.firstName} {c.lastName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={valueLabel('Value')} htmlFor="opp-value">
            <Input
              id="opp-value"
              type="number"
              min={0}
              step={0.01}
              value={valueDollars}
              onChange={(e) => setValueDollars(e.target.value)}
            />
          </Field>
          <Field label="Expected close date" htmlFor="opp-close">
            <Input
              id="opp-close"
              type="date"
              value={closeDate}
              onChange={(e) => setCloseDate(e.target.value)}
            />
          </Field>
          <Field label="Stage" htmlFor="opp-stage">
            <Select
              id="opp-stage"
              value={stageId}
              onChange={(e) => handleStageChange(e.target.value)}
            >
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Probability (%)"
            htmlFor="opp-prob"
            hint={manualProb ? 'Manually set' : 'Auto from stage'}
          >
            <Input
              id="opp-prob"
              type="number"
              min={0}
              max={100}
              value={probability}
              onChange={(e) => {
                const next = Number(e.target.value);
                setProbability(Number.isNaN(next) ? 0 : next);
                setManualProb(true);
              }}
            />
          </Field>
          <Field label="Owner" htmlFor="opp-owner">
            <Select id="opp-owner" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Description" htmlFor="opp-desc">
          <Textarea
            id="opp-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
      </form>
    </Modal>
  );
}
