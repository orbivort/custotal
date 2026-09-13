import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select, Textarea } from '../../components/ui/Field';
import { ErrorBanner, LoadingBlock } from '../../components/ui/Feedback';
import { ArrowLeftIcon, PlusIcon, XIcon } from '../../components/icons';
import { useMeta } from '../meta/MetaContext';
import { createContact, getContact, updateContact } from './contactsApi';
import type { AccountLink } from '../../types/domain';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface LinkRow {
  accountId: string;
  primary: boolean;
  role: string;
}

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  jobTitle: string;
  company: string;
  address: string;
  status: 'active' | 'inactive';
  notes: string;
  links: LinkRow[];
}

const emptyForm: FormState = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  jobTitle: '',
  company: '',
  address: '',
  status: 'active',
  notes: '',
  links: [],
};

export default function ContactFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { accounts } = useMeta();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | undefined>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!id) return;
    getContact(id)
      .then((c) => {
        setForm({
          firstName: c.firstName,
          lastName: c.lastName,
          email: c.email ?? '',
          phone: c.phone ?? '',
          jobTitle: c.jobTitle ?? '',
          company: c.company ?? '',
          address: c.address ?? '',
          status: c.status,
          notes: c.notes ?? '',
          links: c.accountLinks.map((l) => ({
            accountId: l.accountId,
            primary: l.primary,
            role: l.role,
          })),
        });
        setUpdatedAt(c.updatedAt);
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : 'Failed to load contact');
      })
      .finally(() => setLoading(false));
  }, [id]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setLink(i: number, patch: Partial<LinkRow>) {
    setForm((f) => ({
      ...f,
      links: f.links.map((l, idx) => {
        if (idx !== i) return patch.primary ? { ...l, primary: false } : l;
        return { ...l, ...patch };
      }),
    }));
  }

  function addLink() {
    setForm((f) => ({
      ...f,
      links: [...f.links, { accountId: '', primary: f.links.length === 0, role: '' }],
    }));
  }

  function removeLink(i: number) {
    setForm((f) => ({ ...f, links: f.links.filter((_, idx) => idx !== i) }));
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.firstName.trim()) e.firstName = 'First name is required.';
    if (!form.lastName.trim()) e.lastName = 'Last name is required.';
    if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) e.email = 'Invalid email format.';
    if (!form.email.trim() && !form.phone.trim()) {
      e.phone = 'At least one of email or phone is required.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setSubmitError('');

    const accountLinks: AccountLink[] = form.links
      .filter((l) => l.accountId)
      .map((l) => ({ accountId: l.accountId, primary: l.primary, role: l.role }));

    const payload = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      jobTitle: form.jobTitle.trim(),
      company: form.company.trim(),
      address: form.address.trim(),
      status: form.status,
      notes: form.notes.trim(),
      accountLinks,
      ...(isEdit && updatedAt ? { updatedAt } : {}),
    };

    const req = isEdit && id ? updateContact(id, payload) : createContact(payload);

    req
      .then((c) => navigate(`/contacts/${c.id}`))
      .catch((err: unknown) => setSubmitError(err instanceof Error ? err.message : 'Save failed'))
      .finally(() => setSaving(false));
  }

  if (loading) return <LoadingBlock label="Loading contact…" />;
  if (loadError) return <ErrorBanner message={loadError} />;

  return (
    <div className="space-y-6 animate-fade-up">
      <Link
        to={isEdit ? `/contacts/${id}` : '/contacts'}
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeftIcon className="size-4" /> Back
      </Link>
      <PageHeader
        title={isEdit ? 'Edit contact' : 'New contact'}
        subtitle="Store the essentials for every person you work with."
      />

      <form onSubmit={submit} noValidate className="max-w-2xl space-y-6">
        {submitError ? <ErrorBanner message={submitError} /> : null}

        <section className="rounded-xl border hairline bg-white p-6">
          <h2 className="mb-4 font-display text-lg text-ink">Profile</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" htmlFor="firstName" required error={errors.firstName}>
              <Input
                id="firstName"
                value={form.firstName}
                onChange={(e) => set('firstName', e.target.value)}
              />
            </Field>
            <Field label="Last name" htmlFor="lastName" required error={errors.lastName}>
              <Input
                id="lastName"
                value={form.lastName}
                onChange={(e) => set('lastName', e.target.value)}
              />
            </Field>
            <Field label="Email" htmlFor="email" error={errors.email}>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
              />
            </Field>
            <Field label="Phone" htmlFor="phone" error={errors.phone}>
              <Input id="phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </Field>
            <Field label="Job title" htmlFor="jobTitle">
              <Input
                id="jobTitle"
                value={form.jobTitle}
                onChange={(e) => set('jobTitle', e.target.value)}
              />
            </Field>
            <Field label="Company" htmlFor="company">
              <Input
                id="company"
                value={form.company}
                onChange={(e) => set('company', e.target.value)}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Address" htmlFor="address">
                <Input
                  id="address"
                  value={form.address}
                  onChange={(e) => set('address', e.target.value)}
                />
              </Field>
            </div>
            <Field label="Status" htmlFor="status">
              <Select
                id="status"
                value={form.status}
                onChange={(e) => set('status', e.target.value as 'active' | 'inactive')}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </Field>
          </div>
          <div className="mt-4">
            <Field label="Notes" htmlFor="notes">
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
              />
            </Field>
          </div>
        </section>

        <section className="rounded-xl border hairline bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg text-ink">Linked accounts</h2>
            <Button type="button" variant="secondary" size="sm" onClick={addLink}>
              <PlusIcon className="size-4" /> Add account
            </Button>
          </div>
          {form.links.length === 0 ? (
            <p className="text-sm text-ink-faint">
              No accounts linked yet. A contact can belong to one or more accounts.
            </p>
          ) : (
            <div className="space-y-2">
              {form.links.map((l, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <Select
                    value={l.accountId}
                    onChange={(e) => setLink(i, { accountId: e.target.value })}
                    className="min-w-44 flex-1"
                    aria-label="Account"
                  >
                    <option value="">Select account…</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </Select>
                  <Input
                    value={l.role}
                    onChange={(e) => setLink(i, { role: e.target.value })}
                    placeholder="Role"
                    className="w-40"
                    aria-label="Role at account"
                  />
                  <label className="flex items-center gap-1.5 text-sm text-ink-muted">
                    <input
                      type="checkbox"
                      checked={l.primary}
                      onChange={(e) => setLink(i, { primary: e.target.checked })}
                      className="rounded border-ink/20 text-forest focus:ring-forest"
                    />
                    Primary
                  </label>
                  <button
                    type="button"
                    onClick={() => removeLink(i)}
                    className="rounded-md p-1.5 text-ink-faint transition-colors hover:text-danger cursor-pointer"
                    aria-label="Remove account link"
                  >
                    <XIcon className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create contact'}
          </Button>
        </div>
      </form>
    </div>
  );
}
