// Component tests for SetPasswordPage (shared by /invite/accept and
// /reset-password): token handling, validation, success state, and error
// mapping for invalid/expired tokens.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import SetPasswordPage from './SetPasswordPage';

const h = vi.hoisted(() => ({
  acceptInvitation: vi.fn(),
  confirmPasswordReset: vi.fn(),
}));

vi.mock('./authApi', () => ({
  acceptInvitation: h.acceptInvitation,
  confirmPasswordReset: h.confirmPasswordReset,
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/invite/accept" element={<SetPasswordPage mode="invite" />} />
        <Route path="/reset-password" element={<SetPasswordPage mode="reset" />} />
        <Route path="/login" element={<p>login page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SetPasswordPage', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    h.acceptInvitation.mockResolvedValue(undefined);
    h.confirmPasswordReset.mockResolvedValue(undefined);
  });

  it('shows the invalid-token screen when the token is missing', async () => {
    renderAt('/invite/accept');

    expect(await screen.findByText(/invalid or has expired/i)).toBeInTheDocument();
    expect(h.acceptInvitation).not.toHaveBeenCalled();
  });

  it('accepts an invitation: sets the password and confirms via live region', async () => {
    const user = userEvent.setup();
    renderAt('/invite/accept?token=tok-1');

    await user.type(screen.getByLabelText(/^New password/), 'long-enough-1');
    await user.type(screen.getByLabelText(/^Confirm password/), 'long-enough-1');
    await user.click(screen.getByRole('button', { name: 'Set password' }));

    await waitFor(() => expect(h.acceptInvitation).toHaveBeenCalledWith('tok-1', 'long-enough-1'));
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(/password is set/i);
    expect(within(status).getByRole('button', { name: 'Go to sign in' })).toBeInTheDocument();
  });

  it('confirms a password reset through the reset endpoint', async () => {
    const user = userEvent.setup();
    renderAt('/reset-password?token=tok-2');

    await user.type(screen.getByLabelText(/^New password/), 'long-enough-1');
    await user.type(screen.getByLabelText(/^Confirm password/), 'long-enough-1');
    await user.click(screen.getByRole('button', { name: 'Reset password' }));

    await waitFor(() =>
      expect(h.confirmPasswordReset).toHaveBeenCalledWith('tok-2', 'long-enough-1'),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(/has been changed/i);
  });

  it('rejects mismatched and too-short passwords without calling the API', async () => {
    const user = userEvent.setup();
    renderAt('/invite/accept?token=tok-1');

    await user.type(screen.getByLabelText(/^New password/), 'short');
    await user.type(screen.getByLabelText(/^Confirm password/), 'different');
    await user.click(screen.getByRole('button', { name: 'Set password' }));

    expect(screen.getByText('Password must be at least 8 characters.')).toBeInTheDocument();
    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
    expect(h.acceptInvitation).not.toHaveBeenCalled();
  });

  it('maps an invalid_token API error to recovery guidance', async () => {
    const user = userEvent.setup();
    h.acceptInvitation.mockRejectedValueOnce(
      new ApiError('invalid_token', 'This link is invalid or has expired.'),
    );
    renderAt('/invite/accept?token=tok-1');

    await user.type(screen.getByLabelText(/^New password/), 'long-enough-1');
    await user.type(screen.getByLabelText(/^Confirm password/), 'long-enough-1');
    await user.click(screen.getByRole('button', { name: 'Set password' }));

    expect(await screen.findByText(/Ask your administrator to resend/i)).toBeInTheDocument();
  });
});
