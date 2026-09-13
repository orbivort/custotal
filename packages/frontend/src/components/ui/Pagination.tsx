import { ArrowLeftIcon, ChevronRightIcon } from '../icons';

export function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-faint">
      <span>
        Showing{' '}
        <span className="font-medium text-ink">
          {total === 0 ? 0 : start}–{end}
        </span>{' '}
        of <span className="font-medium text-ink">{total}</span>
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className="inline-flex items-center gap-1 rounded-md border border-ink/10 bg-white px-2.5 py-1.5 text-13 font-medium text-ink transition-colors hover:bg-fill active:bg-fill-strong disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
        >
          <ArrowLeftIcon className="size-3.5" /> Previous
        </button>
        <span className="px-2 text-13">
          Page {page} of {pages}
        </span>
        <button
          onClick={() => onChange(page + 1)}
          disabled={page >= pages}
          className="inline-flex items-center gap-1 rounded-md border border-ink/10 bg-white px-2.5 py-1.5 text-13 font-medium text-ink transition-colors hover:bg-fill active:bg-fill-strong disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
        >
          Next <ChevronRightIcon className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
