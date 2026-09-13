// Component/hook tests for MetaContext.
//
// The metadata API module is mocked so the provider logic is tested in
// isolation: boot-time fetch, derived lookup helpers, the open-stage filter,
// and the refresh() wrapper that keeps last-known-good data on failure.
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Stage, User } from '../../types/domain';
import { resetQueryCache } from '../../lib/hooks';
import { MetaProvider, useMeta } from './MetaContext';
import type { AccountMeta, MetaPayload } from './metaApi';

const h = vi.hoisted(() => ({
  fetchMeta: vi.fn(),
}));

vi.mock('./metaApi', () => ({ fetchMeta: h.fetchMeta }));

const USERS: User[] = [
  { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin' },
  { id: 'u2', name: 'Ben Smith', email: 'ben@example.com', role: 'rep' },
];

const STAGES: Stage[] = [
  { id: 's1', name: 'Qualified', order: 1, winProbability: 20, classification: 'open' },
  { id: 's2', name: 'Proposal', order: 2, winProbability: 60, classification: 'open' },
  { id: 's3', name: 'Won', order: 3, winProbability: 100, classification: 'won' },
  { id: 's4', name: 'Lost', order: 4, winProbability: 0, classification: 'lost' },
];

const ACCOUNTS: AccountMeta[] = [
  { id: 'a1', name: 'Acme Corp', ownerId: 'u1' },
  { id: 'a2', name: 'Globex', ownerId: 'u2' },
];

const PAYLOAD: MetaPayload = { users: USERS, stages: STAGES, accounts: ACCOUNTS };

/** Wraps the hook under test in the provider under test. */
function wrapper({ children }: { children: ReactNode }) {
  return <MetaProvider>{children}</MetaProvider>;
}

afterEach(() => cleanup());

describe('MetaProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetQueryCache();
    h.fetchMeta.mockResolvedValue(PAYLOAD);
  });

  it('fetches meta once on mount and exposes the raw collections', async () => {
    const { result } = renderHook(() => useMeta(), { wrapper });

    expect(result.current.users).toEqual([]);
    expect(result.current.stages).toEqual([]);
    expect(result.current.accounts).toEqual([]);

    await waitFor(() => expect(result.current.users).toHaveLength(2));
    expect(h.fetchMeta).toHaveBeenCalledTimes(1);
    expect(result.current.users).toBe(USERS);
    expect(result.current.stages).toBe(STAGES);
    expect(result.current.accounts).toBe(ACCOUNTS);
  });

  it('renders its children while the metadata loads', async () => {
    render(
      <MetaProvider>
        <p>dashboard</p>
      </MetaProvider>,
    );

    expect(screen.getByText('dashboard')).toBeInTheDocument();
    await waitFor(() => expect(h.fetchMeta).toHaveBeenCalledTimes(1));
  });

  it('exposes only stages classified as open in openStages', async () => {
    const { result } = renderHook(() => useMeta(), { wrapper });

    await waitFor(() => expect(result.current.openStages).toHaveLength(2));
    expect(result.current.openStages.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(result.current.openStages.every((s) => s.classification === 'open')).toBe(true);
  });

  it('resolves names for known ids', async () => {
    const { result } = renderHook(() => useMeta(), { wrapper });

    await waitFor(() => expect(result.current.users).toHaveLength(2));
    expect(result.current.userName('u1')).toBe('Ada Lovelace');
    expect(result.current.userName('u2')).toBe('Ben Smith');
    expect(result.current.accountName('a1')).toBe('Acme Corp');
    expect(result.current.accountName('a2')).toBe('Globex');
    expect(result.current.stageName('s1')).toBe('Qualified');
    expect(result.current.stageName('s3')).toBe('Won');
  });

  it('falls back to "Unknown" for missing, empty, or omitted ids', async () => {
    const { result } = renderHook(() => useMeta(), { wrapper });

    await waitFor(() => expect(result.current.users).toHaveLength(2));
    expect(result.current.userName('nope')).toBe('Unknown');
    expect(result.current.userName('')).toBe('Unknown');
    expect(result.current.userName()).toBe('Unknown');
    expect(result.current.accountName('nope')).toBe('Unknown');
    expect(result.current.stageName('nope')).toBe('Unknown');
  });

  it('falls back to "Unknown" for every id while the payload is still loading', () => {
    h.fetchMeta.mockReturnValueOnce(new Promise(() => undefined));

    const { result } = renderHook(() => useMeta(), { wrapper });

    expect(result.current.userName('u1')).toBe('Unknown');
    expect(result.current.accountName('a1')).toBe('Unknown');
    expect(result.current.stageName('s1')).toBe('Unknown');
    expect(result.current.openStages).toEqual([]);
  });

  it('stageById returns the matching stage, or undefined when unknown', async () => {
    const { result } = renderHook(() => useMeta(), { wrapper });

    await waitFor(() => expect(result.current.stages).toHaveLength(4));
    expect(result.current.stageById('s2')).toBe(STAGES[1]);
    expect(result.current.stageById('nope')).toBeUndefined();
  });

  it('degrades to empty metadata when the initial fetch rejects', async () => {
    h.fetchMeta.mockRejectedValueOnce(new Error("Can't reach the server."));

    const { result } = renderHook(() => useMeta(), { wrapper });

    await waitFor(() => expect(h.fetchMeta).toHaveBeenCalledTimes(1));
    expect(result.current.users).toEqual([]);
    expect(result.current.stages).toEqual([]);
    expect(result.current.accounts).toEqual([]);
    expect(result.current.openStages).toEqual([]);
    expect(result.current.stageById('s1')).toBeUndefined();
  });

  describe('refresh', () => {
    it('re-fetches meta and republishes the updated payload', async () => {
      const { result } = renderHook(() => useMeta(), { wrapper });
      await waitFor(() => expect(result.current.stages).toHaveLength(4));

      const updated: MetaPayload = {
        ...PAYLOAD,
        stages: [
          ...STAGES,
          { id: 's5', name: 'Negotiation', order: 5, winProbability: 80, classification: 'open' },
        ],
      };
      h.fetchMeta.mockResolvedValueOnce(updated);

      await act(async () => {
        await result.current.refresh();
      });

      expect(h.fetchMeta).toHaveBeenCalledTimes(2);
      await waitFor(() => expect(result.current.stages).toHaveLength(5));
      expect(result.current.stageName('s5')).toBe('Negotiation');
      expect(result.current.openStages).toHaveLength(3);
    });

    it('swallows refresh failures and keeps the last known-good metadata', async () => {
      const { result } = renderHook(() => useMeta(), { wrapper });
      await waitFor(() => expect(result.current.users).toHaveLength(2));

      h.fetchMeta.mockRejectedValueOnce(new Error('Session expired'));

      await act(async () => {
        await expect(result.current.refresh()).resolves.toBeUndefined();
      });

      expect(h.fetchMeta).toHaveBeenCalledTimes(2);
      expect(result.current.users).toBe(USERS);
      expect(result.current.userName('u1')).toBe('Ada Lovelace');
      expect(result.current.stageName('s1')).toBe('Qualified');
    });
  });
});

describe('useMeta', () => {
  it('throws a descriptive error when used outside MetaProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => renderHook(() => useMeta())).toThrow('useMeta must be used within MetaProvider');

    consoleError.mockRestore();
  });
});
