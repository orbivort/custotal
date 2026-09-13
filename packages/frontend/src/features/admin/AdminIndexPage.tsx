import { Link } from 'react-router';
import { PageHeader } from '../../components/PageHeader';
import { LoadingBlock } from '../../components/ui/Feedback';
import {
  ChevronRightIcon,
  FileIcon,
  RestoreIcon,
  SettingsIcon,
  UsersIcon,
} from '../../components/icons';
import { useQuery } from '../../lib/hooks';
import { useMeta } from '../meta/MetaContext';
import { listImportTemplates } from './importWizard/importApi';
import { listTrash } from './adminApi';
import type { TrashPayload } from '../../types/domain';
import { AdminNav } from './AdminNav';

const tools = [
  {
    to: '/admin/users',
    title: 'Users & roles',
    description: 'Add teammates, assign one of the four roles, or deactivate a former member.',
    icon: UsersIcon,
  },
  {
    to: '/admin/stages',
    title: 'Pipeline stages',
    description: 'Rename, reorder, and configure win probability for the single sales pipeline.',
    icon: SettingsIcon,
  },
  {
    to: '/admin/import',
    title: 'CSV import',
    description:
      'Import contacts and accounts with column mapping and a dry-run validation preview.',
    icon: FileIcon,
  },
  {
    to: '/admin/recover',
    title: 'Recovery',
    description: 'Restore or permanently purge soft-deleted records within the 30-day window.',
    icon: RestoreIcon,
  },
];

export default function AdminIndexPage() {
  const { users, stages } = useMeta();
  const { data: trash, loading: trashLoading } = useQuery<TrashPayload>(listTrash);
  const { data: templates } = useQuery(() => listImportTemplates());

  const recoverable = (trash?.contacts.length ?? 0) + (trash?.accounts.length ?? 0);
  const stats = [
    { label: 'Team members', value: String(users.length), sub: 'across 4 roles' },
    { label: 'Pipeline stages', value: String(stages.length), sub: 'in one pipeline' },
    {
      label: 'Recoverable records',
      value: trashLoading ? '—' : String(recoverable),
      sub: 'within 30 days',
    },
    {
      label: 'Saved import mappings',
      value: String(templates?.length ?? 0),
      sub: 'column templates',
    },
  ];

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Admin"
        subtitle="Configure the team, pipeline, and data your workspace runs on."
      />

      <AdminNav />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((k, i) => (
          <div
            key={k.label}
            className="rounded-xl border hairline bg-white p-5 animate-fade-up"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <p className="text-11 font-semibold uppercase tracking-eyebrow text-ink-faint">
              {k.label}
            </p>
            <p className="mt-2 font-display text-[30px] font-semibold leading-none tracking-tight text-ink">
              {k.value}
            </p>
            <p className="mt-2 text-13 text-ink-muted">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <Link
              key={tool.to}
              to={tool.to}
              className="group rounded-xl border hairline bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-forest/30 hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-forest/10 text-forest">
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-lg font-semibold text-ink group-hover:text-forest">
                    {tool.title}
                  </h3>
                  <p className="mt-0.5 text-13 leading-relaxed text-ink-faint">
                    {tool.description}
                  </p>
                </div>
                <ChevronRightIcon className="size-5 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          );
        })}
      </div>

      {trashLoading ? <LoadingBlock /> : null}
    </div>
  );
}
