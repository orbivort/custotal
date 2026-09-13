// Component tests for SessionContext.
//
// The auth API module is mocked so the provider logic is tested in isolation:
// boot-time fetchMe, login state transfer, logout cleanup, and the useSession
// guard. Renders use a probe child that reads the context value.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../../types/domain';
import { SessionProvider, useSession } from './SessionContext';

const h = vi.hoisted(() => ({
  fetchMe: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('./authApi', () => ({
  fetchMe: h.fetchMe,
  login: h.login,
  logout: h.logout,
}));

const USER: User = { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin' };

/** Reads the session value and exposes it (plus mutations) to the test. */
function probe(onValue: (value: ReturnType<typeof useSession>) => void): ReactNode {
  function Probe() {
    const value = useSession();
    useEffect(() => {
      onValue(value);
    });
    return (
      <div>
        <span>{value.loading ? 'loading' : 'settled'}</span>
        <span>{value.user ? value.user.name : 'anonymous'}</span>
      </div>
    );
  }
  return (
    <SessionProvider>
      <Probe />
    </SessionProvider>
  );
}

afterEach(() => cleanup());

describe('SessionProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.fetchMe.mockRejectedValue(new Error('Not signed in'));
    h.login.mockResolvedValue(USER);
    h.logout.mockResolvedValue(undefined);
  });

  it('starts loading, then adopts the boot-time fetchMe user', async () => {
    let captured: ReturnType<typeof useSession> | undefined;
    h.fetchMe.mockResolvedValueOnce(USER);

    render(probe((v) => (captured = v)));

    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('settled')).toBeInTheDocument();
    expect(captured?.loading).toBe(false);
    expect(h.fetchMe).toHaveBeenCalledTimes(1);
  });

  it('falls back to an anonymous session when fetchMe rejects', async () => {
    render(probe(() => undefined));

    await waitFor(() => expect(screen.getByText('settled')).toBeInTheDocument());
    expect(screen.getByText('anonymous')).toBeInTheDocument();
  });

  it('login delegates to the API with the given credentials and stores the user', async () => {
    let captured: ReturnType<typeof useSession> | undefined;
    render(probe((v) => (captured = v)));
    await waitFor(() => expect(screen.getByText('settled')).toBeInTheDocument());

    await act(() => captured?.login('ada@example.com', 'secret'));

    expect(h.login).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'secret' });
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  });

  it('keeps the previous user when login rejects', async () => {
    let captured: ReturnType<typeof useSession> | undefined;
    render(probe((v) => (captured = v)));
    await waitFor(() => expect(screen.getByText('settled')).toBeInTheDocument());

    h.login.mockRejectedValueOnce(new Error('Invalid credentials'));
    await expect(act(() => captured?.login('ada@example.com', 'wrong'))).rejects.toThrow(
      'Invalid credentials',
    );

    expect(screen.getByText('anonymous')).toBeInTheDocument();
  });

  it('logout clears the user after calling the API', async () => {
    let captured: ReturnType<typeof useSession> | undefined;
    h.fetchMe.mockResolvedValueOnce(USER);
    render(probe((v) => (captured = v)));
    await screen.findByText('Ada Lovelace');

    await act(() => captured?.logout());

    expect(h.logout).toHaveBeenCalledTimes(1);
    expect(screen.getByText('anonymous')).toBeInTheDocument();
  });

  it('logout still clears the local session when the API call fails', async () => {
    let captured: ReturnType<typeof useSession> | undefined;
    h.fetchMe.mockResolvedValueOnce(USER);
    render(probe((v) => (captured = v)));
    await screen.findByText('Ada Lovelace');

    h.logout.mockRejectedValueOnce(new Error('Session already expired'));
    await act(() => captured?.logout());

    expect(h.logout).toHaveBeenCalledTimes(1);
    expect(screen.getByText('anonymous')).toBeInTheDocument();
  });
});

describe('useSession', () => {
  it('throws a descriptive error when rendered outside a SessionProvider', () => {
    function Orphan() {
      useSession();
      return null;
    }

    // Swallow the expected error so the test does not pollute the console.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Orphan />)).toThrow('useSession must be used within SessionProvider');
    consoleError.mockRestore();
  });
});
