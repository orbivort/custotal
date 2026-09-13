import { useState } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { ErrorBanner, LoadingBlock } from '../../components/ui/Feedback';
import { Input, Select } from '../../components/ui/Field';
import { toCsv, downloadCsv } from '../../lib/csv';
import { formatCurrency, valueLabel } from '../../lib/format';
import { useQuery } from '../../lib/hooks';
import { useMeta } from '../meta/MetaContext';
import { useSession } from '../auth/SessionContext';
import { fetchPipelineReport } from './reportsApi';
import { BarChart } from './BarChart';
import type { PipelineReportPayload } from '../../types/domain';

export default function PipelineReportPage() {
  const { users } = useMeta();
  const { user } = useSession();
  const [owner, setOwner] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const canViewAll =
    user?.role === 'manager' || user?.role === 'admin' || user?.role === 'readonly';

  const { data, loading, error } = useQuery<PipelineReportPayload>(
    () => fetchPipelineReport({ owner, from, to }),
    [owner, from, to],
  );
  const rows = data?.rows ?? [];

  function exportCsv() {
    const headers = ['Stage', 'Count', valueLabel('Total value'), valueLabel('Weighted value')];
    const csvRows = rows.map((r) => [
      r.stageName,
      r.count,
      (r.totalValue / 100).toFixed(2),
      (r.weightedValue / 100).toFixed(2),
    ]);
    downloadCsv('pipeline-by-stage.csv', toCsv(headers, csvRows));
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Pipeline by stage"
        subtitle="Count, total value, and weighted value per stage."
        actions={
          <Button variant="secondary" onClick={exportCsv} disabled={rows.length === 0}>
            Export CSV
          </Button>
        }
      />

      {/* Matches AdminNav: the tab strip must scroll rather than wrap or clip
          once more reports are added. */}
      <nav className="flex gap-1 overflow-x-auto border-b hairline">
        <Link
          to="/reports/pipeline"
          className="whitespace-nowrap border-b-2 border-forest px-3 py-2 text-sm font-medium text-forest"
        >
          Pipeline by stage
        </Link>
        <Link
          to="/reports/winloss"
          className="whitespace-nowrap px-3 py-2 text-sm text-ink-muted hover:text-ink"
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
        <div className="flex w-full items-center gap-2 sm:w-auto">
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
          <div className="rounded-xl border hairline bg-white p-5">
            <BarChart
              data={rows.map((r) => ({ label: r.stageName, value: r.totalValue }))}
              formatValue={(n) => formatCurrency(n)}
            />
          </div>

          <div className="overflow-x-auto rounded-xl border hairline bg-white">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead>
                <tr className="border-b hairline text-12 uppercase tracking-label text-ink-faint">
                  <th className="px-5 py-3 font-semibold">Stage</th>
                  <th className="px-5 py-3 text-right font-semibold">Deals</th>
                  <th className="px-5 py-3 text-right font-semibold">Total value</th>
                  <th className="px-5 py-3 text-right font-semibold">Weighted value</th>
                </tr>
              </thead>
              <tbody className="divide-y hairline">
                {rows.map((r) => (
                  <tr key={r.stageId} className="hover:bg-fill/50">
                    <td className="px-5 py-3 font-medium text-ink">{r.stageName}</td>
                    <td className="px-5 py-3 text-right text-ink-muted">{r.count}</td>
                    <td className="px-5 py-3 text-right font-medium text-ink">
                      {formatCurrency(r.totalValue)}
                    </td>
                    <td className="px-5 py-3 text-right text-ink-muted">
                      {formatCurrency(r.weightedValue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
