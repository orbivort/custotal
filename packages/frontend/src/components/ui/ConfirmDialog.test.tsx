// Component tests for ConfirmDialog, the in-app replacement for window.confirm.
//
// The dialog composes Modal + Button, so the tests assert the wiring: gating on
// `open`, the label defaults/overrides, the destructive variant, and which
// callback each button triggers. Escape-to-close is inherited from Modal.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

function renderDialog(overrides: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const props = {
    open: true,
    title: 'Delete contact?',
    message: 'This cannot be undone.',
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<ConfirmDialog {...props} />) };
}

afterEach(cleanup);

describe('ConfirmDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing while closed', () => {
    renderDialog({ open: false });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the title and message', () => {
    renderDialog();

    expect(screen.getByRole('dialog', { name: 'Delete contact?' })).toBeInTheDocument();
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
  });

  it('uses the default action labels', () => {
    renderDialog();

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
  });

  it('uses custom action labels', () => {
    renderDialog({ confirmLabel: 'Delete', cancelLabel: 'Keep' });

    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep' })).toBeInTheDocument();
  });

  it('calls onClose when Cancel is clicked', () => {
    const { props } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it('calls onConfirm when the confirm button is clicked', () => {
    const { props } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('styles the confirm action as primary by default', () => {
    renderDialog();

    expect(screen.getByRole('button', { name: 'Confirm' })).toHaveClass('bg-forest');
  });

  it('styles the confirm action as danger when destructive', () => {
    renderDialog({ destructive: true, confirmLabel: 'Delete' });

    const confirm = screen.getByRole('button', { name: 'Delete' });
    expect(confirm).toHaveClass('bg-danger');
    expect(confirm).not.toHaveClass('bg-forest');
  });

  it('styles the cancel action as secondary', () => {
    renderDialog();

    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveClass('bg-cream');
  });

  it('inherits Escape-to-close from Modal', () => {
    const { props } = renderDialog();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onConfirm).not.toHaveBeenCalled();
  });
});
