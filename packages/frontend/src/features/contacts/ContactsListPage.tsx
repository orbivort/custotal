import { useDeferredValue, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '../../components/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorBanner, LoadingBlock } from '../../components/ui/Feedback';
import { Input, Select } from '../../components/ui/Field';
import { Pagination } from '../../components/ui/Pagination';
import { DownloadIcon, PlusIcon, SearchIcon } from '../../components/icons';
import { useToast } from '../../components/toast';
import { downloadCsv, toCsv } from '../../lib/csv';
import { formatDateTime } from '../../lib/format';
import { useQuery } from '../../lib/hooks';
import { useMeta } from '../meta/MetaContext';
import { listContacts } from './contactsApi';
import type { Contact, PaginatedResult } from '../../types/domain';

type SortKey = 'name' | 'updatedAt';
const PAGE_SIZE = 25;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export default function ContactsListPage() {
  const toast = useToast();
  const { accountName, users } = useMeta();
  const [q, setQ] = useState('');
  // React 19 debounce: the deferred value lags behind the input, so the fetch
  // effect below only re-runs once typing settles — no timer state needed.
  const debouncedQ = useDeferredValue(q);
  const [status, setStatus] = useState('');
  const [owner, setOwner] = useState('');
  const [letter, setLetter] = useState('');
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDesc, setSortDesc] = useState(false);

  // Sorting runs server-side so it covers the full result set, not just the page.
  const sort = useMemo(() => {
    if (sortKey === 'name') return sortDesc ? 'name_desc' : 'name';
    return sortDesc ? 'updated_desc' : 'updated';
  }, [sortKey, sortDesc]);

  // Any filter change restarts pagination at page 1. Resetting in the setter
  // (an event handler) instead of a state-syncing effect keeps the render
  // pipeline free of set-state-in-effect cycles.
  function setFilter(setter: (value: string) => void, value: string) {
    setter(value);
    setPage(1);
  }

  const { data, loading, error } = useQuery<PaginatedResult<Contact>>(
    () =>
      listContacts({
        q: debouncedQ,
        status,
        owner,
        letter: letter || undefined,
        sort,
        page,
        pageSize: PAGE_SIZE,
      }),
    [debouncedQ, status, owner, letter, sort, page],
  );

  const items = data?.items ?? [];

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDesc((v) => !v);
    else {
      setSortKey(key);
      setSortDesc(false);
    }
  }

  async function exportCsv() {
    try {
      const res = await listContacts({ q: debouncedQ, status, owner, pageSize: 10000 });
      const headers = [
        'First name',
        'Last name',
        'Email',
        'Phone',
        'Job title',
        'Company',
        'Status',
        'Last modified',
      ];
      const rows = res.items.map((c) => [
        c.firstName,
        c.lastName,
        c.email ?? '',
        c.phone ?? '',
        c.jobTitle ?? '',
        c.company ?? '',
        c.status,
        c.updatedAt,
      ]);
      downloadCsv('contacts.csv', toCsv(headers, rows));
      toast.show(`Exported ${res.items.length} contacts`, 'success');
    } catch (err: unknown) {
      toast.show(err instanceof Error ? err.message : 'Export failed', 'error');
    }
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Contacts"
        subtitle={`${data?.total ?? 0} people across your accounts`}
        actions={
          <>
            <Button variant="secondary" onClick={() => void exportCsv()}>
              <DownloadIcon className="size-4" /> Export
            </Button>
            <Link to="/contacts/new">
              <Button>
                <PlusIcon className="size-4" /> New contact
              </Button>
            </Link>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:max-w-xs">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input
            value={q}
            onChange={(e) => setFilter(setQ, e.target.value)}
            placeholder="Search by name, email…"
            className="pl-9"
            aria-label="Search contacts"
          />
        </div>
        <Select
          value={status}
          onChange={(e) => setFilter(setStatus, e.target.value)}
          className="w-full sm:w-40"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </Select>
        <Select
          value={owner}
          onChange={(e) => setFilter(setOwner, e.target.value)}
          className="w-full sm:w-44"
          aria-label="Filter by owner"
        >
          <option value="">All owners</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
        <Select
          value={letter}
          onChange={(e) => setFilter(setLetter, e.target.value)}
          className="w-full sm:w-24"
          aria-label="Filter by first letter of last name"
        >
          <option value="">A–Z</option>
          {ALPHABET.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </Select>
      </div>

      {error ? (
        <ErrorBanner message={error} />
      ) : loading ? (
        <LoadingBlock />
      ) : items.length === 0 ? (
        <EmptyState
          title="No contacts found"
          description="Try adjusting your filters, or add a new contact."
          action={
            <Link to="/contacts/new">
              <Button variant="secondary">New contact</Button>
            </Link>
          }
        />
      ) : (
        <>
          {/* Scrolls rather than clips: below `md` the table still carries four
              columns, and a clipped one is unreachable. The floor keeps the
              columns legible rather than letting them crush to a few characters
              before the scroll engages. */}
          <div className="overflow-x-auto rounded-xl border hairline bg-white">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead>
                <tr className="border-b hairline text-12 uppercase tracking-label text-ink-faint">
                  <th
                    className="px-5 py-3 font-semibold"
                    aria-sort={
                      sortKey === 'name' ? (sortDesc ? 'descending' : 'ascending') : 'none'
                    }
                  >
                    <button
                      onClick={() => toggleSort('name')}
                      // Negative margin + matching padding: the hit area grows to
                      // a comfortable 28px without moving the glyph.
                      className="-mx-1 -my-1 inline-flex items-center gap-1 px-1 py-1 hover:text-ink cursor-pointer"
                    >
                      Name {sortKey === 'name' ? (sortDesc ? '↓' : '↑') : ''}
                    </button>
                  </th>
                  <th className="px-5 py-3 font-semibold">Company / Account</th>
                  <th className="hidden px-5 py-3 font-semibold md:table-cell">Email</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th
                    className="hidden px-5 py-3 font-semibold lg:table-cell"
                    aria-sort={
                      sortKey === 'updatedAt' ? (sortDesc ? 'descending' : 'ascending') : 'none'
                    }
                  >
                    <button
                      onClick={() => toggleSort('updatedAt')}
                      // Negative margin + matching padding: the hit area grows to
                      // a comfortable 28px without moving the glyph.
                      className="-mx-1 -my-1 inline-flex items-center gap-1 px-1 py-1 hover:text-ink cursor-pointer"
                    >
                      Modified {sortKey === 'updatedAt' ? (sortDesc ? '↓' : '↑') : ''}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y hairline">
                {items.map((c) => {
                  const primaryAccount =
                    c.accountLinks.find((l) => l.primary)?.accountId ??
                    c.accountLinks[0]?.accountId;
                  return (
                    <tr key={c.id} className="transition-colors hover:bg-fill/50">
                      <td className="px-5 py-3.5">
                        <Link
                          to={`/contacts/${c.id}`}
                          className="font-medium text-ink hover:text-forest"
                        >
                          {c.firstName} {c.lastName}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 text-ink-muted">
                        {c.company ?? (primaryAccount ? accountName(primaryAccount) : '—')}
                      </td>
                      <td className="hidden px-5 py-3.5 text-ink-muted md:table-cell">
                        {c.email ?? '—'}
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge tone={c.status === 'active' ? 'success' : 'neutral'}>
                          {c.status === 'active' ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="hidden px-5 py-3.5 text-ink-faint lg:table-cell">
                        {formatDateTime(c.updatedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination
            page={data?.page ?? 1}
            pageSize={PAGE_SIZE}
            total={data?.total ?? 0}
            onChange={setPage}
          />
        </>
      )}
    </div>
  );
}
