// Edit modal for an existing interaction (FR-IT-04). Mirrors the server-side
// contract: type/direction/dateTime/summary/responsible user, with the
// `updatedAt` token for optimistic-concurrency 409 handling.
import { useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select, Textarea } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { ErrorBanner } from '../../components/ui/Feedback';
import { useMutation } from '../../lib/hooks';
import { formatDateTime } from '../../lib/format';
import { useMeta } from '../meta/MetaContext';
import { updateInteraction, type InteractionInput } from './interactionsApi';
import type { Interaction, InteractionDirection, InteractionType } from '../../types/domain';

const TYPES: InteractionType[] = ['call', 'email', 'meeting', 'note', 'other'];

/** ISO string -> datetime-local input value ("YYYY-MM-DDTHH:mm", local time). */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function InteractionFormModal({
  interaction,
  onClose,
  onSaved,
}: {
  interaction: Interaction;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { users } = useMeta();
  const [type, setType] = useState<InteractionType>(interaction.type);
  const [direction, setDirection] = useState<InteractionDirection>(
    interaction.direction ?? 'outbound',
  );
  const [dateTime, setDateTime] = useState(toLocalInput(interaction.dateTime));
  const [summary, setSummary] = useState(interaction.summary);
  const [responsibleUserId, setResponsibleUserId] = useState(interaction.responsibleUserId);

  const save = useMutation((input: Parameters<typeof updateInteraction>[1]) =>
    updateInteraction(interaction.id, input),
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    const payload: InteractionInput & { updatedAt: string } = {
      type,
      contactId: interaction.contactId,
      summary: summary.trim(),
      responsibleUserId,
      updatedAt: interaction.updatedAt,
    };
    if (type !== 'note') payload.direction = direction;
    const parsed = new Date(dateTime);
    if (!Number.isNaN(parsed.getTime())) payload.dateTime = parsed.toISOString();
    save
      .run(payload)
      .then(() => {
        onSaved();
        onClose();
      })
      .catch(() => undefined); // error surfaced by ErrorBanner
  }

  return (
    <Modal open onClose={onClose} title="Edit interaction">
      <form id="interaction-edit-form" onSubmit={submit} className="grid gap-3">
        {save.error ? <ErrorBanner message={save.error} /> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type" htmlFor="iedit-type">
            <Select
              id="iedit-type"
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
            <Field label="Direction" htmlFor="iedit-direction">
              <Select
                id="iedit-direction"
                value={direction}
                onChange={(e) => setDirection(e.target.value as InteractionDirection)}
              >
                <option value="inbound">Inbound</option>
                <option value="outbound">Outbound</option>
              </Select>
            </Field>
          ) : null}
          <Field label="Responsible user" htmlFor="iedit-user">
            <Select
              id="iedit-user"
              value={responsibleUserId}
              onChange={(e) => setResponsibleUserId(e.target.value)}
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date & time" htmlFor="iedit-datetime">
            <Input
              id="iedit-datetime"
              type="datetime-local"
              value={dateTime}
              onChange={(e) => setDateTime(e.target.value)}
            />
          </Field>
        </div>
        <Field
          label={`Summary (originally logged ${formatDateTime(interaction.createdAt)})`}
          htmlFor="iedit-summary"
        >
          <Textarea
            id="iedit-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="What happened?"
            maxLength={5000}
            required
          />
        </Field>
      </form>
      <div className="mt-4 flex items-center justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          form="interaction-edit-form"
          disabled={save.loading || !summary.trim()}
        >
          {save.loading ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </Modal>
  );
}
