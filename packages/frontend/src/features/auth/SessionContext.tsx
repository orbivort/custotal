import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { User } from '../../types/domain';
import { setUnauthorizedHandler } from '../../lib/sessionEvents';
import { fetchMe, login as loginRequest, logout as logoutRequest } from './authApi';

interface SessionValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  // Any authenticated request that returns 401 (expired or revoked session)
  // clears the user, so RequireAuth sends them back to the sign-in screen with
  // the intended destination preserved.
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setUser(await loginRequest({ email, password }));
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest().catch(() => undefined);
    setUser(null);
  }, []);

  // Memoized so provider re-renders (e.g. after fetchMe resolves) do not hand
  // every useSession consumer a fresh object identity.
  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
