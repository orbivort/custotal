// Component tests for ChangePasswordPage (forced credential rotation):
// validation, API mapping, and the post-change sign-out flow.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import ChangePasswordPage from './ChangePasswordPage';

const h = vi.hoisted(() => ({
  changePassword: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('./authApi', () => ({ changePassword: h.changePassword }));
vi.mock('./SessionContext', () => ({ useSession: () => ({ logout: h.logout }) }));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/change-password']}>
      <Routes>
        <Route path="/change-password" element={<ChangePasswordPage />} />
        <Route path="/login" element={<p>login page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ChangePasswordPage', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    h.changePassword.mockResolvedValue(undefined);
    h.logout.mockResolvedValue(undefined);
  });

  it('submits the current and new password', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/^Temporary password/), 'temp-pass-1');
    await user.type(screen.getByLabelText(/^New password/), 'long-enough-1');
    await user.type(screen.getByLabelText(/^Confirm new password/), 'long-enough-1');
    await user.click(screen.getByRole('button', { name: 'Update password' }));

    await waitFor(() =>
      expect(h.changePassword).toHaveBeenCalledWith('temp-pass-1', 'long-enough-1'),
    );
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(/password has been updated/i);
  });

  it('validates length and confirmation before calling the API', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/^Temporary password/), 'temp-pass-1');
    await user.type(screen.getByLabelText(/^New password/), 'short');
    await user.type(screen.getByLabelText(/^Confirm new password/), 'different');
    await user.click(screen.getByRole('button', { name: 'Update password' }));

    expect(screen.getByText('Password must be at least 8 characters.')).toBeInTheDocument();
    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
    expect(h.changePassword).not.toHaveBeenCalled();
  });

  it('maps server validation errors onto the fields', async () => {
    const user = userEvent.setup();
    h.changePassword.mockRejectedValueOnce(
      new ApiError('validation', 'Please correct the highlighted fields.', [
        { field: 'currentPassword', message: 'Your current password is incorrect.' },
      ]),
    );
    renderPage();

    await user.type(screen.getByLabelText(/^Temporary password/), 'wrong-pass');
    await user.type(screen.getByLabelText(/^New password/), 'long-enough-1');
    await user.type(screen.getByLabelText(/^Confirm new password/), 'long-enough-1');
    await user.click(screen.getByRole('button', { name: 'Update password' }));

    expect(await screen.findByText('Your current password is incorrect.')).toBeInTheDocument();
  });

  it('signs out and returns to login after a successful change', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/^Temporary password/), 'temp-pass-1');
    await user.type(screen.getByLabelText(/^New password/), 'long-enough-1');
    await user.type(screen.getByLabelText(/^Confirm new password/), 'long-enough-1');
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    await screen.findByRole('status');
    await user.click(screen.getByRole('button', { name: 'Go to sign in' }));

    await waitFor(() => expect(h.logout).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('login page')).toBeInTheDocument();
  });
});
