// Component tests for InstanceContext.
//
// useInstanceStatus is mocked so the provider/hook wiring is tested in
// isolation: InstanceProvider must forward whatever the probe hook returns to
// consumers, and useInstance must read that value or fail loudly outside the
// provider. Renders use a probe child that reads the context value.
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstanceInfo } from '../../types/domain';
import { InstanceProvider, useInstance } from './InstanceContext';
import type { InstanceStatus } from './useInstanceStatus';

const h = vi.hoisted(() => ({
  useInstanceStatus: vi.fn(),
}));

vi.mock('./useInstanceStatus', () => ({ useInstanceStatus: h.useInstanceStatus }));

const INFO: InstanceInfo = {
  orgName: 'Custotal',
  version: '0.1.0',
  environment: 'development',
  hostname: 'localhost',
  allowPasswordReset: true,
  setupRequired: false,
};

/** Renders the provider with a probe child that surfaces the context value. */
function renderWithProbe(onValue: (value: InstanceStatus) => void): ReactNode {
  function Probe() {
    const value = useInstance();
    onValue(value);
    return <span data-testid="state">{value.state}</span>;
  }
  return (
    <InstanceProvider>
      <Probe />
    </InstanceProvider>
  );
}

afterEach(() => cleanup());

describe('InstanceProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards the loading status from useInstanceStatus to consumers', () => {
    h.useInstanceStatus.mockReturnValue({ state: 'loading' });

    render(renderWithProbe(() => undefined));

    expect(screen.getByTestId('state')).toHaveTextContent('loading');
    expect(h.useInstanceStatus).toHaveBeenCalledTimes(1);
  });

  it('forwards the ok status with the fetched instance info', () => {
    let captured: InstanceStatus | undefined;
    h.useInstanceStatus.mockReturnValue({ state: 'ok', info: INFO });

    render(renderWithProbe((v) => (captured = v)));

    expect(screen.getByTestId('state')).toHaveTextContent('ok');
    expect(captured).toEqual({ state: 'ok', info: INFO });
  });

  it('forwards the unreachable status to consumers', () => {
    let captured: InstanceStatus | undefined;
    h.useInstanceStatus.mockReturnValue({ state: 'unreachable' });

    render(renderWithProbe((v) => (captured = v)));

    expect(screen.getByTestId('state')).toHaveTextContent('unreachable');
    expect(captured).toEqual({ state: 'unreachable' });
  });

  it('renders its children inside the provider', () => {
    h.useInstanceStatus.mockReturnValue({ state: 'loading' });

    render(
      <InstanceProvider>
        <p>shell chrome</p>
      </InstanceProvider>,
    );

    expect(screen.getByText('shell chrome')).toBeInTheDocument();
  });

  it('calls the probe hook once per mount', () => {
    h.useInstanceStatus.mockReturnValue({ state: 'loading' });

    const { rerender } = render(renderWithProbe(() => undefined));
    rerender(renderWithProbe(() => undefined));

    expect(h.useInstanceStatus).toHaveBeenCalledTimes(2);
  });
});

describe('useInstance', () => {
  it('throws a descriptive error when rendered outside an InstanceProvider', () => {
    function Orphan() {
      useInstance();
      return null;
    }

    // Swallow the expected error so the test does not pollute the console.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Orphan />)).toThrow('useInstance must be used within InstanceProvider');
    consoleError.mockRestore();
  });
});
