import { Link } from 'react-router';
import { PageHeader } from '../../components/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { LoadingBlock } from '../../components/ui/Feedback';
import { ChevronRightIcon, ClockIcon, ColumnsIcon } from '../../components/icons';
import { formatCurrency, formatDate, greeting, isOverdue, todayISO } from '../../lib/format';
import { useQuery } from '../../lib/hooks';
import { useSession } from '../auth/SessionContext';
import { useMeta } from '../meta/MetaContext';
import { listOpportunities } from '../pipeline/opportunitiesApi';
import { getTaskSummary, listTasks } from '../tasks/tasksApi';
import type { ListResult, Opportunity, Task, TaskSummary } from '../../types/domain';

export default function DashboardPage() {
  const { user } = useSession();
  const { stageById, accountName } = useMeta();
  const { data: oppData, loading: oppLoading } = useQuery<ListResult<Opportunity>>(() =>
    listOpportunities(),
  );
  const { data: taskData } = useQuery<ListResult<Task>>(() => listTasks({ scope: 'mine' }));
  const { data: summary } = useQuery<TaskSummary>(getTaskSummary);

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const opps = oppData?.items ?? [];
  const open = opps.filter((o) => stageById(o.stageId)?.classification === 'open');
  const openValue = open.reduce((s, o) => s + o.valueMinor, 0);
  const closingThisMonth = open.filter((o) => o.expectedCloseDate.startsWith(monthKey)).length;
  const wonThisMonth = opps
    .filter(
      (o) =>
        stageById(o.stageId)?.classification === 'won' && o.expectedCloseDate.startsWith(monthKey),
    )
    .reduce((s, o) => s + o.valueMinor, 0);

  const followUps = (taskData?.items ?? [])
    .filter((t) => t.status === 'open')
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
    .slice(0, 5);

  const topDeals = [...open].sort((a, b) => b.valueMinor - a.valueMinor).slice(0, 5);

  const kpis = [
    {
      label: 'Open pipeline',
      value: formatCurrency(openValue),
      sub: `${open.length} open deals`,
      accent: true,
    },
    {
      label: 'Closing this month',
      value: String(closingThisMonth),
      sub: 'deals expected to close',
    },
    { label: 'Tasks due today', value: String(summary?.dueToday ?? 0), sub: 'open follow-ups' },
    { label: 'Won this month', value: formatCurrency(wonThisMonth), sub: 'closed revenue' },
  ];

  const firstName = user?.name.split(' ')[0] ?? 'there';

  return (
    <div className="space-y-8 animate-fade-up">
      <PageHeader
        title={`${greeting()}, ${firstName}.`}
        subtitle={`Here's your pipeline at a glance for ${formatDate(todayISO())}.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k, i) => (
          <div
            key={k.label}
            className={`rounded-xl border hairline bg-white p-5 animate-fade-up ${
              k.accent ? 'border-forest/25 bg-forest/[0.04]' : ''
            }`}
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <p className="text-11 font-semibold uppercase tracking-eyebrow text-ink-faint">
              {k.label}
            </p>
            <p
              className={`mt-2 font-display text-[30px] font-semibold leading-none tracking-tight ${k.accent ? 'text-forest' : 'text-ink'}`}
            >
              {k.value}
            </p>
            <p className="mt-2 text-13 text-ink-muted">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-xl border hairline bg-white lg:col-span-2">
          <div className="flex items-center justify-between border-b hairline px-5 py-4">
            <h2 className="flex items-center gap-2 font-display text-lg text-ink">
              <ColumnsIcon className="size-5 text-forest" /> Open pipeline
            </h2>
            <Link
              to="/pipeline"
              className="flex items-center gap-1 text-sm text-forest hover:underline"
            >
              View board <ChevronRightIcon className="size-4" />
            </Link>
          </div>
          {oppLoading ? (
            <LoadingBlock />
          ) : topDeals.length === 0 ? (
            <p className="px-5 py-8 text-sm text-ink-faint">No open deals in your pipeline.</p>
          ) : (
            <ul className="divide-y hairline">
              {topDeals.map((o) => (
                <li key={o.id}>
                  <Link
                    to={`/opportunities/${o.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-fill/50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-15 font-medium text-ink">{o.name}</p>
                      <p className="truncate text-13 text-ink-faint">{accountName(o.accountId)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-4">
                      {/* A long stage name would otherwise squeeze the deal name
                          to nothing on a phone; the stage is visible on the row
                          itself once there is room for it. */}
                      <Badge tone="forest" className="hidden shrink-0 sm:inline-flex">
                        {stageById(o.stageId)?.name}
                      </Badge>
                      <span className="w-24 text-right text-15 font-medium text-ink">
                        {formatCurrency(o.valueMinor, o.currency)}
                      </span>
                      <span className="hidden w-24 text-right text-13 text-ink-faint sm:block">
                        {formatDate(o.expectedCloseDate)}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border hairline bg-white">
          <div className="flex items-center justify-between border-b hairline px-5 py-4">
            <h2 className="flex items-center gap-2 font-display text-lg text-ink">
              <ClockIcon className="size-5 text-forest" /> Follow-ups
            </h2>
            <Link
              to="/tasks"
              className="flex items-center gap-1 text-sm text-forest hover:underline"
            >
              All tasks <ChevronRightIcon className="size-4" />
            </Link>
          </div>
          {followUps.length === 0 ? (
            <p className="px-5 py-8 text-sm text-ink-faint">You're all caught up.</p>
          ) : (
            <ul className="divide-y hairline">
              {followUps.map((t) => {
                const overdue = isOverdue(t.dueDate);
                return (
                  <li key={t.id}>
                    <Link
                      to="/tasks"
                      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-fill/50"
                    >
                      <span
                        className={`size-2 shrink-0 rounded-full ${overdue ? 'bg-danger' : 'bg-warn'}`}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">{t.title}</span>
                      <span
                        className={`shrink-0 text-13 ${overdue ? 'font-medium text-danger' : 'text-ink-faint'}`}
                      >
                        {t.dueDate ? formatDate(t.dueDate) : '—'}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
