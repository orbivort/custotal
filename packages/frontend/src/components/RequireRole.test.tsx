// Component tests for RequireRole, the admin-only route guard.
//
// SessionContext is mocked and routing stays real, so the three guards
// (loading, anonymous, wrong role) are asserted through the rendered
// destination route.
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../types/domain';
import { RequireRole } from './RequireRole';

const h = vi.hoisted(() => ({ useSession: vi.fn() }));

vi.mock('../features/auth/SessionContext', () => ({ useSession: h.useSession }));

const ADMIN: User = { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin' };
const REP: User = { id: 'u2', name: 'Ben Smith', email: 'ben@example.com', role: 'rep' };

function renderGuarded(session: { user: User | null; loading: boolean }, role: 'admin' | 'rep') {
  h.useSession.mockReturnValue(session);
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route
          path="/admin"
          element={
            <RequireRole role={role}>
              <p>admin area</p>
            </RequireRole>
          }
        />
        <Route path="/login" element={<p>login page</p>} />
        <Route path="/" element={<p>home page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe('RequireRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the loading block while the session is being restored', () => {
    renderGuarded({ user: null, loading: true }, 'admin');

    expect(screen.getByText('Restoring session…')).toBeInTheDocument();
    expect(screen.queryByText('admin area')).not.toBeInTheDocument();
  });

  it('redirects anonymous visitors to /login', () => {
    renderGuarded({ user: null, loading: false }, 'admin');

    expect(screen.getByText('login page')).toBeInTheDocument();
    expect(screen.queryByText('home page')).not.toBeInTheDocument();
  });

  it('redirects a signed-in user with the wrong role to the home page', () => {
    renderGuarded({ user: REP, loading: false }, 'admin');

    expect(screen.getByText('home page')).toBeInTheDocument();
    expect(screen.queryByText('admin area')).not.toBeInTheDocument();
  });

  it('renders the children when the user has the required role', () => {
    renderGuarded({ user: ADMIN, loading: false }, 'admin');

    expect(screen.getByText('admin area')).toBeInTheDocument();
  });

  it('renders the children for a non-admin role when that role is required', () => {
    renderGuarded({ user: REP, loading: false }, 'rep');

    expect(screen.getByText('admin area')).toBeInTheDocument();
  });

  it('redirects an admin to home when a more restrictive route requires rep', () => {
    renderGuarded({ user: ADMIN, loading: false }, 'rep');

    expect(screen.getByText('home page')).toBeInTheDocument();
  });
});
