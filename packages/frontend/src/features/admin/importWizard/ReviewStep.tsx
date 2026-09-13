import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { ErrorBanner, LoadingBlock } from '../../../components/ui/Feedback';
import { AlertIcon, CheckCircleIcon, ClockIcon } from '../../../components/icons';
import { useQuery } from '../../../lib/hooks';
import { importDryRun } from './importApi';
import type {
  DuplicatePolicy,
  ImportDryRunResult,
  ImportDryRunRow,
  ImportEntity,
} from '../../../types/domain';
import type { ImportFile } from '../ImportWizardPage';

function summaryLabel(entity: ImportEntity, data: Record<string, string>): string {
  if (entity === 'contact') {
    const name = [data.firstName, data.lastName].filter(Boolean).join(' ');
    return name || data.email || 'Unnamed row';
  }
  return data.name || data.website || 'Unnamed account';
}

function rowBadge(row: ImportDryRunRow) {
  if (!row.valid) {
    return (
      <Badge tone="danger">
        <AlertIcon className="size-3" /> Invalid
      </Badge>
    );
  }
  if (row.duplicate) {
    return (
      <Badge tone="warn">
        <ClockIcon className="size-3" /> Existing
      </Badge>
    );
  }
  return (
    <Badge tone="success">
      <CheckCircleIcon className="size-3" /> Ready
    </Badge>
  );
}

export function ReviewStep({
  entity,
  file,
  records,
  duplicate,
  onDuplicateChange,
  onBack,
  onCommit,
}: {
  entity: ImportEntity;
  file: ImportFile;
  records: Record<string, string>[];
  duplicate: DuplicatePolicy;
  onDuplicateChange: (policy: DuplicatePolicy) => void;
  onBack: () => void;
  onCommit: () => void;
}) {
  // Dry-run the mapped rows; useQuery owns the loading/error/race handling
  // (superseded dry-runs are aborted when the mapping changes).
  const {
    data: result,
    loading,
    error,
    errorIsFallback,
  } = useQuery<ImportDryRunResult | null>(
    () => (records.length === 0 ? Promise.resolve(null) : importDryRun(entity, records)),
    [entity, records],
  );

  if (error) return <ErrorBanner message={errorIsFallback ? 'Dry run failed' : error} />;

  if (loading || !result) {
    return <LoadingBlock label="Validating rows…" />;
  }

  const rows = result.rows;
  const invalidCount = rows.filter((r) => !r.valid).length;
  const duplicateCount = rows.filter((r) => r.valid && r.duplicate).length;
  const freshCount = rows.filter((r) => r.valid && !r.duplicate).length;
  const preview = rows.slice(0, 10);
  const importableText =
    duplicate === 'overwrite'
      ? `${freshCount} new + ${duplicateCount} updated`
      : `${freshCount} created · ${duplicateCount} skipped as duplicates`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-lg text-ink">Review {file.name}</h2>
          <p className="text-13 text-ink-faint">
            {rows.length} data rows · {importableText} · {invalidCount} with errors
          </p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input
              type="radio"
              name="duplicate-policy"
              checked={duplicate === 'skip'}
              onChange={() => onDuplicateChange('skip')}
              className="accent-forest"
            />
            Skip existing emails
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input
              type="radio"
              name="duplicate-policy"
              checked={duplicate === 'overwrite'}
              onChange={() => onDuplicateChange('overwrite')}
              className="accent-forest"
            />
            Overwrite existing
          </label>
        </div>
      </div>

      {entity === 'contact' && duplicateCount === 0 && invalidCount === 0 ? (
        <p className="text-13 text-ink-faint">
          No contacts with a matching email were found, so the duplicate choice does not affect this
          file.
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border hairline bg-white">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead>
            <tr className="border-b hairline text-12 uppercase tracking-label text-ink-faint">
              <th className="px-4 py-3 font-semibold">#</th>
              <th className="px-4 py-3 font-semibold">Record</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y hairline">
            {preview.map((row) => (
              <tr key={row.index} className={row.valid ? '' : 'bg-danger/[0.02]'}>
                <td className="px-4 py-3 text-ink-faint">{row.index}</td>
                <td className="px-4 py-3 font-medium text-ink">{summaryLabel(entity, row.data)}</td>
                <td className="px-4 py-3">{rowBadge(row)}</td>
                <td className="px-4 py-3 text-13 text-ink-muted">
                  {!row.valid ? (
                    <span className="text-danger">{row.reasons.join(' ')}</span>
                  ) : row.duplicate ? (
                    duplicate === 'overwrite' ? (
                      'Email matches an existing contact — will update it'
                    ) : (
                      'Email matches an existing contact — will be skipped'
                    )
                  ) : (
                    <span className="text-ink-faint">{mappedPreview(entity, row.data)}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > preview.length ? (
          <p className="border-t hairline px-4 py-3 text-13 text-ink-faint">
            Showing the first {preview.length} of {rows.length} rows.
          </p>
        ) : null}
      </div>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          Back to mapping
        </Button>
        <Button
          onClick={onCommit}
          disabled={freshCount + (duplicate === 'overwrite' ? duplicateCount : 0) === 0}
        >
          Import {rows.length} row{rows.length === 1 ? '' : 's'}
        </Button>
      </div>
    </div>
  );
}

function mappedPreview(entity: ImportEntity, data: Record<string, string>): string {
  const bits: string[] = [];
  if (entity === 'contact') {
    if (data.email) bits.push(data.email);
    if (data.jobTitle) bits.push(data.jobTitle);
    if (data.company) bits.push(data.company);
  } else {
    if (data.industry) bits.push(data.industry);
    if (data.website) bits.push(data.website);
  }
  return bits.length ? bits.join(' · ') : 'No additional fields mapped';
}
