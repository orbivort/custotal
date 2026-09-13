// Unit tests for the one-shot pipeline provisioning hook.
//
// metaApi and MetaContext are mocked so the tests exercise only the module-level
// once-only guard and the refresh bookkeeping: the request must fire once per
// session, and metadata is re-published only when this call created the pipeline.
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetEnsureStages, useEnsureStages } from './useEnsureStages';

const h = vi.hoisted(() => ({
  ensureStages: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('./metaApi', () => ({ ensureStages: h.ensureStages }));
vi.mock('./MetaContext', () => ({ useMeta: () => ({ refresh: h.refresh }) }));

afterEach(() => {
  cleanup();
  resetEnsureStages();
});

describe('useEnsureStages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.refresh.mockResolvedValue(undefined);
  });

  it('provisions the pipeline only once across concurrent consumers', async () => {
    h.ensureStages.mockResolvedValue({ created: false, items: [] });

    renderHook(() => useEnsureStages());
    renderHook(() => useEnsureStages());

    await waitFor(() => expect(h.ensureStages).toHaveBeenCalledTimes(1));
  });

  it('re-publishes metadata once when it created the defaults', async () => {
    h.ensureStages.mockResolvedValue({ created: true, items: [] });

    renderHook(() => useEnsureStages());
    renderHook(() => useEnsureStages());

    await waitFor(() => expect(h.refresh).toHaveBeenCalledTimes(1));
    expect(h.ensureStages).toHaveBeenCalledTimes(1);
  });

  it('does not refresh when the pipeline already exists', async () => {
    h.ensureStages.mockResolvedValue({ created: false, items: [] });

    renderHook(() => useEnsureStages());

    await waitFor(() => expect(h.ensureStages).toHaveBeenCalledTimes(1));
    expect(h.refresh).not.toHaveBeenCalled();
  });

  it('stays silent when provisioning fails', async () => {
    h.ensureStages.mockRejectedValue(new Error('unreachable'));

    renderHook(() => useEnsureStages());

    await waitFor(() => expect(h.ensureStages).toHaveBeenCalledTimes(1));
    expect(h.refresh).not.toHaveBeenCalled();
  });
});
