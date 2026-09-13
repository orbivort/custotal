import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select, Textarea } from '../../components/ui/Field';
import { ErrorBanner, LoadingBlock } from '../../components/ui/Feedback';
import { ArrowLeftIcon } from '../../components/icons';
import { useMeta } from '../meta/MetaContext';
import { useSession } from '../auth/SessionContext';
import { createAccount, getAccount, updateAccount } from './accountsApi';

interface FormState {
  name: string;
  industry: string;
  website: string;
  phone: string;
  billingAddress: string;
  ownerId: string;
  notes: string;
}

export default function AccountFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { users, refresh } = useMeta();
  const { user } = useSession();
  const [form, setForm] = useState<FormState>({
    name: '',
    industry: '',
    website: '',
    phone: '',
    billingAddress: '',
    ownerId: user?.id ?? '',
    notes: '',
  });
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | undefined>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!id) return;
    getAccount(id)
      .then(({ account }) => {
        setForm({
          name: account.name,
          industry: account.industry ?? '',
          website: account.website ?? '',
          phone: account.phone ?? '',
          billingAddress: account.billingAddress ?? '',
          ownerId: account.ownerId,
          notes: account.notes ?? '',
        });
        setUpdatedAt(account.updatedAt);
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : 'Failed to load account');
      })
      .finally(() => setLoading(false));
  }, [id]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function submit(ev: FormEvent) {
    ev.preventDefault();
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Account name is required.';
    setErrors(e);
    if (Object.keys(e).length) return;

    setSaving(true);
    setSubmitError('');
    const payload = {
      name: form.name.trim(),
      industry: form.industry.trim(),
      website: form.website.trim(),
      phone: form.phone.trim(),
      billingAddress: form.billingAddress.trim(),
      ownerId: form.ownerId,
      notes: form.notes.trim(),
      ...(isEdit && updatedAt ? { updatedAt } : {}),
    };

    const req = isEdit && id ? updateAccount(id, payload) : createAccount(payload);

    req
      .then((a) => {
        void refresh();
        navigate(`/accounts/${a.id}`);
      })
      .catch((err: unknown) => setSubmitError(err instanceof Error ? err.message : 'Save failed'))
      .finally(() => setSaving(false));
  }

  if (loading) return <LoadingBlock label="Loading account…" />;
  if (loadError) return <ErrorBanner message={loadError} />;

  return (
    <div className="space-y-6 animate-fade-up">
      <Link
        to={isEdit ? `/accounts/${id}` : '/accounts'}
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeftIcon className="size-4" /> Back
      </Link>
      <PageHeader
        title={isEdit ? 'Edit account' : 'New account'}
        subtitle="Organizations are the anchor for contacts and deals."
      />

      <form onSubmit={submit} className="max-w-2xl space-y-6">
        {submitError ? <ErrorBanner message={submitError} /> : null}
        <section className="rounded-xl border hairline bg-white p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Account name" htmlFor="name" required error={errors.name}>
                <Input id="name" value={form.name} onChange={(e) => set('name', e.target.value)} />
              </Field>
            </div>
            <Field label="Industry" htmlFor="industry">
              <Input
                id="industry"
                value={form.industry}
                onChange={(e) => set('industry', e.target.value)}
              />
            </Field>
            <Field label="Website" htmlFor="website">
              <Input
                id="website"
                value={form.website}
                onChange={(e) => set('website', e.target.value)}
              />
            </Field>
            <Field label="Phone" htmlFor="phone">
              <Input id="phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </Field>
            <Field label="Owner" htmlFor="ownerId">
              <Select
                id="ownerId"
                value={form.ownerId}
                onChange={(e) => set('ownerId', e.target.value)}
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Billing address" htmlFor="billingAddress">
                <Input
                  id="billingAddress"
                  value={form.billingAddress}
                  onChange={(e) => set('billingAddress', e.target.value)}
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Notes" htmlFor="notes">
                <Textarea
                  id="notes"
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                />
              </Field>
            </div>
          </div>
        </section>

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create account'}
          </Button>
        </div>
      </form>
    </div>
  );
}
