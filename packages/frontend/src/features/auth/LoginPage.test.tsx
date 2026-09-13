// Component tests for LoginPage.
//
// External collaborators are mocked so the tests focus on page behavior:
// - SessionContext.useSession    -> login action the form calls
// - useInstanceStatus            -> drives the loading / unreachable / setup / form states
// - react-router useNavigate     -> post-login redirect interception
// - config/env                   -> mutable stub so the demo prefill can be toggled
//
// The real ApiError class is used so error mapping (code + details) matches
// exactly what the production HTTP client throws.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import type { InstanceInfo } from '../../types/domain';
import LoginPage from './LoginPage';

const h = vi.hoisted(() => ({
  login: vi.fn(),
  logout: vi.fn(),
  useInstanceStatus: vi.fn(),
  navigate: vi.fn(),
  location: { state: null as unknown },
  // Mirrors the production default (mocks off => empty fields); tests opt into
  // the demo prefill by flipping this before rendering.
  env: { mocksEnabled: false },
}));

vi.mock('./SessionContext', () => ({ useSession: () => ({ login: h.login, logout: h.logout }) }));
vi.mock('./useInstanceStatus', () => ({ useInstanceStatus: h.useInstanceStatus }));
vi.mock('../../config/env', () => ({ env: h.env }));
vi.mock('react-router', async (importActual) => ({
  ...(await importActual<typeof import('react-router')>()),
  useNavigate: () => h.navigate,
  // The component reads the intended return path from location state; the tests
  // drive it through this stub instead of a real router.
  useLocation: () => ({
    state: h.location.state,
    pathname: '/login',
    search: '',
    hash: '',
    key: 'test',
  }),
}));

const INFO: InstanceInfo = {
  orgName: 'Custotal',
  version: '0.1.0',
  environment: 'development',
  hostname: 'localhost',
  allowPasswordReset: false,
  setupRequired: false,
};

/** Status values the mocked hook can return. */
const status = {
  loading: { state: 'loading' as const },
  ok: (overrides: Partial<InstanceInfo> = {}) => ({
    state: 'ok' as const,
    info: { ...INFO, ...overrides },
  }),
  unreachable: { state: 'unreachable' as const },
};

