import { useMemo, useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/Feedback';
import { CheckIcon, DownloadIcon, FileIcon, UploadIcon } from '../../components/icons';
import { useToast } from '../../components/toast';
import { parseCsv } from '../../lib/csv';
import type { DuplicatePolicy, ImportCommitSummary, ImportEntity } from '../../types/domain';
import { importCommit } from './importWizard/importApi';
import { toRecords, csvTemplateFor, templateFileName } from './importWizard/fields';
import { MapColumnsStep } from './importWizard/MapColumnsStep';
import { ReviewStep } from './importWizard/ReviewStep';
import { AdminNav } from './AdminNav';

export interface ImportFile {
  name: string;
  headers: string[];
  rows: string[][];
}

const MAX_BYTES = 10 * 1024 * 1024;
const STEPS = ['Upload', 'Map columns', 'Review', 'Done'];

export default function ImportWizardPage() {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [entity, setEntity] = useState<ImportEntity>('contact');
  const [file, setFile] = useState<ImportFile | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [duplicate, setDuplicate] = useState<DuplicatePolicy>('skip');
  const [summary, setSummary] = useState<ImportCommitSummary | null>(null);
  const [error, setError] = useState('');

  const records = useMemo(() => {
    if (!file) return [];
    return toRecords(file.headers, file.rows, mapping);
  }, [file, mapping]);

  function reset() {
    setStep(0);
    setFile(null);
    setMapping({});
    setSummary(null);
    setError('');
  }

  function commit() {
    if (!file || records.length === 0) return;
    importCommit(entity, records, duplicate)
      .then((result) => {
        setSummary(result);
        setStep(3);
        toast.show('Import finished', 'success');
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Import failed'));
  }

  const stepLabel = STEPS[Math.min(step, STEPS.length - 1)];

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="CSV import"
        subtitle="Bring contacts or accounts in from a spreadsheet with validation before anything is saved."
      />

      <AdminNav />

      {/* Wraps rather than clipping: four steps plus connectors do not fit a
          phone-width row. */}
      <ol
        className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm"
        aria-label="Import progress"
      >
        {STEPS.map((label, i) => {
          const done = i < step || (i === 3 && step === 3);
          const active = i === step;
          return (
            <li key={label} className="flex items-center gap-3">
              <span
                className={`flex items-center gap-2 rounded-full px-3 py-1 transition-colors ${
                  active
                    ? 'bg-forest text-paper'
                    : done
                      ? 'bg-forest/10 text-forest'
                      : 'text-ink-faint'
                }`}
              >
                {done ? (
                  <CheckIcon className="size-3.5" />
                ) : (
                  <span className="text-12 font-semibold">{i + 1}</span>
                )}
                <span className="font-medium">{label}</span>
              </span>
              {i < STEPS.length - 1 ? <span className="h-px w-6 bg-ink/15" /> : null}
            </li>
          );
        })}
      </ol>

      <p className="sr-only">Current step: {stepLabel}</p>

      {error ? <ErrorBanner message={error} /> : null}

      {step === 0 ? (
        <UploadStep
          entity={entity}
          onEntityChange={setEntity}
          onParsed={(parsed) => {
            setFile(parsed);
            setMapping({});
            setSummary(null);
            setError('');
            setStep(1);
          }}
        />
      ) : step === 1 && file ? (
        <MapColumnsStep
          entity={entity}
          headers={file.headers}
          mapping={mapping}
          onChange={(next) => {
            setMapping(next);
            setError('');
          }}
          onBack={() => setStep(0)}
          onNext={() => setStep(2)}
        />
      ) : step === 2 && file ? (
        <ReviewStep
          entity={entity}
          file={file}
          records={records}
          duplicate={duplicate}
          onDuplicateChange={setDuplicate}
          onBack={() => setStep(1)}
          onCommit={commit}
        />
      ) : step === 3 && summary ? (
        <SummaryStep summary={summary} onReset={reset} />
      ) : null}
    </div>
  );
}

function UploadStep({
  entity,
  onEntityChange,
  onParsed,
}: {
  entity: ImportEntity;
  onEntityChange: (entity: ImportEntity) => void;
  onParsed: (file: ImportFile) => void;
}) {
  const toast = useToast();
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');

  function downloadTemplate() {
    const blob = new Blob([csvTemplateFor(entity)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = templateFileName(entity);
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleFile(input: File | undefined) {
    if (!input) return;
    if (input.size > MAX_BYTES) {
      setError('File must be 10 MB or smaller.');
      return;
    }
    const text = await input.text();
    const matrix = parseCsv(text).filter((cells) => cells.some((c) => c.trim() !== ''));
    if (matrix.length < 2) {
      setError('The file needs a header row and at least one data row.');
      return;
    }
    const headers = matrix[0].map((h) => h.trim());
    const rows = matrix.slice(1);
    setError('');
    setFileName(input.name);
    onParsed({ name: input.name, headers, rows });
    toast.show(`Read ${rows.length} data rows from ${input.name}`, 'success');
  }

  const segments: { value: ImportEntity; label: string; hint: string }[] = [
    { value: 'contact', label: 'Contacts', hint: 'People with name, email, and phone fields.' },
    { value: 'account', label: 'Accounts', hint: 'Organizations with name and billing fields.' },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="lg:col-span-2">
        <h2 className="mb-3 font-display text-lg text-ink">1 · Pick what you are importing</h2>
        <div className="space-y-2">
          {segments.map((segment) => (
            <button
              key={segment.value}
              onClick={() => onEntityChange(segment.value)}
              className={`w-full rounded-xl border p-4 text-left transition-all cursor-pointer ${
                entity === segment.value
                  ? 'border-forest/40 bg-forest/[0.04]'
                  : 'hairline bg-white hover:border-ink/25'
              }`}
            >
              <p
                className={`text-sm font-semibold ${entity === segment.value ? 'text-forest' : 'text-ink'}`}
              >
                {segment.label}
              </p>
              <p className="mt-0.5 text-13 text-ink-faint">{segment.hint}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="lg:col-span-3">
        <h2 className="mb-3 font-display text-lg text-ink">2 · Choose a CSV file</h2>
        <label
          className={`flex min-h-56 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-8 text-center transition-colors ${
            fileName
              ? 'border-forest/40 bg-forest/[0.03]'
              : 'border-ink/25 bg-white hover:border-forest/50 hover:bg-forest/[0.02]'
          }`}
        >
          <UploadIcon className="size-8 text-forest" />
          <span className="font-display text-lg text-ink">{fileName || 'Drop your CSV here'}</span>
          <span className="text-sm text-ink-faint">or click to browse · max 10 MB</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            aria-label="Upload CSV file"
            onChange={(e) => {
              void handleFile(e.target.files?.[0]);
              e.currentTarget.value = '';
            }}
          />
        </label>
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="subtle" size="sm" onClick={downloadTemplate}>
            <DownloadIcon className="size-4" />
            Download {entity === 'contact' ? 'contacts' : 'accounts'} template
          </Button>
          <span className="text-13 text-ink-faint">
            Starts from a valid sample — open it in any spreadsheet to add your rows.
          </span>
        </div>
      </div>
    </div>
  );
}

function SummaryStep({ summary, onReset }: { summary: ImportCommitSummary; onReset: () => void }) {
  const tiles: { label: string; value: number; tone: string }[] = [
    { label: 'Created', value: summary.created, tone: 'text-success' },
    { label: 'Updated', value: summary.updated, tone: 'text-forest' },
    { label: 'Skipped', value: summary.skipped, tone: 'text-warn' },
    {
      label: 'Failed',
      value: summary.failed,
      tone: summary.failed > 0 ? 'text-danger' : 'text-ink',
    },
  ];

  return (
    <div className="rounded-xl border hairline bg-white p-8 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-success/10 text-success">
        <CheckIcon className="size-6" />
      </span>
      <h2 className="mt-4 font-display text-2xl font-semibold text-ink">Import complete</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">
        {summary.created} {summary.entity === 'contact' ? 'contacts' : 'accounts'} are now live in
        the workspace.
      </p>
      <dl className="mx-auto mt-6 grid max-w-md grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-lg bg-cream/60 px-3 py-4">
            <dt className="text-11 font-semibold uppercase tracking-eyebrow text-ink-faint">
              {tile.label}
            </dt>
            <dd className={`mt-1 font-display text-2xl font-semibold ${tile.tone}`}>
              {tile.value}
            </dd>
          </div>
        ))}
      </dl>
      <Button variant="secondary" className="mt-8" onClick={onReset}>
        <FileIcon className="size-4" /> Start another import
      </Button>
    </div>
  );
}
