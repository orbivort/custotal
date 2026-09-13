import { Suspense, useCallback, useEffect, useState } from 'react';
import { Outlet } from 'react-router';
import { cn } from '../lib/cn';
import { InstanceProvider } from '../features/auth/InstanceContext';
import { MetaProvider } from '../features/meta/MetaContext';
import { LoadingBlock } from './ui/Feedback';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

/** UI preference: whether the sidebar rail is collapsed to icons. */
const SIDEBAR_COLLAPSED_KEY = 'custotal-sidebar-collapsed';

/**
 * Reads the persisted rail preference on first paint. Storage can be
 * unavailable (private mode, blocked cookies), so a failure falls back to the
 * expanded rail rather than breaking the shell.
 */
function readStoredCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

export default function AppLayout() {
  // The rail width is shared chrome: the aside, the header offset and the main
  // padding must all move together, so the state lives here rather than inside
  // Sidebar.
  const [collapsed, setCollapsed] = useState(readStoredCollapsed);
  const toggleSidebar = useCallback(() => setCollapsed((v) => !v), []);

  // Below `lg` there is no room for a permanent rail, so the same navigation
  // becomes an off-canvas drawer driven by the topbar. The two modes are
  // mutually exclusive by breakpoint, which is why `collapsed` (a desktop-only
  // concern) only ever reaches the rail through an `lg:` variant.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const openMobileNav = useCallback(() => setMobileNavOpen(true), []);
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
    } catch {
      // Storage unavailable: the preference still applies for this session.
    }
  }, [collapsed]);

  // Escape closes the drawer, the way every other dismissible overlay behaves.
  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileNavOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileNavOpen]);

  // The page behind the drawer must not scroll under the finger.
  useEffect(() => {
    if (!mobileNavOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileNavOpen]);

  return (
    <MetaProvider>
      <InstanceProvider>
        <div className="min-h-screen bg-paper">
          {/* Keyboard users can jump past the fixed sidebar navigation. */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-ink focus:shadow-lg"
          >
            Skip to content
          </a>
          <Sidebar
            collapsed={collapsed}
            onToggleCollapsed={toggleSidebar}
            mobileOpen={mobileNavOpen}
            onCloseMobile={closeMobileNav}
          />
          {/* Scrim behind the drawer. Rendered only on small viewports, where
              the rail is an overlay rather than a column. */}
          {mobileNavOpen ? (
            <div
              className="fixed inset-0 z-30 bg-scrim backdrop-blur-[2px] animate-fade-in lg:hidden"
              onClick={closeMobileNav}
              aria-hidden="true"
            />
          ) : null}
          <Topbar
            collapsed={collapsed}
            mobileNavOpen={mobileNavOpen}
            onOpenMobileNav={openMobileNav}
          />
          {/* Below `lg` the content owns the full viewport width; the rail
              offset is applied only once the rail is a permanent column. */}
          <main
            id="main-content"
            className={cn('pt-16 transition-[padding]', collapsed ? 'lg:pl-16' : 'lg:pl-60')}
          >
            <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
              {/* Lazily-loaded route pages (see App.tsx) suspend here while
                  their chunk is fetched; the layout shell stays visible. */}
              <Suspense fallback={<LoadingBlock />}>
                <Outlet />
              </Suspense>
            </div>
          </main>
        </div>
      </InstanceProvider>
    </MetaProvider>
  );
}
