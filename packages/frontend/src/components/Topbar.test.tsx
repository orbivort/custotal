// Component tests for Topbar, the fixed header with search, task badge and
// account menu.
//
// Collaborators are mocked so the header logic is tested in isolation:
// - SessionContext.useSession -> current user + logout action
// - MetaContext.useMeta       -> account-name lookup used by the search box
// - tasksApi.getTaskSummary   -> drives the inbox badge count
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskSummary, User } from '../types/domain';
import { Topbar } from './Topbar';

const h = vi.hoisted(() => ({
  useSession: vi.fn(),
  useMeta: vi.fn(),
  getTaskSummary: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('../features/auth/SessionContext', () => ({ useSession: h.useSession }));
vi.mock('../features/meta/MetaContext', () => ({ useMeta: h.useMeta }));
vi.mock('../features/tasks/tasksApi', () => ({ getTaskSummary: h.getTaskSummary }));

const ADMIN: User = { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin' };
const REP: User = { id: 'u2', name: 'Ben Smith', email: 'ben@example.com', role: 'rep' };

function renderTopbar(
  user: User | null = ADMIN,
  summary: TaskSummary = { dueToday: 0, overdue: 0 },
) {
  h.useSession.mockReturnValue({ user, loading: false, logout: h.logout });
  h.useMeta.mockReturnValue({ accountName: () => 'Unknown' });
  h.getTaskSummary.mockResolvedValue(summary);
  return render(
    <MemoryRouter>
      <Topbar collapsed={false} />
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe('Topbar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when there is no session user', () => {
    const { container } = renderTopbar(null);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the global search box', () => {
    renderTopbar();

    expect(screen.getByLabelText('Global search')).toBeInTheDocument();
  });

  it('renders the user initials, name and role label', async () => {
    renderTopbar(ADMIN);

    expect(screen.getByText('AL')).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Administrator')).toBeInTheDocument();
    await waitFor(() => expect(h.getTaskSummary).toHaveBeenCalledTimes(1));
  });

  it('uses the role label of the signed-in role', () => {
    renderTopbar(REP);

    expect(screen.getByText('Sales Rep')).toBeInTheDocument();
  });

  it('links the inbox icon to the tasks page', () => {
    renderTopbar();

    expect(screen.getByRole('link', { name: 'Open tasks' })).toHaveAttribute('href', '/tasks');
  });

  it('hides the task badge when nothing is due', async () => {
    renderTopbar(ADMIN, { dueToday: 0, overdue: 0 });

    await waitFor(() => expect(h.getTaskSummary).toHaveBeenCalled());
    expect(screen.queryByText('5')).not.toBeInTheDocument();
  });

  it('sums due-today and overdue counts into the task badge', async () => {
    renderTopbar(ADMIN, { dueToday: 2, overdue: 3 });

    expect(await screen.findByText('5')).toBeInTheDocument();
  });

  it('keeps the menu closed until the account button is clicked', () => {
    renderTopbar();

    expect(screen.queryByText('Sign out')).not.toBeInTheDocument();
  });

  it('opens the account menu', async () => {
    const user = userEvent.setup();
    renderTopbar();

    await user.click(screen.getByRole('button', { name: /Ada Lovelace/ }));

    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('toggles the menu closed on a second click', async () => {
    const user = userEvent.setup();
    renderTopbar();

    const trigger = screen.getByRole('button', { name: /Ada Lovelace/ });
    await user.click(trigger);
    await user.click(trigger);

    expect(screen.queryByText('Sign out')).not.toBeInTheDocument();
  });

  it('closes the menu when a click lands outside of it', async () => {
    const user = userEvent.setup();
    renderTopbar();

    await user.click(screen.getByRole('button', { name: /Ada Lovelace/ }));
    expect(screen.getByText('Sign out')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByText('Sign out')).not.toBeInTheDocument();
  });

  it('calls logout when Sign out is clicked', async () => {
    const user = userEvent.setup();
    renderTopbar();

    await user.click(screen.getByRole('button', { name: /Ada Lovelace/ }));
    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(h.logout).toHaveBeenCalledTimes(1);
  });
});
