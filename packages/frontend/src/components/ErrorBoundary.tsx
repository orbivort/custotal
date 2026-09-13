import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { describeHttpStatus } from '../lib/httpErrors';
import { AlertIcon } from './icons';
import { Button } from './ui/Button';
import { LoadingBlock } from './ui/Feedback';

/**
 * Suspense wrapper for lazily-loaded route elements rendered outside the
 * authenticated layout (login / set-password screens). Pages inside the layout
 * get their fallback from <AppLayout>, which wraps its <Outlet />.
 */
export function SuspendedRoute({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LoadingBlock />}>{children}</Suspense>;
}

/** Shared error screen used by both the router errorElement and the app boundary. */
function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-paper px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-danger/10 text-danger">
        <AlertIcon className="size-6" />
      </div>
      <div>
        <h1 className="font-display text-lg text-ink">Something went wrong</h1>
        <p className="mt-1 max-w-md text-sm text-ink-faint">{message}</p>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => window.location.reload()}>Try again</Button>
        <Button variant="secondary" onClick={() => window.location.assign('/')}>
          Go home
        </Button>
      </div>
    </div>
  );
}

function describeError(error: unknown): string {
  if (isRouteErrorResponse(error)) {
    return error.statusText || describeHttpStatus(error.status);
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred.';
}

/**
 * Router error boundary (react-router `errorElement`). Renders whenever a
 * route component throws during render/loading, or a loader-less data error
 * bubbles up. Catching at the layout route keeps the app recoverable instead
 * of blanking the page.
 */
export function RouteErrorBoundary() {
  const error = useRouteError();
  return <ErrorScreen message={describeError(error)} />;
}

interface BoundaryState {
  error: Error | null;
}

/**
 * Top-level boundary for render errors that happen outside the router
 * (SessionProvider, ToastProvider, the bootstrap tree). Without it such an
 * error would unmount the whole React tree with no recovery UI.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  override state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error', error, info.componentStack);
  }

  override render() {
    if (this.state.error) {
      return <ErrorScreen message={this.state.error.message} />;
    }
    return this.props.children;
  }
}
