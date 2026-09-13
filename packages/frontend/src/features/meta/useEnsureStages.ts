// One-shot provisioning of the default pipeline.
//
// Both the New Deal form and the Pipeline Stages view call this hook on mount.
// The module-level guard makes the request fire only once per app session no
// matter how many consumers mount, and the server call is idempotent besides —
// an already-configured pipeline is returned untouched (no duplication, no
// overwriting).
import { useEffect } from 'react';
import { useMeta } from './MetaContext';
import { ensureStages } from './metaApi';

interface EnsureOutcome {
  created: boolean;
}

let outcome: EnsureOutcome | null = null;
let inFlight: Promise<EnsureOutcome> | null = null;
let refreshed = false;

function ensureStagesOnce(): Promise<EnsureOutcome> {
  if (outcome) return Promise.resolve(outcome);
  if (!inFlight) {
    inFlight = ensureStages()
      .then((result) => {
        outcome = { created: result.created };
        return outcome;
      })
      .catch((error: unknown) => {
        // Best-effort: leave the guard open so a later view can retry.
        inFlight = null;
        throw error;
      });
  }
  return inFlight;
}

/** Clears the one-shot guard. Intended for tests. */
export function resetEnsureStages(): void {
  outcome = null;
  inFlight = null;
  refreshed = false;
}

/**
 * Ensures the default pipeline exists, re-publishing metadata exactly once when
 * this call is the one that created it. Failures are swallowed so the form (and
 * the stages page) stay usable even if provisioning cannot run.
 */
export function useEnsureStages(): void {
  const { refresh } = useMeta();

  useEffect(() => {
    let active = true;
    ensureStagesOnce()
      .then((result) => {
        if (active && result.created && !refreshed) {
          refreshed = true;
          void refresh();
        }
      })
      .catch(() => {
        // Provisioning is best-effort; nothing else to do here.
      });
    return () => {
      active = false;
    };
  }, [refresh]);
}
