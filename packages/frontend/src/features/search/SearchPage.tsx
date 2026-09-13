import { type ComponentType } from 'react';
import { Link, useSearchParams } from 'react-router';
import { PageHeader } from '../../components/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { EmptyState, ErrorBanner, LoadingBlock } from '../../components/ui/Feedback';
import {
  BuildingIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  ColumnsIcon,
  SearchIcon,
  UsersIcon,
} from '../../components/icons';
import { useQuery } from '../../lib/hooks';
import { useMeta } from '../meta/MetaContext';
import { searchAll } from './searchApi';
import type { GlobalSearchResults } from '../../types/domain';

interface ResultRow {
  id: string;
  title: string;
  line: string;
  to: string;
}

interface ResultSection {
  key: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  count: number;
  rows: ResultRow[];
}

export default function SearchPage() {
  const [params] = useSearchParams();
  const term = (params.get('q') ?? '').trim();
  const { accountName, stageById } = useMeta();

  const { data, loading, error } = useQuery<GlobalSearchResults | null>(
    () => (term ? searchAll(term, true) : Promise.resolve(null)),
    [term],
  );

  if (term.length < 2) {
    return (
      <div className="space-y-6 animate-fade-up">
        <PageHeader
          title="Search"
          subtitle="Find contacts, accounts, deals, tasks, and interaction notes."
        />
        <EmptyState
          title="Type to search"
          description="Use the search box in the header, or open this page with ?q= to see grouped results."
        />
      </div>
    );
  }

  const sections: ResultSection[] = [];
  if (data) {
    sections.push({
      key: 'contacts',
      label: 'Contacts',
      icon: UsersIcon,
      count: data.counts.contacts,
      rows: data.contacts.map((c) => ({
        id: c.id,
        title: `${c.firstName} ${c.lastName}`,
        line: `${c.jobTitle ?? 'Contact'} · ${c.email ?? c.phone ?? 'no contact info'}`,
        to: `/contacts/${c.id}`,
      })),
    });
    sections.push({
      key: 'accounts',
      label: 'Accounts',
      icon: BuildingIcon,
      count: data.counts.accounts,
      rows: data.accounts.map((a) => ({
        id: a.id,
        title: a.name,
        line: a.industry ?? 'No industry',
        to: `/accounts/${a.id}`,
      })),
    });
    sections.push({
      key: 'deals',
      label: 'Deals',
      icon: ColumnsIcon,
      count: data.counts.opportunities,
      rows: data.opportunities.map((o) => ({
        id: o.id,
        title: o.name,
        line: `${accountName(o.accountId)} · ${stageById(o.stageId)?.name ?? 'Deal'}`,
        to: `/opportunities/${o.id}`,
      })),
    });
    sections.push({
      key: 'tasks',
      label: 'Tasks',
      icon: CheckCircleIcon,
      count: data.counts.tasks,
      rows: data.tasks.map((t) => ({
        id: t.id,
        title: t.title,
        line: t.dueDate ? `Due ${t.dueDate}` : 'Follow-up',
        to: '/tasks',
      })),
    });
    sections.push({
      key: 'interactions',
      label: 'Interactions',
      icon: ClockIcon,
      count: data.counts.interactions,
      rows: data.interactions.map((i) => ({
        id: i.id,
        title: `${i.type}${i.direction ? ` · ${i.direction}` : ''}`,
        line: i.summary.length > 140 ? `${i.summary.slice(0, 140)}…` : i.summary,
        to: `/contacts/${i.contactId}`,
      })),
    });
  }

  const resultCount = data
    ? data.counts.contacts +
      data.counts.accounts +
      data.counts.opportunities +
      data.counts.tasks +
      data.counts.interactions
    : 0;

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title={`Results for “${term}”`}
        subtitle={
          data
            ? `${resultCount} match${resultCount === 1 ? '' : 'es'} across the workspace`
            : 'Searching…'
        }
      />

      {error ? (
        <ErrorBanner message={error} />
      ) : loading || !data ? (
        <LoadingBlock label="Searching…" />
      ) : resultCount === 0 ? (
        <EmptyState
          title="No results found"
          description={`Nothing matched “${term}”. Try a name, account, email, or a phrase from an interaction note.`}
        />
      ) : (
        <div className="space-y-8">
          {sections
            .filter((section) => section.count > 0)
            .map((section) => {
              const Icon = section.icon;
              return (
                <section key={section.key}>
                  <div className="mb-2 flex items-center gap-2">
                    <Icon className="size-4 text-forest" />
                    <h2 className="font-display text-lg text-ink">{section.label}</h2>
                    <Badge tone="neutral">{section.count}</Badge>
                  </div>
                  <div className="overflow-hidden rounded-xl border hairline bg-white">
                    <ul className="divide-y hairline">
                      {section.rows.map((row) => (
                        <li key={row.id}>
                          <Link
                            to={row.to}
                            className="group flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-fill/50"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-15 font-medium text-ink group-hover:text-forest">
                                {row.title}
                              </span>
                              <span className="block truncate text-13 text-ink-faint">
                                {row.line}
                              </span>
                            </span>
                            <ChevronRightIcon className="size-4 shrink-0 text-ink-faint" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>
              );
            })}
        </div>
      )}

      <p className="flex items-center gap-2 text-13 text-ink-faint">
        <SearchIcon className="size-3.5" />
        Results respect your role&apos;s record-visibility rules.
      </p>
    </div>
  );
}
