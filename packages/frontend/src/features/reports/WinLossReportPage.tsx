import { useState } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { ErrorBanner, LoadingBlock } from '../../components/ui/Feedback';
import { Input, Select } from '../../components/ui/Field';
import { toCsv, downloadCsv } from '../../lib/csv';
import { formatCurrency, formatPercent, valueLabel } from '../../lib/format';
import { useQuery } from '../../lib/hooks';
import { useMeta } from '../meta/MetaContext';
import { useSession } from '../auth/SessionContext';
import { fetchWinLossReport } from './reportsApi';
import { BarChart } from './BarChart';
import type { WinLossReportPayload } from '../../types/domain';

export default function WinLossReportPage() {
  const { users } = useMeta();
  const { user } = useSession();
  const [owner, setOwner] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const canViewAll =
    user?.role === 'manager' || user?.role === 'admin' || user?.role === 'readonly';

  const { data, loading, error } = useQuery<WinLossReportPayload>(
    () => fetchWinLossReport({ owner, from, to }),
    [owner, from, to],
  );

  function exportCsv() {
    if (!data) return;
    const headers = ['Metric', 'Value'];
    const rows = [
      ['Won deals', data.wonCount],
      ['Lost deals', data.lostCount],
      ['Win rate', `${data.winRate}%`],
      [valueLabel('Won value'), (data.wonValue / 100).toFixed(2)],
      [valueLabel('Lost value'), (data.lostValue / 100).toFixed(2)],
    ];
    const lossCsv = data.lossReasons.map((r) => [r.reason, r.count]);
    const csv =
      toCsv(headers, rows) + '\r\n\r\nLoss reasons\r\n' + toCsv(['Reason', 'Count'], lossCsv);
    downloadCsv('win-loss-report.csv', csv);
  }

  const summary = [
    { label: 'Won deals', value: String(data?.wonCount ?? 0) },
    { label: 'Lost deals', value: String(data?.lostCount ?? 0) },
    { label: 'Win rate', value: formatPercent(data?.winRate ?? 0), accent: true },
    { label: 'Won value', value: formatCurrency(data?.wonValue ?? 0) },
    { label: 'Lost value', value: formatCurrency(data?.lostValue ?? 0) },
  ];

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Win / Loss"
        subtitle="Closed outcomes and the reasons behind the losses."
        actions={
          <Button variant="secondary" onClick={exportCsv} disabled={!data}>
            Export CSV
          </Button>
        }
      />

      <nav className="flex gap-1 overflow-x-auto border-b hairline">
        <Link
          to="/reports/pipeline"
          className="whitespace-nowrap px-3 py-2 text-sm text-ink-muted hover:text-ink"
        >
          Pipeline by stage
        </Link>
        <Link
          to="/reports/winloss"
          className="whitespace-nowrap border-b-2 border-forest px-3 py-2 text-sm font-medium text-forest"
        >
          Win / Loss
        </Link>
      </nav>

      <div className="flex flex-wrap items-center gap-3">
        {canViewAll ? (
          <Select
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
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
        ) : null}
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="Close date from"
          />
          <span className="text-ink-faint">to</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-label="Close date to"
          />
        </div>
      </div>

      {error ? (
        <ErrorBanner message={error} />
      ) : loading ? (
        <LoadingBlock />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {summary.map((s) => (
              <div
                key={s.label}
                className={`rounded-xl border hairline bg-white p-4 ${s.accent ? 'border-forest/25 bg-forest/[0.04]' : ''}`}
              >
                <p className="text-11 font-semibold uppercase tracking-eyebrow text-ink-faint">
                  {s.label}
                </p>
                <p
                  className={`mt-1.5 font-display text-2xl font-semibold ${s.accent ? 'text-forest' : 'text-ink'}`}
                >
                  {s.value}
                </p>
              </div>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border hairline bg-white p-5">
              <h2 className="mb-3 font-display text-lg text-ink">Closed value</h2>
              {data ? (
                <BarChart
                  data={[
                    { label: 'Won', value: data.wonValue },
                    { label: 'Lost', value: data.lostValue },
                  ]}
                  formatValue={(n) => formatCurrency(n)}
                />
              ) : null}
            </div>

            <div className="rounded-xl border hairline bg-white p-5">
              <h2 className="mb-3 font-display text-lg text-ink">Loss reasons</h2>
              {!data || data.lossReasons.length === 0 ? (
                <p className="text-sm text-ink-faint">No losses recorded in this period.</p>
              ) : (
                <ul className="divide-y hairline">
                  {data.lossReasons.map((r) => (
                    <li key={r.reason} className="flex items-center justify-between py-2.5 text-sm">
                      <span className="text-ink">{r.reason}</span>
                      <span className="rounded-full bg-ink/5 px-2 py-0.5 text-12 text-ink-muted">
                        {r.count} {r.count === 1 ? 'deal' : 'deals'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
