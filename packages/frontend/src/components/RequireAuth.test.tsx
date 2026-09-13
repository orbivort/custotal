// Component tests for RequireAuth, the route guard that gates the app shell.
//
// SessionContext is mocked so each branch (loading / anonymous / authenticated)
// can be driven directly. Routing itself stays real: the guard renders inside a
// MemoryRouter with a `/login` route, so a redirect is asserted by the rendered
// destination rather than by spying on Navigate.
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../types/domain';
import { RequireAuth } from './RequireAuth';

const h = vi.hoisted(() => ({ useSession: vi.fn() }));

vi.mock('../features/auth/SessionContext', () => ({ useSession: h.useSession }));

const USER: User = { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin' };

/** Destination route that reports the location state the guard forwarded. */
function LoginProbe() {
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | null)?.from;
  return (
    <div>
      <p>login page</p>
      <p>{from ? `from:${from.pathname}` : 'no-state'}</p>
    </div>
  );
}

function renderGuarded(
  session: { user: User | null; loading: boolean },
  initialEntry = '/protected',
) {
  h.useSession.mockReturnValue(session);
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/protected"
          element={
            <RequireAuth>
              <p>secret area</p>
            </RequireAuth>
          }
        />
        <Route path="/login" element={<LoginProbe />} />
        <Route path="/change-password" element={<p>change password page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe('RequireAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the loading block while the session is being restored', () => {
    renderGuarded({ user: null, loading: true });

    expect(screen.getByText('Restoring session…')).toBeInTheDocument();
    expect(screen.queryByText('secret area')).not.toBeInTheDocument();
    expect(screen.queryByText('login page')).not.toBeInTheDocument();
  });

  it('redirects to /login when there is no user', () => {
    renderGuarded({ user: null, loading: false });

    expect(screen.getByText('login page')).toBeInTheDocument();
    expect(screen.queryByText('secret area')).not.toBeInTheDocument();
  });

  it('forwards the original location so login can send the user back', () => {
    renderGuarded({ user: null, loading: false });

    expect(screen.getByText('from:/protected')).toBeInTheDocument();
  });

  it('renders the children once a user is present', () => {
    renderGuarded({ user: USER, loading: false });

    expect(screen.getByText('secret area')).toBeInTheDocument();
    expect(screen.queryByText('login page')).not.toBeInTheDocument();
  });

  it('prefers the loading state over an already-known user', () => {
    renderGuarded({ user: USER, loading: true });

    expect(screen.getByText('Restoring session…')).toBeInTheDocument();
    expect(screen.queryByText('secret area')).not.toBeInTheDocument();
  });

  it('redirects users holding a temporary credential to the rotation screen', () => {
    renderGuarded({
      user: { ...USER, mustChangePassword: true },
      loading: false,
    });

    expect(screen.getByText('change password page')).toBeInTheDocument();
    expect(screen.queryByText('secret area')).not.toBeInTheDocument();
  });

  it('allows temporary-credential holders to stay on the rotation screen', () => {
    renderGuarded(
      { user: { ...USER, mustChangePassword: true }, loading: false },
      '/change-password',
    );

    expect(screen.getByText('change password page')).toBeInTheDocument();
  });
});
