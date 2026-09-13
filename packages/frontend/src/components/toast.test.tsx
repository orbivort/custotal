// Component tests for the toast system (ToastProvider + useToast).
//
// The provider owns a 3600ms auto-dismiss timer, so fake timers drive the
// timing assertions; interactions use fireEvent to stay compatible with them.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from './toast';

/** Consumer that exposes `show` for each tone plus the default. */
function ToastHarness() {
  const { show } = useToast();
  return (
    <div>
      <p>harness</p>
      <button type="button" onClick={() => show('Saved!', 'success')}>
        success
      </button>
      <button type="button" onClick={() => show('Boom', 'error')}>
        error
      </button>
      <button type="button" onClick={() => show('Heads up')}>
        default
      </button>
    </div>
  );
}

function renderProvider() {
  return render(
    <ToastProvider>
      <ToastHarness />
    </ToastProvider>,
  );
}

/** The wrapper element carrying the tone classes for a given message. */
function toastFor(message: string): HTMLElement | null {
  return screen.getByText(message).closest('div');
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useToast', () => {
  it('falls back to a no-op show outside of a provider', () => {
    function Orphan() {
      const { show } = useToast();
      return (
        <button type="button" onClick={() => show('ignored')}>
          show
        </button>
      );
    }
    render(<Orphan />);

    fireEvent.click(screen.getByRole('button', { name: 'show' }));

    expect(screen.queryByText('ignored')).not.toBeInTheDocument();
  });
});

describe('ToastProvider', () => {
  it('renders its children', () => {
    renderProvider();

    expect(screen.getByText('harness')).toBeInTheDocument();
  });

  it('renders nothing until a toast is shown', () => {
    renderProvider();

    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
  });

  it('defaults to the info tone', () => {
    renderProvider();

    fireEvent.click(screen.getByRole('button', { name: 'default' }));

    expect(screen.getByText('Heads up')).toBeInTheDocument();
    expect(toastFor('Heads up')).toHaveClass('bg-ink', 'text-paper');
  });

  it('applies the success tone', () => {
    renderProvider();

    fireEvent.click(screen.getByRole('button', { name: 'success' }));

    expect(toastFor('Saved!')).toHaveClass('bg-success', 'text-white');
  });

  it('applies the error tone', () => {
    renderProvider();

    fireEvent.click(screen.getByRole('button', { name: 'error' }));

    expect(toastFor('Boom')).toHaveClass('bg-danger', 'text-white');
  });

  it('stacks multiple toasts in the order they were shown', () => {
    renderProvider();

    fireEvent.click(screen.getByRole('button', { name: 'default' }));
    fireEvent.click(screen.getByRole('button', { name: 'success' }));
    fireEvent.click(screen.getByRole('button', { name: 'error' }));

    expect(screen.getAllByRole('button', { name: 'Dismiss' })).toHaveLength(3);
    expect(screen.getByText('Heads up')).toBeInTheDocument();
    expect(screen.getByText('Saved!')).toBeInTheDocument();
    expect(screen.getByText('Boom')).toBeInTheDocument();
  });

  it('dismisses a single toast via its close button', () => {
    renderProvider();

    fireEvent.click(screen.getByRole('button', { name: 'default' }));
    fireEvent.click(screen.getByRole('button', { name: 'success' }));

    fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss' })[0]);

    expect(screen.queryByText('Heads up')).not.toBeInTheDocument();
    expect(screen.getByText('Saved!')).toBeInTheDocument();
  });

  it('auto-dismisses a toast after 3600ms', () => {
    renderProvider();

    fireEvent.click(screen.getByRole('button', { name: 'default' }));

    act(() => {
      vi.advanceTimersByTime(3599);
    });
    expect(screen.getByText('Heads up')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText('Heads up')).not.toBeInTheDocument();
  });

  it('auto-dismisses each toast on its own schedule', () => {
    renderProvider();

    fireEvent.click(screen.getByRole('button', { name: 'default' }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    fireEvent.click(screen.getByRole('button', { name: 'success' }));

    act(() => {
      vi.advanceTimersByTime(2600);
    });
    expect(screen.queryByText('Heads up')).not.toBeInTheDocument();
    expect(screen.getByText('Saved!')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByText('Saved!')).not.toBeInTheDocument();
  });

  it('keeps rendering its children after every toast is dismissed', () => {
    renderProvider();

    fireEvent.click(screen.getByRole('button', { name: 'default' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss' })[0]);

    expect(screen.getByText('harness')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
  });
});
