import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Select } from '../../../components/ui/Field';
import { TrashIcon } from '../../../components/icons';
import { useToast } from '../../../components/toast';
import { deleteImportTemplate, listImportTemplates, saveImportTemplate } from './importApi';
import type { ImportEntity, ImportMappingTemplate } from '../../../types/domain';
import { fieldOptionsFor } from './fields';

const ALIASES: Record<string, string> = {
  firstname: 'firstName',
  first: 'firstName',
  lastname: 'lastName',
  last: 'lastName',
  name: 'name',
  accountname: 'name',
  companyname: 'name',
  email: 'email',
  emailaddress: 'email',
  phone: 'phone',
  phone1: 'phone',
  jobtitle: 'jobTitle',
  title: 'jobTitle',
  company: 'company',
  address: 'address',
  billingaddress: 'billingAddress',
  notes: 'notes',
  comment: 'notes',
  status: 'status',
  website: 'website',
  url: 'website',
  industry: 'industry',
  owner: 'ownerEmail',
  owneremail: 'ownerEmail',
};

function guessField(entity: ImportEntity, header: string): string {
  const key = header.toLowerCase().replace(/[^a-z0-9]/g, '');
  const mapped = ALIASES[key] ?? ALIASES[key.replace('_', '')];
  if (!mapped) return '';
  if (entity === 'contact') {
    if (mapped === 'name') return 'firstName';
    if (mapped === 'billingAddress') return 'address';
  }
  if (entity === 'account' && mapped === 'address') return 'billingAddress';
  return mapped;
}

export function MapColumnsStep({
  entity,
  headers,
  mapping,
  onChange,
  onBack,
  onNext,
}: {
  entity: ImportEntity;
  headers: string[];
  mapping: Record<string, string>;
  onChange: (mapping: Record<string, string>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const toast = useToast();
  const options = fieldOptionsFor(entity);
  const requiredKeys = options.filter((o) => o.required).map((o) => o.key);
  const mappedValues = Object.values(mapping);
  const missingRequired = requiredKeys.filter((key) => !mappedValues.includes(key));

  const [templates, setTemplates] = useState<ImportMappingTemplate[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  useEffect(() => {
    listImportTemplates(entity)
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }, [entity]);

  const autoMapping = useMemo(() => {
    const next: Record<string, string> = {};
    headers.forEach((header) => {
      const field = guessField(entity, header);
      if (field) next[header] = field;
    });
    return next;
  }, [entity, headers]);

  function setField(header: string, field: string) {
    onChange({ ...mapping, [header]: field });
  }

  function saveTemplate() {
    if (!templateName.trim()) return;
    setSavingTemplate(true);
    saveImportTemplate({
      entity,
      name: templateName.trim(),
      mapping,
      ownerColumn: headers.find((h) => mapping[h] === 'ownerEmail'),
    })
      .then((saved) => {
        toast.show(`Template "${saved.name}" saved`, 'success');
        setTemplateName('');
        setTemplates((prev) => {
          const rest = prev.filter((t) => t.id !== saved.id);
          return [...rest, saved].sort((a, b) => a.name.localeCompare(b.name));
        });
      })
      .catch((err: unknown) =>
        toast.show(err instanceof Error ? err.message : 'Save failed', 'error'),
      )
      .finally(() => setSavingTemplate(false));
  }

  function deleteTemplate(template: ImportMappingTemplate) {
    deleteImportTemplate(template.id)
      .then(() => {
        setTemplates((prev) => prev.filter((t) => t.id !== template.id));
        toast.show('Template deleted', 'success');
      })
      .catch((err: unknown) =>
        toast.show(err instanceof Error ? err.message : 'Delete failed', 'error'),
      );
  }

  const mappedCount = headers.filter((h) => mapping[h]).length;

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg text-ink">Map your columns to fields</h2>
          <Button
            variant="subtle"
            size="sm"
            onClick={() => {
              onChange(autoMapping);
              toast.show('Best-guess mapping applied — adjust as needed', 'info');
            }}
          >
            Auto-map
          </Button>
        </div>
        <p className="text-13 text-ink-faint">
          Each column header below maps to a Custotal field. Unmapped columns are ignored.
        </p>

        <div className="overflow-x-auto rounded-xl border hairline bg-white">
          <ul className="divide-y hairline">
            {headers.map((header, index) => (
              <li
                key={`${header}-${index}`}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
              >
                <div className="min-w-0 w-40 shrink-0">
                  <p className="truncate font-mono text-13 text-ink" title={header}>
                    {header || `Column ${index + 1}`}
                  </p>
                  <p className="text-11 text-ink-faint">CSV header</p>
                </div>
                <Select
                  value={mapping[header] ?? ''}
                  onChange={(e) => setField(header, e.target.value)}
                  aria-label={`Map column "${header}" to a field`}
                  className="w-64 !py-1.5 text-13"
                >
                  <option value="">— Ignore this column —</option>
                  {options.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.label}
                      {opt.required ? ' *' : ''}
                    </option>
                  ))}
                </Select>
              </li>
            ))}
          </ul>
        </div>

        {mappedCount === 0 ? (
          <p className="text-sm text-warn">Map at least one column before continuing.</p>
        ) : missingRequired.length > 0 ? (
          <p className="text-sm text-warn">
            Required fields not mapped yet:{' '}
            {missingRequired.map((k) => options.find((o) => o.key === k)?.label ?? k).join(', ')}.
            Rows missing them will be flagged in the review.
          </p>
        ) : null}

        <div className="flex justify-between">
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
          <Button onClick={onNext} disabled={mappedCount === 0}>
            Review rows
          </Button>
        </div>
      </div>

      <aside className="space-y-4 lg:col-span-2">
        <div className="rounded-xl border hairline bg-white p-4">
          <h3 className="mb-2 text-11 font-semibold uppercase tracking-eyebrow text-ink-faint">
            Saved mapping templates
          </h3>
          {templates.length === 0 ? (
            <p className="text-13 text-ink-faint">
              No templates yet. Save this mapping to reuse it next time.
            </p>
          ) : (
            <ul className="space-y-1">
              {templates.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-fill"
                >
                  <button
                    onClick={() => onChange({ ...t.mapping })}
                    className="text-left text-sm text-forest hover:underline cursor-pointer"
                  >
                    {t.name}
                  </button>
                  <button
                    onClick={() => deleteTemplate(t)}
                    className="rounded p-1.5 text-ink-faint hover:text-danger cursor-pointer"
                    aria-label={`Delete template ${t.name}`}
                  >
                    <TrashIcon className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border hairline bg-white p-4">
          <h3 className="mb-2 text-11 font-semibold uppercase tracking-eyebrow text-ink-faint">
            Save current mapping
          </h3>
          <div className="flex gap-2">
            <input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Template name"
              aria-label="Template name"
              className="w-full rounded-md border border-ink/15 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-forest focus:outline-none focus:ring-2 focus:ring-forest/25"
            />
            <Button
              variant="secondary"
              onClick={saveTemplate}
              disabled={savingTemplate || mappedCount === 0}
            >
              Save
            </Button>
          </div>
        </div>
      </aside>
    </div>
  );
}
