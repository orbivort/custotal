import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { XIcon } from '../icons';
import { cn } from '../../lib/cn';

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  // Move focus into the dialog on open and restore it to the trigger on close.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => previouslyFocused?.focus();
  }, [open]);

  // Escape to close and a minimal focus trap so Tab cannot leave the dialog.
  useEffect(() => {
    if (!open) return;
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panelRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Lock background scrolling while the dialog is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  // Portal to <body> so the dialog escapes any ancestor stacking context
  // (e.g. pages animated with transform-based fade-up would otherwise trap
  // this fixed element and let the fixed Topbar/Sidebar paint over it).
  return createPortal(
    <div className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-4">
      <div
        className="absolute inset-0 bg-scrim backdrop-blur-[2px] animate-fade-in"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          // Height is capped against the *dynamic* viewport where it is
          // supported, so a mobile browser's collapsing toolbar cannot push the
          // footer off-screen mid-interaction.
          'relative z-10 flex max-h-[90vh] w-full flex-col rounded-xl border border-ink/10 bg-white shadow-2xl outline-none animate-scale-in supports-[height:1dvh]:max-h-[90dvh]',
          wide ? 'max-w-2xl' : 'max-w-lg',
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b hairline px-5 py-4">
          <h3 id={titleId} className="min-w-0 font-display text-lg text-ink">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="tap-target -mr-1 flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-ink-faint hover:bg-fill hover:text-ink"
            aria-label="Close"
          >
            <XIcon />
          </button>
        </div>
        <div className="overflow-auto overscroll-contain px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t hairline px-5 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
