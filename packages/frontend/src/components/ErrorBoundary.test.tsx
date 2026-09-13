// Component tests for the ErrorBoundary module: <SuspendedRoute> (lazy-route
// fallback), <RouteErrorBoundary> (react-router errorElement) and
// <AppErrorBoundary> (top-level render-error boundary), plus the shared
// ErrorScreen they both render.
//
// `useRouteError` is the only react-router export replaced; `isRouteErrorResponse`
// stays real so the tests exercise the actual ErrorResponse predicate rather than
// a hand-rolled stub.
//
// The two action buttons call `window.location.reload()` / `.assign()`. jsdom
// defines those as [LegacyUnforgeable] (non-configurable, non-writable) so they
// cannot be stubbed; the tests assert the buttons are rendered and wired into the
// screen, and leave the navigation itself to the browser.
import { lazy, type ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppErrorBoundary, RouteErrorBoundary, SuspendedRoute } from './ErrorBoundary';

const h = vi.hoisted(() => ({ useRouteError: vi.fn() }));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  return { ...actual, useRouteError: h.useRouteError };
});

/** Mirrors react-router's ErrorResponse shape (status/statusText/internal/data). */
function routeErrorResponse(status: number, statusText: string) {
  return { status, statusText, internal: true, data: null };
}

/** Child that always throws during render, for the app boundary to catch. */
function Boom({ message = 'render failed' }: { message?: string }): ReactNode {
  throw new Error(message);
}

/** Never-resolving lazy component, used to force <SuspendedRoute> into suspense. */
const NeverResolving = lazy(() => new Promise<{ default: () => ReactNode }>(() => undefined));

afterEach(cleanup);

describe('RouteErrorBoundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the thrown Error message', () => {
    h.useRouteError.mockReturnValue(new Error('Loader blew up'));

    render(<RouteErrorBoundary />);

    expect(screen.getByText('Loader blew up')).toBeInTheDocument();
  });

  it('prefers statusText when the route error is an ErrorResponse', () => {
    h.useRouteError.mockReturnValue(routeErrorResponse(404, 'Not Found'));

    render(<RouteErrorBoundary />);

    expect(screen.getByText('Not Found')).toBeInTheDocument();
  });

  it('falls back to friendly status copy when statusText is empty', () => {
    h.useRouteError.mockReturnValue(routeErrorResponse(500, ''));

    render(<RouteErrorBoundary />);

    expect(
      screen.getByText('Something went wrong on our end. Please try again.'),
    ).toBeInTheDocument();
  });

  it('falls back to a generic message for a non-Error value', () => {
    h.useRouteError.mockReturnValue({ some: 'opaque failure' });

    render(<RouteErrorBoundary />);

    expect(screen.getByText('An unexpected error occurred.')).toBeInTheDocument();
  });

  it('falls back to a generic message when there is no error at all', () => {
    h.useRouteError.mockReturnValue(null);

    render(<RouteErrorBoundary />);

    expect(screen.getByText('An unexpected error occurred.')).toBeInTheDocument();
  });

  it('renders the shared error screen chrome and recovery actions', () => {
    h.useRouteError.mockReturnValue(new Error('Boom'));
    const { container } = render(<RouteErrorBoundary />);

    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go home' })).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeNull();
  });
});

describe('AppErrorBoundary', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // React logs caught render errors itself; silence it so the only assertion
    // surface is the boundary's own componentDidCatch call.
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('renders children while nothing throws', () => {
    render(
      <AppErrorBoundary>
        <p>healthy tree</p>
      </AppErrorBoundary>,
    );

    expect(screen.getByText('healthy tree')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('catches a render error and shows its message', () => {
    render(
      <AppErrorBoundary>
        <Boom message="kaboom" />
      </AppErrorBoundary>,
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('kaboom')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('reports the caught error through componentDidCatch', () => {
    render(
      <AppErrorBoundary>
        <Boom message="kaboom" />
      </AppErrorBoundary>,
    );

    expect(errorSpy).toHaveBeenCalledWith(
      'Unhandled render error',
      expect.objectContaining({ message: 'kaboom' }),
      expect.any(String),
    );
  });

  it('keeps rendering the error screen on later renders', () => {
    const { rerender } = render(
      <AppErrorBoundary>
        <Boom message="kaboom" />
      </AppErrorBoundary>,
    );

    rerender(
      <AppErrorBoundary>
        <p>healthy tree</p>
      </AppErrorBoundary>,
    );

    expect(screen.getByText('kaboom')).toBeInTheDocument();
    expect(screen.queryByText('healthy tree')).not.toBeInTheDocument();
  });
});

describe('SuspendedRoute', () => {
  it('renders children that resolve immediately', () => {
    render(
      <SuspendedRoute>
        <p>page body</p>
      </SuspendedRoute>,
    );

    expect(screen.getByText('page body')).toBeInTheDocument();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  });

  it('shows the shared loading block while a child suspends', () => {
    render(
      <SuspendedRoute>
        <NeverResolving />
      </SuspendedRoute>,
    );

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
  });
});
