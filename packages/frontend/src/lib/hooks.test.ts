// Unit tests for the hand-rolled data layer in `lib/hooks`.
//
// The real hook runs under React Testing Library's renderHook so loading /
// isFetching / cache transitions are genuine. Fetchers are replaced with
// deferred promises so each race (superseded requests, background refetch,
// cache revalidation) can be driven deterministically.
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useMutation, useQuery } from './hooks';

/** Manually-resolved promise factory for driving async races in tests. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useQuery', () => {
  it('resolves data and clears the loading flag', async () => {
    const { result } = renderHook(() => useQuery(() => Promise.resolve('payload')));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data).toBe('payload'));
    expect(result.current.loading).toBe(false);
    expect(result.current.isFetching).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('surfaces fetch errors without setting data', async () => {
    const { result } = renderHook(() => useQuery(() => Promise.reject(new Error('boom'))));

    await waitFor(() => expect(result.current.error).toBe('boom'));
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('keeps previous data visible while the next query loads', async () => {
    const gate = deferred<string>();
    const { result, rerender } = renderHook(
      ({ dep }: { dep: number }) =>
        useQuery<string>(() => (dep === 1 ? Promise.resolve('first') : gate.promise), [dep]),
      { initialProps: { dep: 1 } },
    );
    await waitFor(() => expect(result.current.data).toBe('first'));

    await act(async () => {
      rerender({ dep: 2 });
    });
    expect(result.current.data).toBe('first');
    expect(result.current.loading).toBe(false);
    expect(result.current.isFetching).toBe(true);

    act(() => gate.resolve('second'));
    await waitFor(() => expect(result.current.data).toBe('second'));
    expect(result.current.isFetching).toBe(false);
  });

  it('aborts superseded requests when deps change or the component unmounts', () => {
    const signals: (AbortSignal | undefined)[] = [];
    const { rerender, unmount } = renderHook(
      ({ dep }: { dep: number }) =>
        useQuery<string>(
          (signal) => {
            signals.push(signal);
            return new Promise<string>(() => {});
          },
          [dep],
        ),
      { initialProps: { dep: 1 } },
    );

    rerender({ dep: 2 });
    expect(signals).toHaveLength(2);
    expect(signals[0]!.aborted).toBe(true);
    expect(signals[1]!.aborted).toBe(false);

    unmount();
    expect(signals[1]!.aborted).toBe(true);
  });

  it('serves cached data instantly on remount, then revalidates', async () => {
    const first = renderHook(() =>
      useQuery(() => Promise.resolve({ version: 1 }), [], { cacheKey: 'cache-test-1' }),
    );
    await waitFor(() => expect(first.result.current.data).toEqual({ version: 1 }));
    first.unmount();

    // A gated fetcher keeps the revalidation in flight so `isFetching` can be
    // asserted without racing the fetch's own settle microtask.
    const gate = deferred<{ version: number }>();
    const second = renderHook(() => useQuery(() => gate.promise, [], { cacheKey: 'cache-test-1' }));
    // Cached payload renders immediately — no loading flash.
    expect(second.result.current.data).toEqual({ version: 1 });
    expect(second.result.current.loading).toBe(false);
    await act(async () => {}); // flush the pre-paint fetch flag
    expect(second.result.current.isFetching).toBe(true);

    act(() => gate.resolve({ version: 2 }));
    await waitFor(() => expect(second.result.current.data).toEqual({ version: 2 }));
    second.unmount();
  });

  it('deduplicates concurrent requests sharing a cache key', async () => {
    const gate = deferred<string>();
    const fetcher = vi.fn(() => gate.promise);

    const a = renderHook(() => useQuery<string>(fetcher, [], { cacheKey: 'cache-test-2' }));
    const b = renderHook(() => useQuery<string>(fetcher, [], { cacheKey: 'cache-test-2' }));

    expect(fetcher).toHaveBeenCalledTimes(1);

    act(() => gate.resolve('shared'));
    await waitFor(() => expect(a.result.current.data).toBe('shared'));
    await waitFor(() => expect(b.result.current.data).toBe('shared'));
    a.unmount();
    b.unmount();
  });

  it('refetches in the background without flipping loading back on', async () => {
    let response: Promise<string> = Promise.resolve('first');
    const { result } = renderHook(() => useQuery<string>(() => response));
    await waitFor(() => expect(result.current.data).toBe('first'));

    const gate = deferred<string>();
    response = gate.promise;
    act(() => {
      void result.current.refetch();
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.isFetching).toBe(true);
    expect(result.current.data).toBe('first');

    act(() => gate.resolve('second'));
    await waitFor(() => expect(result.current.data).toBe('second'));
    expect(result.current.isFetching).toBe(false);
  });

  it('ignores aborted superseded responses instead of surfacing errors', async () => {
    const gates = [deferred<string>(), deferred<string>()];
    let call = 0;
    const { result, rerender } = renderHook(
      ({ dep }: { dep: number }) =>
        useQuery<string>(() => gates[Math.min(call++, gates.length - 1)].promise, [dep]),
      { initialProps: { dep: 1 } },
    );

    rerender({ dep: 2 });
    act(() => gates[0].reject(new Error('stale failure')));
    act(() => gates[1].resolve('fresh'));

    await waitFor(() => expect(result.current.data).toBe('fresh'));
    expect(result.current.error).toBeNull();
  });
});

describe('useMutation', () => {
  it('exposes loading transitions and the resolved value', async () => {
    const { result } = renderHook(() =>
      useMutation((v: string) => Promise.resolve(v.toUpperCase())),
    );

    expect(result.current.loading).toBe(false);
    let value = '';
    await act(async () => {
      value = await result.current.run('ok');
    });
    expect(value).toBe('OK');
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('records the failure message and re-throws', async () => {
    const { result } = renderHook(() => useMutation(() => Promise.reject(new Error('nope'))));

    await act(async () => {
      await expect(result.current.run()).rejects.toThrow('nope');
    });
    expect(result.current.error).toBe('nope');
    expect(result.current.loading).toBe(false);
  });

  it('clears the error on reset', async () => {
    const { result } = renderHook(() => useMutation(() => Promise.reject(new Error('nope'))));
    await act(async () => {
      await expect(result.current.run()).rejects.toThrow('nope');
    });
    expect(result.current.error).toBe('nope');

    act(() => result.current.reset());
    expect(result.current.error).toBeNull();
  });
});
