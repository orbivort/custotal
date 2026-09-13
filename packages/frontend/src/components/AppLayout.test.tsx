// Component tests for AppLayout, the authenticated app shell.
//
// The shell is a composition of providers and chrome, so each collaborator is
// mocked and the assertions focus on wiring: metadata is available to nested
// routes, and the sidebar/topbar/outlet all render.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstanceInfo, User } from '../types/domain';
import AppLayout from './AppLayout';

const h = vi.hoisted(() => ({
  useSession: vi.fn(),
  useMeta: vi.fn(),
  useInstance: vi.fn(),
  getTaskSummary: vi.fn(),
}));

vi.mock('../features/auth/SessionContext', () => ({ useSession: h.useSession }));
vi.mock('../features/meta/MetaContext', () => ({
  // Pass-through provider: lets the test assert that Outlet content really is
  // nested inside MetaProvider without triggering a metadata fetch.
  MetaProvider: ({ children }: { children: React.ReactNode }) => children,
  useMeta: h.useMeta,
}));
vi.mock('../features/auth/InstanceContext', () => ({
  // Pass-through provider, same reasoning as MetaProvider above: the shell
  // wiring is under test, not the /api/health probe.
  InstanceProvider: ({ children }: { children: React.ReactNode }) => children,
  useInstance: h.useInstance,
}));
vi.mock('../features/tasks/tasksApi', () => ({ getTaskSummary: h.getTaskSummary }));

const USER: User = { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin' };

const INSTANCE_INFO: InstanceInfo = {
  orgName: 'Custotal',
  version: '0.1.0',
  environment: 'production',
  hostname: 'crm.custotal.local',
  allowPasswordReset: true,
  setupRequired: false,
};

/** Outlet content that proves the metadata context reaches nested routes. */
function ChildProbe() {
  const { accountName } = h.useMeta();
  return <p>child page:{accountName('a1')}</p>;
}

function renderLayout() {
  h.useSession.mockReturnValue({ user: USER, loading: false, logout: vi.fn() });
  h.useMeta.mockReturnValue({
    userName: () => 'Ada Lovelace',
    accountName: (id?: string) => (id === 'a1' ? 'Acme Corp' : 'Unknown'),
  });
  h.useInstance.mockReturnValue({ state: 'ok', info: INSTANCE_INFO });
  h.getTaskSummary.mockResolvedValue({ dueToday: 0, overdue: 0 });
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<ChildProbe />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe('AppLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The rail preference is persisted, so it must not leak between cases.
    window.localStorage.clear();
  });

  it('renders the routed child inside a main landmark', () => {
    renderLayout();

    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByText(/child page:/)).toBeInTheDocument();
  });

  it('provides metadata to the nested route content', () => {
    renderLayout();

    expect(screen.getByText('child page:Acme Corp')).toBeInTheDocument();
  });

  it('renders the sidebar chrome', () => {
    renderLayout();

    expect(screen.getByText('Custotal')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('renders the topbar chrome for the signed-in user', async () => {
    renderLayout();

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByLabelText('Global search')).toBeInTheDocument();
    await waitFor(() => expect(h.getTaskSummary).toHaveBeenCalledTimes(1));
  });

  it('collapses and expands the sidebar rail across the whole shell', () => {
    renderLayout();

    const toggle = screen.getByRole('button', { name: 'Collapse sidebar' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(toggle);

    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('persists the rail preference for the next visit', () => {
    renderLayout();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));

    expect(window.localStorage.getItem('custotal-sidebar-collapsed')).toBe('true');
  });

  it('restores a collapsed rail from storage on load', () => {
    window.localStorage.setItem('custotal-sidebar-collapsed', 'true');

    renderLayout();

    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
  });

  it('renders the sidebar imprint from the instance probe', () => {
    renderLayout();

    expect(screen.getByText('Custotal - Customer Mgmt v0.1.0')).toBeInTheDocument();
  });
});
