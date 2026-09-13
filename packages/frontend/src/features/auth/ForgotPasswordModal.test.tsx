// Component tests for ForgotPasswordModal: confirmation copy (enumeration-safe),
// rate-limit error surfacing, and validation.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import ForgotPasswordModal from './ForgotPasswordModal';

const h = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(),
}));

vi.mock('./authApi', () => ({ requestPasswordReset: h.requestPasswordReset }));

describe('ForgotPasswordModal', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    h.requestPasswordReset.mockResolvedValue(undefined);
  });

  it('requests a reset and shows enumeration-safe confirmation', async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordModal open onClose={vi.fn()} />);

    await user.type(screen.getByLabelText(/^Email/), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    await waitFor(() => expect(h.requestPasswordReset).toHaveBeenCalledWith('ada@example.com'));
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(/Check your inbox/);
    expect(status).toHaveTextContent('ada@example.com');
    expect(status).toHaveTextContent(/If an account exists/);
  });

  it('requires an email before submitting', async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordModal open onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(screen.getByText('Email is required.')).toBeInTheDocument();
    expect(h.requestPasswordReset).not.toHaveBeenCalled();
  });

  it('surfaces rate-limit errors verbatim', async () => {
    const user = userEvent.setup();
    h.requestPasswordReset.mockRejectedValueOnce(
      new ApiError('rate_limited', 'Too many password reset requests. Try again later.'),
    );
    render(<ForgotPasswordModal open onClose={vi.fn()} />);

    await user.type(screen.getByLabelText(/^Email/), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(
      await screen.findByText('Too many password reset requests. Try again later.'),
    ).toBeInTheDocument();
  });

  it('shows a connection fallback for non-API failures', async () => {
    const user = userEvent.setup();
    h.requestPasswordReset.mockRejectedValueOnce(new Error('fetch failed'));
    render(<ForgotPasswordModal open onClose={vi.fn()} />);

    await user.type(screen.getByLabelText(/^Email/), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(await screen.findByText(/Can't reach the server/)).toBeInTheDocument();
  });

  it('hides the submit button on the confirmation state and closes via Done path', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ForgotPasswordModal open onClose={onClose} />);

    await user.type(screen.getByLabelText(/^Email/), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    await screen.findByRole('status');

    expect(screen.queryByRole('button', { name: 'Send reset link' })).not.toBeInTheDocument();
    const dialog = screen.getByRole('dialog');
    // The Modal renders its own icon Close button; the footer one is the last.
    const closeButtons = within(dialog).getAllByRole('button', { name: 'Close' });
    await user.click(closeButtons[closeButtons.length - 1]);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
