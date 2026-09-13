import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { cn } from '../lib/cn';
import { useQuery } from '../lib/hooks';
import { ROLE_LABELS } from '../lib/rbac';
import { initials } from '../lib/format';
import { useSession } from '../features/auth/SessionContext';
import { getTaskSummary } from '../features/tasks/tasksApi';
import type { TaskSummary } from '../types/domain';
import { ChevronDownIcon, InboxIcon, LockIcon, LogOutIcon, MenuIcon, SearchIcon } from './icons';
import { SearchBox } from './SearchBox';

export function Topbar({
  collapsed,
  mobileNavOpen = false,
  onOpenMobileNav,
}: {
  /** Tracks the sidebar rail width so the header starts at the rail's edge. */
  collapsed: boolean;
  /** True while the off-canvas drawer is open below `lg`. */
  mobileNavOpen?: boolean;
  /** Opens the off-canvas drawer — the header's menu button, below `lg`. */
  onOpenMobileNav?: () => void;
}) {
  const { user, logout } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const { data: summary } = useQuery<TaskSummary>(getTaskSummary);
  const badge = (summary?.dueToday ?? 0) + (summary?.overdue ?? 0);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  if (!user) return null;

  return (
    <header
      className={cn(
        // Full-bleed below `lg`, where there is no rail to clear; the rail
        // offset is applied from `lg` up so both shells move together.
        'fixed left-0 right-0 top-0 z-20 flex h-16 items-center gap-2 border-b hairline bg-paper/85 px-4 backdrop-blur transition-[left] sm:gap-4 sm:px-6',
        collapsed ? 'lg:left-16' : 'lg:left-60',
      )}
    >
      <button
        type="button"
        onClick={onOpenMobileNav}
        aria-label="Open navigation"
        aria-expanded={mobileNavOpen}
        aria-controls="sidebar"
        className="tap-target -ml-1 flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-fill hover:text-ink lg:hidden"
      >
        <MenuIcon className="size-5" />
      </button>

      {/* The combobox needs roughly a full phone's width to be legible, so
          below `sm` it collapses into a link to the dedicated search page. */}
      <div className="hidden min-w-0 flex-1 sm:block">
        <SearchBox />
      </div>
      <Link
        to="/search"
        aria-label="Search"
        className="tap-target flex size-10 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-fill hover:text-ink sm:hidden"
      >
        <SearchIcon className="size-5" />
      </Link>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Link
          to="/tasks"
          className="relative rounded-full p-2 text-ink-muted transition-colors hover:bg-fill hover:text-ink"
          aria-label="Open tasks"
        >
          <InboxIcon />
          {badge > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-10 font-semibold text-white">
              {badge}
            </span>
          ) : null}
        </Link>

        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-2.5 transition-colors hover:bg-fill cursor-pointer"
          >
            <span className="flex size-8 items-center justify-center rounded-full bg-forest text-sm font-semibold text-paper">
              {initials(user.name)}
            </span>
            <span className="hidden text-left sm:block">
              <span className="block text-sm font-medium leading-tight text-ink">{user.name}</span>
              <span className="block text-xs text-ink-faint">{ROLE_LABELS[user.role]}</span>
            </span>
            <ChevronDownIcon className="size-4 text-ink-faint" aria-hidden />
          </button>

          {menuOpen ? (
            <div className="absolute right-0 top-full z-30 mt-2 w-60 rounded-xl border border-ink/10 bg-white p-1.5 shadow-xl animate-scale-in">
              <Link
                to="/change-password"
                onClick={() => setMenuOpen(false)}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-fill cursor-pointer"
              >
                <LockIcon className="size-4" aria-hidden />
                Change password
              </Link>
              <button
                onClick={logout}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-danger transition-colors hover:bg-danger/5 cursor-pointer"
              >
                <LogOutIcon className="size-4" aria-hidden />
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
