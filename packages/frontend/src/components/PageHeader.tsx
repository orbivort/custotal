import type { ReactNode } from 'react';
import { BrandMark } from './BrandMark';

export function PageHeader({
  title,
  subtitle,
  actions,
  brandMark = false,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /**
   * Puts the mark beside the heading. Off by default, and it should stay off
   * for anything rendered inside the app shell: the rail already carries the
   * brand on every one of those screens, so a second mark next to the title
   * adds no information and competes with the page's own identity. Turn it on
   * only where the shell is absent — a print or export header, a report cover,
   * an embedded view.
   */
  brandMark?: boolean;
}) {
  return (
    // Stacks below `sm`: a title plus two or three actions cannot share one row
    // on a phone without one of them being clipped, and the actions are the
    // part of the header that stays usable either way.
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          {/* 26px tracks the h1 across its 24px→30px responsive step: it reads
              as a heading ornament at the small end and still belongs at the
              large one, which no single fixed size manages at both. */}
          {brandMark ? <BrandMark size={26} /> : null}
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {title}
          </h1>
        </div>
        {subtitle ? <p className="mt-1 text-15 text-ink-muted">{subtitle}</p> : null}
      </div>
      {/* Wraps rather than overflows when a page passes three actions. */}
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
