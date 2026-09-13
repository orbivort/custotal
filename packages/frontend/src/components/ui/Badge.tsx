import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type BadgeTone = 'neutral' | 'forest' | 'danger' | 'warn' | 'success' | 'info';

const toneCls: Record<BadgeTone, string> = {
  neutral: 'bg-ink/5 text-ink-muted',
  forest: 'bg-forest/10 text-forest',
  danger: 'bg-danger/10 text-danger',
  warn: 'bg-warn/15 text-warn',
  success: 'bg-success/10 text-success',
  info: 'bg-info/10 text-info',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-12 font-medium leading-5',
        toneCls[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
