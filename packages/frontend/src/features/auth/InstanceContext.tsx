import { createContext, useContext, type ReactNode } from 'react';
import { useInstanceStatus, type InstanceStatus } from './useInstanceStatus';

const InstanceContext = createContext<InstanceStatus | null>(null);

/**
 * Hoists the single `/api/health` probe into the authenticated shell so window
 * chrome (the sidebar imprint) can read deployment-level facts without every
 * consumer issuing its own request. The login screen keeps calling
 * `useInstanceStatus` directly — it is a separate route and is never mounted
 * alongside the shell, so no probe is duplicated.
 */
export function InstanceProvider({ children }: { children: ReactNode }) {
  const status = useInstanceStatus();

  return <InstanceContext.Provider value={status}>{children}</InstanceContext.Provider>;
}

/** Instance probe state (GET /api/health). Only valid inside the app shell. */
export function useInstance(): InstanceStatus {
  const ctx = useContext(InstanceContext);
  if (!ctx) throw new Error('useInstance must be used within InstanceProvider');
  return ctx;
}
