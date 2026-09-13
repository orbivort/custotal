// Hook tests for useInstanceStatus.
//
// fetchInstanceInfo is mocked to exercise the three documented states
// (loading -> ok, loading -> unreachable) and the unmount race guard that
// prevents setState after the component goes away.
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstanceInfo } from '../../types/domain';
import { useInstanceStatus } from './useInstanceStatus';

const h = vi.hoisted(() => ({
  fetchInstanceInfo: vi.fn(),
}));

vi.mock('./authApi', () => ({ fetchInstanceInfo: h.fetchInstanceInfo }));

const INFO: InstanceInfo = {
  orgName: 'Custotal',
  version: '0.1.0',
  environment: 'development',
  hostname: 'localhost',
  allowPasswordReset: true,
  setupRequired: false,
};

afterEach(() => cleanup());

describe('useInstanceStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts in the loading state before the probe resolves', () => {
    h.fetchInstanceInfo.mockReturnValueOnce(new Promise(() => undefined));

    const { result } = renderHook(() => useInstanceStatus());

    expect(result.current).toEqual({ state: 'loading' });
  });

  it('transitions to the ok state with the fetched instance info', async () => {
    h.fetchInstanceInfo.mockResolvedValueOnce(INFO);

    const { result } = renderHook(() => useInstanceStatus());

    await waitFor(() => expect(result.current.state).toBe('ok'));
    expect(result.current).toEqual({ state: 'ok', info: INFO });
    expect(h.fetchInstanceInfo).toHaveBeenCalledTimes(1);
  });

  it('transitions to the unreachable state when the probe fails', async () => {
    h.fetchInstanceInfo.mockRejectedValueOnce(new Error('refused'));

    const { result } = renderHook(() => useInstanceStatus());

    await waitFor(() => expect(result.current.state).toBe('unreachable'));
    expect(result.current).not.toHaveProperty('info');
  });

  it('ignores a late probe result after unmount', async () => {
    let resolve!: (value: InstanceInfo) => void;
    h.fetchInstanceInfo.mockReturnValueOnce(new Promise<InstanceInfo>((r) => (resolve = r)));

    const { result, unmount } = renderHook(() => useInstanceStatus());
    unmount();

    await act(async () => {
      resolve(INFO);
    });

    expect(result.current).toEqual({ state: 'loading' });
  });
});
