import type { ReactNode } from 'react';

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    // Stacks below `sm`: a title plus two or three actions cannot share one row
    // on a phone without one of them being clipped, and the actions are the
    // part of the header that stays usable either way.
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          {title}
        </h1>
        {subtitle ? <p className="mt-1 text-15 text-ink-muted">{subtitle}</p> : null}
      </div>
      {/* Wraps rather than overflows when a page passes three actions. */}
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
