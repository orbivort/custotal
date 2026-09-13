import { useDeferredValue, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useMeta } from '../features/meta/MetaContext';
import { searchAll } from '../features/search/searchApi';
import type { GlobalSearchResults } from '../types/domain';
import { ChevronRightIcon, SearchIcon } from './icons';

export function SearchBox() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<GlobalSearchResults | null>(null);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const boxRef = useRef<HTMLDivElement>(null);
  const { accountName } = useMeta();

  // React 19 debounce: re-runs once typing settles instead of on a timer.
  const deferredQ = useDeferredValue(q);

  useEffect(() => {
    const term = deferredQ.trim();
    // Results from a previous long-enough term stay in state but are never
    // rendered while the live query is short (the dropdown is gated on
    // `q.trim().length >= 2` in the JSX below).
    if (term.length < 2) return;
    // Abort anything in flight when the term changes so a slow stale response
    // can never overwrite a newer one (out-of-order responses).
    const controller = new AbortController();
    searchAll(term)
      .then((r) => {
        if (!controller.signal.aborted) setResults(r);
      })
      .catch(() => {
        if (!controller.signal.aborted) setResults(null);
      });
    return () => controller.abort();
  }, [deferredQ]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function go(path: string) {
    setOpen(false);
    setQ('');
    setResults(null);
    navigate(path);
  }

  const empty =
    results &&
    results.contacts.length +
      results.accounts.length +
      results.opportunities.length +
      results.tasks.length +
      results.interactions.length ===
      0;

  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search customers, deals, tasks…"
          aria-label="Global search"
          role="combobox"
          aria-expanded={open && q.trim().length >= 2}
          aria-controls="global-search-results"
          aria-autocomplete="list"
          className="w-full rounded-full border border-ink/10 bg-white/80 py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-forest/25"
        />
      </div>

      {open && q.trim().length >= 2 ? (
        <div
          id="global-search-results"
          aria-label="Search results"
          className="absolute top-full z-30 mt-2 w-full overflow-hidden rounded-xl border border-ink/10 bg-white shadow-xl"
        >
          <div className="max-h-[26rem] overflow-auto p-1.5">
            {results && !empty ? (
              <>
                <Group label="Contacts">
                  {results.contacts.map((c) => (
                    <Row key={c.id} onClick={() => go(`/contacts/${c.id}`)}>
                      {c.firstName} {c.lastName}
                      <span className="text-ink-faint">· {c.jobTitle ?? 'Contact'}</span>
                    </Row>
                  ))}
                </Group>
                <Group label="Accounts">
                  {results.accounts.map((a) => (
                    <Row key={a.id} onClick={() => go(`/accounts/${a.id}`)}>
                      {a.name}
                    </Row>
                  ))}
                </Group>
                <Group label="Deals">
                  {results.opportunities.map((o) => (
                    <Row key={o.id} onClick={() => go(`/opportunities/${o.id}`)}>
                      {o.name}
                      <span className="text-ink-faint">· {accountName(o.accountId)}</span>
                    </Row>
                  ))}
                </Group>
                <Group label="Tasks">
                  {results.tasks.map((t) => (
                    <Row key={t.id} onClick={() => go('/tasks')}>
                      {t.title}
                    </Row>
                  ))}
                </Group>
                <Group label="Interactions">
                  {results.interactions.map((i) => (
                    <Row key={i.id} onClick={() => go(`/contacts/${i.contactId}`)}>
                      <span className="line-clamp-1">{i.summary}</span>
                    </Row>
                  ))}
                </Group>
              </>
            ) : results && empty ? (
              <div className="px-4 py-3 text-sm text-ink-faint">No results for “{q}”.</div>
            ) : (
              <div className="px-4 py-3 text-sm text-ink-faint">Searching…</div>
            )}
          </div>
          {results && !empty ? (
            <button
              onClick={() => go(`/search?q=${encodeURIComponent(q.trim())}`)}
              className="flex w-full items-center justify-between gap-2 border-t hairline bg-cream/50 px-4 py-2.5 text-left text-sm font-medium text-forest transition-colors hover:bg-forest/5 cursor-pointer"
            >
              <span className="truncate">View all results for “{q.trim()}”</span>
              <ChevronRightIcon className="size-4 shrink-0" />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="px-3 pb-1 pt-2 text-11 font-semibold uppercase tracking-eyebrow text-ink-faint">
        {label}
      </div>
      {children}
    </div>
  );
}

function Row({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm text-ink hover:bg-fill cursor-pointer"
    >
      <span className="truncate">{children}</span>
      <ChevronRightIcon className="size-3.5 shrink-0 text-ink-faint" />
    </button>
  );
}
