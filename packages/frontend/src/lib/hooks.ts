import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

export interface QueryState<T> {
  data: T | null;
  /** True only while the *first* load has no data to show yet. */
  loading: boolean;
  /** True while any request for this query is in flight, incl. background refreshes. */
  isFetching: boolean;
  error: string | null;
  /** True when `error` is the generic fallback (the rejection was not an Error). */
  errorIsFallback: boolean;
  refetch: () => Promise<T>;
  /**
   * Patch the query's local data (optimistic updates, response patching)
   * without a network round-trip. Pass a value or an updater function.
   */
  setData: Dispatch<SetStateAction<T | null>>;
}

export interface QueryOptions {
  /**
   * Opt-in persistent cache key. Enables cross-mount reuse (stale-while-
   * revalidate: cached data renders immediately, then the effect refreshes)
   * and deduplication of concurrent identical requests.
   */
  cacheKey?: string;
}

interface CacheEntry {
  data: unknown;
}

/** Module-level cache: survives unmounts so revisiting a query is instant. */
const queryCache = new Map<string, CacheEntry>();

/** In-flight requests keyed by cacheKey, so concurrent consumers share one request. */
const inFlightQueries = new Map<string, Promise<unknown>>();

/**
 * Clears the module-level cache and any in-flight entries. Intended for tests:
 * cached data — and a never-settling request — would otherwise leak between
 * cases that share a cache key.
 */
export function resetQueryCache(): void {
  queryCache.clear();
  inFlightQueries.clear();
}

const GENERIC_ERROR_MESSAGE = 'Request failed';

/**
 * Normalizes a rejection into a display message plus whether it is the generic
 * fallback. Pages use `isFallback` to substitute a page-specific message when
 * the rejection was not an Error (so `error.message` carries no information).
 */
function normalizeError(e: unknown): { message: string; isFallback: boolean } {
  return e instanceof Error
    ? { message: e.message, isFallback: false }
    : { message: GENERIC_ERROR_MESSAGE, isFallback: true };
}

function isAbortError(e: unknown): boolean {
  return (
    (e instanceof DOMException && e.name === 'AbortError') ||
    (typeof e === 'object' && e !== null && (e as { name?: string }).name === 'AbortError')
  );
}

export function useQuery<T>(
  fetcher: (signal?: AbortSignal) => Promise<T>,
  deps: readonly unknown[] = [],
  options: QueryOptions = {},
): QueryState<T> {
  const { cacheKey } = options;

  // Seed from the persistent cache so a remount renders instantly, then the
  // effect below revalidates in the background (stale-while-revalidate).
  const [data, setData] = useState<T | null>(() => {
    if (cacheKey) {
      const hit = queryCache.get(cacheKey);
      if (hit) return hit.data as T;
    }
    return null;
  });
  const [loading, setLoading] = useState(data === null);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorIsFallback, setErrorIsFallback] = useState(false);

  // Keep the latest fetcher without invalidating callbacks. Assignments happen
  // in an effect — never during render — per the React Compiler ref rules.
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    let active = true;
    let settled = false;

    let request: Promise<T>;
    if (cacheKey) {
      // Share one request across concurrent consumers of a cached query.
      const pending = inFlightQueries.get(cacheKey);
      if (pending) {
        request = pending as Promise<T>;
      } else {
        request = Promise.resolve(fetcherRef.current(signal))
          .then((d) => {
            queryCache.set(cacheKey, { data: d });
            inFlightQueries.delete(cacheKey);
            return d;
          })
          .catch((e: unknown) => {
            inFlightQueries.delete(cacheKey);
            throw e;
          });
        inFlightQueries.set(cacheKey, request);
      }
    } else {
      request = Promise.resolve(fetcherRef.current(signal));
    }

    request
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e: unknown) => {
        // Aborted superseded requests are expected, not errors.
        if (active && !isAbortError(e) && !signal.aborted) {
          const normalized = normalizeError(e);
          setError(normalized.message);
          setErrorIsFallback(normalized.isFallback);
        }
      })
      .finally(() => {
        settled = true;
        if (active) {
          setIsFetching(false);
          setLoading(false);
        }
      });

    // Flag the fetch in a microtask: it still lands before the browser paints
    // (so busy states never flicker), but the effect body itself stays free of
    // synchronous setState (react-hooks/set-state-in-effect). Skipped when the
    // request already settled synchronously or the effect was superseded.
    queueMicrotask(() => {
      if (active && !settled) {
        setIsFetching(true);
        setError(null);
        setErrorIsFallback(false);
      }
    });

    return () => {
      active = false;
      // Cancel the network work for superseded/unmounted queries. Fetchers
      // that accept a signal forward it to `fetch`; the `active` flag guards
      // state either way.
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are the caller's query inputs
  }, deps);

  const refetch = useCallback((): Promise<T> => {
    setIsFetching(true);
    setError(null);
    setErrorIsFallback(false);
    return Promise.resolve(fetcherRef.current())
      .then((d) => {
        if (cacheKey) queryCache.set(cacheKey, { data: d });
        if (mountedRef.current) setData(d);
        return d;
      })
      .catch((e: unknown) => {
        if (mountedRef.current && !isAbortError(e)) {
          const normalized = normalizeError(e);
          setError(normalized.message);
          setErrorIsFallback(normalized.isFallback);
        }
        throw e;
      })
      .finally(() => {
        if (mountedRef.current) setIsFetching(false);
      });
  }, [cacheKey]);

  return { data, loading, isFetching, error, errorIsFallback, refetch, setData };
}

export interface MutationResult<TArgs extends unknown[], TRes> {
  /** Invokes the mutation; re-throws so callers can chain `.then/.catch`. */
  run: (...args: TArgs) => Promise<TRes>;
  loading: boolean;
  /** Last failure message (null while idle or successful). */
  error: string | null;
  /** True when `error` is the generic fallback (the rejection was not an Error). */
  errorIsFallback: boolean;
  /** Clears the error state. */
  reset: () => void;
}

/**
 * Standard wrapper for submissions/actions (POST/PATCH/DELETE). Exposes a
 * stable `run` (safe to close over in effects and handlers), a loading flag for
 * busy buttons/spinners, and an error message that pages can surface with the
 * shared Feedback/ErrorBanner component.
 */
export function useMutation<TRes, TArgs extends unknown[] = []>(
  fn: (...args: TArgs) => Promise<TRes>,
): MutationResult<TArgs, TRes> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorIsFallback, setErrorIsFallback] = useState(false);

  // Keep the latest fn without invalidating `run`, so `run` can be used as a
  // stable callback identity across renders. The assignment lives in an effect
  // (not during render) per the React Compiler ref rules.
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  const run = useCallback(async (...args: TArgs): Promise<TRes> => {
    setLoading(true);
    setError(null);
    setErrorIsFallback(false);
    try {
      return await fnRef.current(...args);
    } catch (e: unknown) {
      const normalized = normalizeError(e);
      setError(normalized.message);
      setErrorIsFallback(normalized.isFallback);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setError(null);
    setErrorIsFallback(false);
  }, []);

  return { run, loading, error, errorIsFallback, reset };
}
