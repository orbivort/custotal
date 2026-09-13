import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select, Textarea } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { ErrorBanner } from '../../components/ui/Feedback';
import { useToast } from '../../components/toast';
import { useMeta } from '../meta/MetaContext';
import { useSession } from '../auth/SessionContext';
import { listOpportunities } from '../pipeline/opportunitiesApi';
import { listContacts } from '../contacts/contactsApi';
import { createTask, updateTask } from './tasksApi';
import type { Contact, Opportunity, Task, TaskPriority } from '../../types/domain';

interface TaskFormModalProps {
  open: boolean;
  onClose: () => void;
  task?: Task | null;
  onSaved: () => void;
}

/**
 * Mounts a fresh inner form per open/edited task, so field state initializes
 * from props directly — no state-syncing effect, and closing the modal
 * discards the draft.
 */
export function TaskFormModal({ open, task, ...rest }: TaskFormModalProps) {
  if (!open) return null;
  return <TaskFormModalInner key={task?.id ?? 'new'} open task={task} {...rest} />;
}

function TaskFormModalInner({ open, onClose, task, onSaved }: TaskFormModalProps) {
  const { users, accounts } = useMeta();
  const { user } = useSession();
  const toast = useToast();

  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [dueDate, setDueDate] = useState(task?.dueDate ?? '');
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'medium');
  const [assigneeId, setAssigneeId] = useState(task?.assigneeId ?? user?.id ?? '');
  const [contactId, setContactId] = useState(task?.contactId ?? '');
  const [accountId, setAccountId] = useState(task?.accountId ?? '');
  const [opportunityId, setOpportunityId] = useState(task?.opportunityId ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Reference data for the selects; setStates happen in async callbacks.
  useEffect(() => {
    listOpportunities()
      .then((r) => setOpportunities(r.items))
      .catch(() => setOpportunities([]));
    listContacts({ pageSize: 100 })
      .then((r) => setContacts(r.items))
      .catch(() => setContacts([]));
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    setSaving(true);
    setError('');
    const payload = {
      title: title.trim(),
      description: description.trim(),
      dueDate: dueDate || undefined,
      priority,
      assigneeId,
      contactId: contactId || undefined,
      accountId: accountId || undefined,
      opportunityId: opportunityId || undefined,
    };
    const req = task ? updateTask(task.id, payload) : createTask(payload);

    req
      .then(() => {
        toast.show(task ? 'Task updated' : 'Task created', 'success');
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
      title={task ? 'Edit task' : 'New task'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button form="task-form" type="submit" disabled={saving}>
            {saving ? 'Saving…' : task ? 'Save changes' : 'Create task'}
          </Button>
        </>
      }
    >
      <form id="task-form" onSubmit={submit} className="space-y-4">
        {error ? <ErrorBanner message={error} /> : null}
        <Field label="Title" htmlFor="task-title" required>
          <Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Description" htmlFor="task-desc">
          <Textarea
            id="task-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Due date" htmlFor="task-due">
            <Input
              id="task-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </Field>
          <Field label="Priority" htmlFor="task-priority">
            <Select
              id="task-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </Select>
          </Field>
          <Field label="Assignee" htmlFor="task-assignee">
            <Select
              id="task-assignee"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Account" htmlFor="task-account">
            <Select
              id="task-account"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="">None</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Contact" htmlFor="task-contact">
            <Select
              id="task-contact"
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
          <div className="sm:col-span-2">
            <Field label="Opportunity" htmlFor="task-opp">
              <Select
                id="task-opp"
                value={opportunityId}
                onChange={(e) => setOpportunityId(e.target.value)}
              >
                <option value="">None</option>
                {opportunities.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>
      </form>
    </Modal>
  );
}
