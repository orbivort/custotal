// Component tests for Sidebar, the fixed primary navigation.
//
// Collaborators are mocked so the rail logic is tested in isolation:
// - react-router's NavLink  -> left real, so active state follows the path
// - SessionContext.useSession -> decides whether the admin section renders
// - InstanceContext.useInstance -> supplies the version/environment imprint
// - onToggleCollapsed -> asserted for the collapse/expand control
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstanceStatus } from '../features/auth/useInstanceStatus';
import type { User } from '../types/domain';
import { Sidebar } from './Sidebar';

const h = vi.hoisted(() => ({ useSession: vi.fn(), useInstance: vi.fn() }));

vi.mock('../features/auth/SessionContext', () => ({ useSession: h.useSession }));
vi.mock('../features/auth/InstanceContext', () => ({ useInstance: h.useInstance }));

const ADMIN: User = { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin' };
const REP: User = { id: 'u2', name: 'Ben Smith', email: 'ben@example.com', role: 'rep' };

const onToggle = vi.fn();

const INSTANCE: InstanceStatus = {
  state: 'ok',
  info: {
    orgName: 'Custotal',
    version: '0.1.0',
    environment: 'production',
    hostname: 'crm.custotal.local',
    allowPasswordReset: true,
    setupRequired: false,
  },
};

function renderSidebar(
  user: User | null = REP,
  path = '/',
  {
    collapsed = false,
    instance = INSTANCE,
  }: { collapsed?: boolean; instance?: InstanceStatus } = {},
) {
  h.useSession.mockReturnValue({ user, loading: false });
  h.useInstance.mockReturnValue(instance);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar collapsed={collapsed} onToggleCollapsed={onToggle} />
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the wordmark', () => {
    renderSidebar();

    expect(screen.getByText('Custotal')).toBeInTheDocument();
  });

  it('renders every primary nav item with its target route', () => {
    renderSidebar();

    const nav = screen.getByRole('navigation');
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual([
      'Dashboard',
      'Contacts',
      'Accounts',
      'Pipeline',
      'Tasks',
      'Pipeline by Stage',
      'Win / Loss',
    ]);
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/',
      '/contacts',
      '/accounts',
      '/pipeline',
      '/tasks',
      '/reports/pipeline',
      '/reports/winloss',
    ]);
  });

  it('labels the reports group', () => {
    renderSidebar();

    expect(screen.getByText('Reports')).toBeInTheDocument();
  });

  it('marks Dashboard as current only on the exact root path', () => {
    renderSidebar(REP, '/');

    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Contacts' })).not.toHaveAttribute('aria-current');
  });

  it('marks the matching section as current on a subroute', () => {
    renderSidebar(REP, '/contacts');

    expect(screen.getByRole('link', { name: 'Contacts' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
  });

  it('hides the admin section for non-admin roles', () => {
    renderSidebar(REP);

    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Users & roles' })).not.toBeInTheDocument();
  });

  it('hides the admin section when there is no session user', () => {
    renderSidebar(null);

    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });

  it('renders the admin section and its routes for admins', () => {
    renderSidebar(ADMIN);

    expect(screen.getByText('Admin')).toBeInTheDocument();
    const adminLinks = [
      'Overview',
      'Users & roles',
      'Pipeline stages',
      'CSV import',
      'Recovery',
    ].map((name) => screen.getByRole('link', { name }));
    expect(adminLinks.map((l) => l.getAttribute('href'))).toEqual([
      '/admin',
      '/admin/users',
      '/admin/stages',
      '/admin/import',
      '/admin/recover',
    ]);
  });

  it('does not mark Overview as current on an admin subroute', () => {
    renderSidebar(ADMIN, '/admin/users');

    expect(screen.getByRole('link', { name: 'Users & roles' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current');
  });

  it('renders the product name and the release version on one footer line', () => {
    renderSidebar();

    expect(screen.getByText('Custotal - Customer Mgmt v0.1.0')).toHaveAttribute(
      'title',
      'Version 0.1.0 · production',
    );
  });

  it('omits the version imprint while the instance probe is unresolved', () => {
    renderSidebar(REP, '/', { instance: { state: 'loading' } });

    expect(screen.queryByText(/v0\.1\.0/)).not.toBeInTheDocument();
  });

  it('keeps every nav label reachable by name when the rail is collapsed', () => {
    renderSidebar(REP, '/contacts', { collapsed: true });

    expect(screen.getByRole('link', { name: 'Contacts' })).toHaveAttribute('aria-current', 'page');
  });

  it('shows only the expand control, with no imprint, when the rail is collapsed', () => {
    renderSidebar(REP, '/', { collapsed: true });

    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
    // The wordmark is now the only place the product name appears.
    expect(screen.getByText('Custotal')).toBeInTheDocument();
    expect(screen.queryByText(/v0\.1\.0/)).not.toBeInTheDocument();
  });

  it('exposes a toggle reporting the expanded state', () => {
    renderSidebar();

    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('reports the collapsed state and asks the shell to expand', () => {
    renderSidebar(REP, '/', { collapsed: true });

    const toggle = screen.getByRole('button', { name: 'Expand sidebar' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);

    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
