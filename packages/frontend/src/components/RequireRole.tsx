import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import type { Role } from '../types/domain';
import { useSession } from '../features/auth/SessionContext';
import { LoadingBlock } from './ui/Feedback';

export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading } = useSession();

  if (loading) {
    return <LoadingBlock label="Restoring session…" />;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (user.role !== role) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