afterEach(() => cleanup());

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.location.state = null;
    h.useInstanceStatus.mockReturnValue(status.ok());
    h.login.mockResolvedValue(undefined);
    h.env.mocksEnabled = false;
  });

  describe('instance status gates', () => {
    it('shows the connecting spinner while the instance probe is pending', () => {
      h.useInstanceStatus.mockReturnValue(status.loading);

      render(<LoginPage />);

      expect(screen.getByText('Connecting to your server…')).toBeInTheDocument();
      expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    });

    it('shows the unreachable screen and reloads the page on Retry', async () => {
      // jsdom installs `reload` as a non-configurable own property, so the only
      // way to observe the call is to swap the whole location object.
      const reload = vi.fn();
      const originalLocation = window.location;
      const win = window as unknown as { location: unknown };
      win.location = { ...originalLocation, reload };
      h.useInstanceStatus.mockReturnValue(status.unreachable);

      const user = userEvent.setup();
      render(<LoginPage />);

      expect(screen.getByRole('heading', { name: "Can't reach your server" })).toBeInTheDocument();
      expect(screen.getByText('http://localhost:3000')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Retry' }));
      expect(reload).toHaveBeenCalledTimes(1);
      win.location = originalLocation;
    });

    it('shows the first-run setup screen when no administrator exists', () => {
      h.useInstanceStatus.mockReturnValue(status.ok({ setupRequired: true }));

      render(<LoginPage />);

      expect(
        screen.getByRole('heading', { name: 'Finish setting up Custotal' }),
      ).toBeInTheDocument();
      expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    });
  });

  describe('demo credential prefill', () => {
    it('leaves both fields blank when mocks are disabled', () => {
      render(<LoginPage />);

      expect(screen.getByLabelText(/^Email/)).toHaveValue('');
      expect(screen.getByLabelText(/^Password/)).toHaveValue('');
    });

    it('prefills the seeded demo account when mocks are enabled', () => {
      h.env.mocksEnabled = true;

      render(<LoginPage />);

      expect(screen.getByLabelText(/^Email/)).toHaveValue('admin@example.com');
      expect(screen.getByLabelText(/^Password/)).toHaveValue('demo1234');
    });

    it('signs in with the prefilled demo account without any typing', async () => {
      h.env.mocksEnabled = true;
      const user = userEvent.setup();

      render(<LoginPage />);
      await user.click(screen.getByRole('button', { name: /Sign in/ }));

      await waitFor(() => expect(h.navigate).toHaveBeenCalledWith('/', { replace: true }));
      expect(h.login).toHaveBeenCalledWith('admin@example.com', 'demo1234');
    });
  });

  describe('login form', () => {
    it('renders the form with no reset link when reset is disallowed', () => {
      render(<LoginPage />);

      expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Forgot password?' })).not.toBeInTheDocument();
    });

    it('shows the reset link when the instance allows password reset', () => {
      h.useInstanceStatus.mockReturnValue(status.ok({ allowPasswordReset: true }));

      render(<LoginPage />);

      expect(screen.getByRole('button', { name: 'Forgot password?' })).toBeInTheDocument();
    });

    it('blocks submission and shows both required errors on an empty submit', async () => {
      const user = userEvent.setup();
      render(<LoginPage />);

      await user.click(screen.getByRole('button', { name: /Sign in/ }));

      expect(screen.getByText('Email is required.')).toBeInTheDocument();
      expect(screen.getByText('Password is required.')).toBeInTheDocument();
      expect(h.login).not.toHaveBeenCalled();
      expect(h.navigate).not.toHaveBeenCalled();
    });

    it('treats a whitespace-only email as missing', async () => {
      const user = userEvent.setup();
      render(<LoginPage />);

      await user.type(screen.getByLabelText(/^Email/), '   ');
      await user.click(screen.getByRole('button', { name: /Sign in/ }));

      expect(screen.getByText('Email is required.')).toBeInTheDocument();
      expect(h.login).not.toHaveBeenCalled();
    });

    it('submits the typed credentials and navigates to the root on success', async () => {
      const user = userEvent.setup();
      render(<LoginPage />);

      await user.type(screen.getByLabelText(/^Email/), 'ada@example.com');
      await user.type(screen.getByLabelText(/^Password/), 'secret');
      await user.click(screen.getByRole('button', { name: /Sign in/ }));

      await waitFor(() => expect(h.navigate).toHaveBeenCalledWith('/', { replace: true }));
      expect(h.login).toHaveBeenCalledWith('ada@example.com', 'secret');
    });

    it('shows the submitting state and disables the button while login is pending', async () => {
      let resolveLogin!: () => void;
      h.login.mockImplementationOnce(() => new Promise<void>((r) => (resolveLogin = r)));
      const user = userEvent.setup();
      render(<LoginPage />);

      await user.type(screen.getByLabelText(/^Email/), 'ada@example.com');
      await user.type(screen.getByLabelText(/^Password/), 'secret');
      await user.click(screen.getByRole('button', { name: /Sign in/ }));

      const button = screen.getByRole('button', { name: /Signing in/ });
      expect(button).toBeDisabled();

      resolveLogin();
      await waitFor(() => expect(h.navigate).toHaveBeenCalled());
    });

    it('toggles password visibility between masked and plain text', async () => {
      const user = userEvent.setup();
      render(<LoginPage />);
      const password = screen.getByLabelText(/^Password/);
      const toggle = screen.getByRole('button', { name: 'Show password' });

      expect(password).toHaveAttribute('type', 'password');

      await user.click(toggle);

      expect(screen.getByLabelText(/^Password/)).toHaveAttribute('type', 'text');
      expect(screen.getByRole('button', { name: 'Hide password' })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Hide password' }));

      expect(screen.getByLabelText(/^Password/)).toHaveAttribute('type', 'password');
    });

    it('clears field and form errors as soon as the user edits again', async () => {
      const user = userEvent.setup();
      render(<LoginPage />);

      await user.click(screen.getByRole('button', { name: /Sign in/ }));
      expect(screen.getByText('Email is required.')).toBeInTheDocument();

      await user.type(screen.getByLabelText(/^Email/), 'a');

      expect(screen.queryByText('Email is required.')).not.toBeInTheDocument();
    });

    it('maps an invalid_credentials ApiError to the form banner and both field errors', async () => {
      h.login.mockRejectedValueOnce(
        new ApiError('invalid_credentials', 'Invalid email or password.'),
      );
      const user = userEvent.setup();
      render(<LoginPage />);

      await user.type(screen.getByLabelText(/^Email/), 'ada@example.com');
      await user.type(screen.getByLabelText(/^Password/), 'wrong');
      await user.click(screen.getByRole('button', { name: /Sign in/ }));

      expect(await screen.findByText('Invalid email or password.')).toBeInTheDocument();
      expect(screen.getByText('Check your email address.')).toBeInTheDocument();
      expect(screen.getByText('Check your password.')).toBeInTheDocument();
      expect(h.navigate).not.toHaveBeenCalled();
    });

    it('maps an unreachable ApiError to the server-connectivity banner', async () => {
      h.login.mockRejectedValueOnce(new ApiError('unreachable', "Can't reach the server."));
      const user = userEvent.setup();
      render(<LoginPage />);

      await user.type(screen.getByLabelText(/^Email/), 'ada@example.com');
      await user.type(screen.getByLabelText(/^Password/), 'secret');
      await user.click(screen.getByRole('button', { name: /Sign in/ }));

      expect(
        await screen.findByText(
          "Can't reach the server. Check that it's running and reachable from this browser.",
        ),
      ).toBeInTheDocument();
    });

    it('maps a validation ApiError to per-field messages from the error details', async () => {
      h.login.mockRejectedValueOnce(
        new ApiError('validation_failed', 'Validation failed.', [
          { field: 'email', message: 'Enter a valid email address.' },
          { field: 'unknown_field', message: 'Ignored.' },
        ]),
      );
      const user = userEvent.setup();
      render(<LoginPage />);

      await user.type(screen.getByLabelText(/^Email/), 'not-an-email');
      await user.type(screen.getByLabelText(/^Password/), 'secret');
      await user.click(screen.getByRole('button', { name: /Sign in/ }));

      expect(await screen.findByText('Validation failed.')).toBeInTheDocument();
      expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
      expect(screen.queryByText('Ignored.')).not.toBeInTheDocument();
    });

    it('maps a non-ApiError rejection to the generic connectivity banner', async () => {
      h.login.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      const user = userEvent.setup();
      render(<LoginPage />);

      await user.type(screen.getByLabelText(/^Email/), 'ada@example.com');
      await user.type(screen.getByLabelText(/^Password/), 'secret');
      await user.click(screen.getByRole('button', { name: /Sign in/ }));

      expect(
        await screen.findByText(
          "Can't reach the server. Check your connection and that the server is running.",
        ),
      ).toBeInTheDocument();
    });

    it('returns to the originally requested route after a successful sign-in', async () => {
      h.location.state = { from: { pathname: '/pipeline' } };
      const user = userEvent.setup();
      render(<LoginPage />);

      await user.type(screen.getByLabelText(/^Email/), 'ada@example.com');
      await user.type(screen.getByLabelText(/^Password/), 'secret');
      await user.click(screen.getByRole('button', { name: /Sign in/ }));

      await waitFor(() => expect(h.navigate).toHaveBeenCalledWith('/pipeline', { replace: true }));
    });
  });
});
