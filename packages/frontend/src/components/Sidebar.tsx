import { NavLink } from 'react-router';
import { cn } from '../lib/cn';
import { useInstance } from '../features/auth/InstanceContext';
import { useSession } from '../features/auth/SessionContext';
import {
  BuildingIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ColumnsIcon,
  DashboardIcon,
  UsersIcon,
  XIcon,
} from './icons';

/** Section eyebrow above a nav group. Visually hidden while the rail is collapsed. */
const GROUP_LABEL =
  'px-3 pb-1 pt-5 text-11 font-semibold uppercase tracking-eyebrow text-ink-faint';

/**
 * The rail is one component in two modes, split purely by breakpoint:
 *
 * - `lg` and up — a fixed column, either the full 240px rail or the 64px
 *   icon-only rail driven by `collapsed`.
 * - below `lg` — an off-canvas drawer opened from the topbar's menu button.
 *   There is never enough width for even the collapsed rail next to a phone's
 *   content, so the drawer is always drawn expanded; `collapsed` therefore
 *   only ever reaches the markup through an `lg:` variant.
 */
const ASIDE_BASE =
  'fixed left-0 top-0 z-40 flex h-screen w-72 max-w-[85vw] flex-col border-r hairline bg-cream transition-[transform,visibility,width] supports-[height:1dvh]:h-dvh lg:z-30 lg:bg-cream/70 lg:backdrop-blur';

const primaryNav = [
  { to: '/', label: 'Dashboard', icon: DashboardIcon, end: true },
  { to: '/contacts', label: 'Contacts', icon: UsersIcon, end: false },
  { to: '/accounts', label: 'Accounts', icon: BuildingIcon, end: false },
  { to: '/pipeline', label: 'Pipeline', icon: ColumnsIcon, end: false },
  { to: '/tasks', label: 'Tasks', icon: CheckCircleIcon, end: false },
];

const reportNav = [
  { to: '/reports/pipeline', label: 'Pipeline by Stage', end: false },
  { to: '/reports/winloss', label: 'Win / Loss', end: false },
];

function Wordmark({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-forest text-paper">
        <span className="font-display text-base font-semibold leading-none">C</span>
      </span>
      {/* Collapsed, the "C" plate alone carries the brand; the wordmark stays in
          the accessible tree so the shell keeps a labelled home. The drawer is
          never collapsed, so the label is only dropped from `lg` up. */}
      <div className={cn('leading-tight', collapsed && 'lg:sr-only')}>
        <div className="font-display text-19 font-semibold tracking-tight text-ink">Custotal</div>
      </div>
    </div>
  );
}

function NavItem({
  to,
  label,
  icon: Icon,
  end,
  collapsed,
  onNavigate,
}: {
  to: string;
  label: string;
  icon?: typeof DashboardIcon;
  end?: boolean;
  collapsed: boolean;
  /** Closes the off-canvas drawer; a no-op while the rail is a column. */
  onNavigate?: () => void;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      // The label stays in the accessible tree (sr-only) while the rail is
      // collapsed, so icon-only navigation is still announced and queryable.
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          // Expanded is the baseline; the icon-only layout is layered on top
          // for `lg` only, so the drawer keeps its labels at every small width.
          'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors cursor-pointer',
          collapsed && 'lg:justify-center lg:gap-0 lg:px-0',
          isActive ? 'bg-forest/10 text-forest' : 'text-ink-muted hover:bg-fill hover:text-ink',
        )
      }
    >
      {Icon ? (
        <Icon className="h-[18px] w-[18px] shrink-0" />
      ) : (
        <span className="h-[18px] w-[18px] shrink-0" />
      )}
      <span className={collapsed ? 'lg:sr-only' : undefined}>{label}</span>
    </NavLink>
  );
}

const adminNav = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/users', label: 'Users & roles' },
  { to: '/admin/stages', label: 'Pipeline stages' },
  { to: '/admin/import', label: 'CSV import' },
  { to: '/admin/recover', label: 'Recovery' },
];

