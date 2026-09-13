import { useEffect, useState } from 'react';
import type { AppEnvironment, InstanceInfo } from '../../types/domain';
import { fetchInstanceInfo } from './authApi';

export type Environment = AppEnvironment;

export type InstanceStatus =
  { state: 'loading' } | { state: 'ok'; info: InstanceInfo } | { state: 'unreachable' };

/**
 * Probes the instance on mount so the login screen can distinguish three
 * self-hosted realities: the server is reachable, the server is unreachable,
 * or first-run setup still needs to be completed.
 */
export function useInstanceStatus(): InstanceStatus {
  const [status, setStatus] = useState<InstanceStatus>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetchInstanceInfo()
      .then((info) => {
        if (!cancelled) setStatus({ state: 'ok', info });
      })
      .catch(() => {
        if (!cancelled) setStatus({ state: 'unreachable' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
