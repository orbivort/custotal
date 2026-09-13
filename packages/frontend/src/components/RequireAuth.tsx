import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useSession } from '../features/auth/SessionContext';
import { LoadingBlock } from './ui/Feedback';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useSession();
  const location = useLocation();

  if (loading) {
    return <LoadingBlock label="Restoring session…" />;
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  // Forced credential rotation: users holding a temporary credential (their
  // invitation email could not be delivered) must set a real password first.
  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  return <>{children}</>;
}
