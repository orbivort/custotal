import { useDeferredValue, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorBanner, LoadingBlock } from '../../components/ui/Feedback';
import { Input, Select } from '../../components/ui/Field';
import { Pagination } from '../../components/ui/Pagination';
import { DownloadIcon, PlusIcon, SearchIcon } from '../../components/icons';
import { useToast } from '../../components/toast';
import { downloadCsv, toCsv } from '../../lib/csv';
import { useQuery } from '../../lib/hooks';
import { useMeta } from '../meta/MetaContext';
import { listAccounts } from './accountsApi';
import type { Account, PaginatedResult } from '../../types/domain';

const PAGE_SIZE = 25;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export default function AccountsListPage() {
  const toast = useToast();
  const [q, setQ] = useState('');
  // React 19 debounce: the deferred value lags behind the input, so the query
  // below only re-runs once typing settles — no timer state needed.
  const debouncedQ = useDeferredValue(q);
  const [owner, setOwner] = useState('');
  const [letter, setLetter] = useState('');
  const [sortKey, setSortKey] = useState<'name' | 'updatedAt'>('name');
  const [sortDesc, setSortDesc] = useState(false);
  const [page, setPage] = useState(1);
  const { userName, users } = useMeta();

  // Sorting runs server-side so it covers the full result set, not just the page.
  const sort = useMemo(() => {
    if (sortKey === 'name') return sortDesc ? 'name_desc' : 'name';
    return sortDesc ? 'updated_desc' : 'updated';
  }, [sortKey, sortDesc]);

  // Any filter change restarts pagination at page 1; done in the setters
  // (event handlers) rather than a state-syncing effect.
  function setFilter(setter: (value: string) => void, value: string) {
    setter(value);
    setPage(1);
  }

  const { data, loading, error } = useQuery<PaginatedResult<Account>>(
    () =>
      listAccounts({
        q: debouncedQ,
        owner,
        letter: letter || undefined,
        sort,
        page,
        pageSize: PAGE_SIZE,
      }),
    [debouncedQ, owner, letter, sort, page],
  );

  const items = data?.items ?? [];

  async function exportCsv() {
    try {
      const res = await listAccounts({
        q: debouncedQ,
        owner,
        letter: letter || undefined,
        sort,
        pageSize: 10000,
      });
      const headers = [
        'Account name',
        'Industry',
        'Website',
        'Phone',
        'Billing address',
        'Owner',
        'Last modified',
      ];
      const rows = res.items.map((a) => [
        a.name,
        a.industry ?? '',
        a.website ?? '',
        a.phone ?? '',
        a.billingAddress ?? '',
        userName(a.ownerId),
        a.updatedAt,
      ]);
      downloadCsv('accounts.csv', toCsv(headers, rows));
      toast.show(`Exported ${res.items.length} accounts`, 'success');
    } catch (err: unknown) {
      toast.show(err instanceof Error ? err.message : 'Export failed', 'error');
    }
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Accounts"
        subtitle={`${data?.total ?? 0} organizations in your book of business`}
        actions={
          <>
            <Button variant="secondary" onClick={() => void exportCsv()}>
              <DownloadIcon className="size-4" /> Export
            </Button>
            <Link to="/accounts/new">
              <Button>
                <PlusIcon className="size-4" /> New account
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
            placeholder="Search accounts…"
            className="pl-9"
            aria-label="Search accounts"
          />
        </div>
        <Select
          value={owner}
          onChange={(e) => setFilter(setOwner, e.target.value)}
          className="w-full sm:w-48"
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
          aria-label="Filter by first letter of account name"
        >
          <option value="">A–Z</option>
          {ALPHABET.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </Select>
        <Select
          value={`${sortKey}:${sortDesc ? 'desc' : 'asc'}`}
          onChange={(e) => {
            const [key, dir] = e.target.value.split(':');
            setSortKey(key as 'name' | 'updatedAt');
            setSortDesc(dir === 'desc');
          }}
          className="w-full sm:w-44"
          aria-label="Sort accounts"
        >
          <option value="name:asc">Sort: Name A–Z</option>
          <option value="name:desc">Sort: Name Z–A</option>
          <option value="updatedAt:desc">Sort: Recently modified</option>
          <option value="updatedAt:asc">Sort: Oldest modified</option>
        </Select>
      </div>

      {error ? (
        <ErrorBanner message={error} />
      ) : loading ? (
        <LoadingBlock />
      ) : items.length === 0 ? (
        <EmptyState
          title="No accounts found"
          description="Try a different search, or create a new account."
          action={
            <Link to="/accounts/new">
              <Button variant="secondary">New account</Button>
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((a) => (
              <Link
                key={a.id}
                to={`/accounts/${a.id}`}
                className="group rounded-xl border hairline bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-forest/30 hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <h3 className="font-display text-lg font-semibold text-ink group-hover:text-forest">
                    {a.name}
                  </h3>
                </div>
                <p className="mt-1 text-13 text-ink-faint">{a.industry ?? 'No industry'}</p>
                <div className="mt-4 flex items-center justify-between border-t hairline pt-3 text-13 text-ink-muted">
                  <span>Owner: {userName(a.ownerId)}</span>
                  {a.website ? <span className="text-ink-faint">{a.website}</span> : null}
                </div>
              </Link>
            ))}
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