export function Sidebar({
  collapsed,
  onToggleCollapsed,
  mobileOpen = false,
  onCloseMobile,
}: {
  /** Icon-only rail when true; full 240px rail when false. Applies at `lg` only. */
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** True while the off-canvas drawer is open below `lg`. */
  mobileOpen?: boolean;
  /** Dismisses the drawer — from the close button, the scrim or a nav tap. */
  onCloseMobile?: () => void;
}) {
  const { user } = useSession();
  const instance = useInstance();
  const isAdmin = user?.role === 'admin';
  // Rendered only once the probe resolves, so the imprint never flashes a
  // placeholder or a stale number.
  const info = instance.state === 'ok' ? instance.info : null;

  return (
    <aside
      id="sidebar"
      className={cn(
        ASIDE_BASE,
        // Off-canvas below `lg`. `visibility` rides along with the transform so
        // the closed drawer also leaves the tab order — a translated-but-visible
        // rail would still be focusable, off-screen.
        mobileOpen ? 'visible translate-x-0' : 'invisible -translate-x-full',
        // From `lg` up the rail is a permanent column and is always on screen.
        'lg:visible lg:translate-x-0',
        collapsed ? 'lg:w-16' : 'lg:w-60',
      )}
    >
      <div
        className={cn(
          'flex h-16 items-center gap-2 border-b hairline px-5',
          collapsed && 'lg:justify-center lg:px-4',
        )}
      >
        <Wordmark collapsed={collapsed} />
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation"
          className="tap-target ml-auto flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-fill hover:text-ink lg:hidden"
        >
          <XIcon className="size-5" />
        </button>
      </div>
      <nav
        id="sidebar-nav"
        className={cn('flex-1 space-y-1 overflow-y-auto px-3 py-4', collapsed && 'lg:px-2')}
      >
        {primaryNav.map((item) => (
          <NavItem key={item.to} {...item} collapsed={collapsed} onNavigate={onCloseMobile} />
        ))}
        <div className={cn(GROUP_LABEL, collapsed && 'lg:sr-only')}>Reports</div>
        {reportNav.map((item) => (
          <NavItem key={item.to} {...item} collapsed={collapsed} onNavigate={onCloseMobile} />
        ))}
        {isAdmin ? (
          <>
            <div className={cn(GROUP_LABEL, collapsed && 'lg:sr-only')}>Admin</div>
            {adminNav.map((item) => (
              <NavItem key={item.to} {...item} collapsed={collapsed} onNavigate={onCloseMobile} />
            ))}
          </>
        ) : null}
      </nav>
      {/* One rail foot: the product imprint and the collapse/expand control share
          a single line, with the toggle pinned to the trailing edge. The chevron is
          its own button — folding a visible "Custotal - Customer Mgmt v0.1.0" label into it would
          put the accessible name ("Collapse sidebar") at odds with the visible label
          (WCAG 2.5.3 Label in Name) and would hide the version from assistive tech
          and from text selection. Collapsed, the text drops away and only the expand
          chevron remains.

          Folding the rail is a desktop affordance: in the drawer the navigation is
          already the only thing on screen, so the control is hidden below `lg`. */}
      <div
        className={cn(
          'flex items-center gap-1.5 border-t hairline px-3 py-2',
          collapsed && 'lg:justify-center lg:px-2',
        )}
      >
        {collapsed ? null : (
          <span
            className="min-w-0 flex-1 truncate text-11 leading-relaxed text-ink-faint"
            title={info ? `Version ${info.version} · ${info.environment}` : undefined}
          >
            Custotal - Customer Mgmt{info ? ` v${info.version}` : ''}
          </span>
        )}
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          aria-controls="sidebar-nav"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="hidden size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-fill hover:text-ink lg:flex"
        >
          {/* Points at the edge the rail will move toward: left to collapse,
              right to expand. */}
          <ChevronRightIcon
            className={cn('h-[18px] w-[18px] transition-transform', !collapsed && 'rotate-180')}
          />
        </button>
      </div>
    </aside>
  );
}
