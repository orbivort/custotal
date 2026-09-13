// Component tests for Modal, the portal-based dialog shell.
//
// Behaviour under test: open/close gating, the Escape + backdrop dismissal,
// scroll locking, focus handling (move in on open, restore on close) and the
// minimal Tab focus trap. All of it is observable through the real DOM, so no
// collaborators are mocked.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

/** Owns the open state so focus restore and unmount cleanup can be observed. */
function Harness({
  onClose,
  wide = false,
  withFooter = true,
}: {
  onClose: () => void;
  wide?: boolean;
  withFooter?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          onClose();
        }}
        title="Dialog title"
        wide={wide}
        footer={withFooter ? <button type="button">Footer action</button> : undefined}
      >
        <button type="button">Body action</button>
      </Modal>
    </>
  );
}

/** Opens the dialog with the trigger focused, as a real click would. */
function openDialog(): HTMLElement {
  const trigger = screen.getByRole('button', { name: 'Open' });
  trigger.focus();
  fireEvent.click(trigger);
  return trigger;
}

function backdrop(): Element {
  const overlay = screen.getByRole('dialog').parentElement?.firstElementChild;
  if (!overlay) throw new Error('backdrop not found');
  return overlay;
}

afterEach(cleanup);

describe('Modal', () => {
  it('renders nothing while closed', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders an accessible dialog labelled by its title', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    openDialog();

    const dialog = screen.getByRole('dialog', { name: 'Dialog title' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Dialog title')).toBeInTheDocument();
  });

  it('renders its children and footer', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    openDialog();

    expect(screen.getByRole('button', { name: 'Body action' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Footer action' })).toBeInTheDocument();
  });

  it('omits the footer row when no footer is provided', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} withFooter={false} />);

    openDialog();

    expect(screen.getByRole('button', { name: 'Body action' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Footer action' })).not.toBeInTheDocument();
  });

  it('caps the width at max-w-lg by default and max-w-2xl when wide', () => {
    const onClose = vi.fn();
    const { unmount } = render(<Harness onClose={onClose} />);
    openDialog();
    expect(screen.getByRole('dialog')).toHaveClass('max-w-lg');
    unmount();

    render(<Harness onClose={onClose} wide />);
    openDialog();
    expect(screen.getByRole('dialog')).toHaveClass('max-w-2xl');
  });

  it('closes via the header close button', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    openDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    openDialog();
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores other key presses', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    openDialog();
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes when the backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    openDialog();
    fireEvent.click(backdrop());

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays open when the panel itself is clicked', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    openDialog();
    fireEvent.click(screen.getByRole('dialog'));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('locks background scrolling while open and restores it on close', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    openDialog();
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.body.style.overflow).toBe('');
  });

  it('moves focus into the panel on open and back to the trigger on close', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    const trigger = openDialog();
    expect(screen.getByRole('dialog')).toHaveFocus();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(trigger).toHaveFocus();
  });

  describe('focus trap', () => {
    it('wraps Tab from the last focusable element back to the first', () => {
      const onClose = vi.fn();
      render(<Harness onClose={onClose} />);

      openDialog();
      screen.getByRole('button', { name: 'Footer action' }).focus();
      fireEvent.keyDown(window, { key: 'Tab' });

      expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    });

    it('wraps Shift+Tab from the first focusable element to the last', () => {
      const onClose = vi.fn();
      render(<Harness onClose={onClose} />);

      openDialog();
      screen.getByRole('button', { name: 'Close' }).focus();
      fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });

      expect(screen.getByRole('button', { name: 'Footer action' })).toHaveFocus();
    });

    it('leaves focus untouched on Tab when the panel has no focusable element', () => {
      const onClose = vi.fn();
      render(
        <Modal open onClose={onClose} title="Notice">
          <p>Nothing focusable in here.</p>
        </Modal>,
      );

      fireEvent.keyDown(window, { key: 'Tab' });

      expect(screen.getByRole('dialog')).toHaveFocus();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('pulls focus back to the last element on Shift+Tab from outside the panel', () => {
      const onClose = vi.fn();
      render(<Harness onClose={onClose} />);

      openDialog();
      // Move focus out of the panel, as a Tab into the browser chrome would.
      (document.activeElement as HTMLElement).blur();
      fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });

      expect(screen.getByRole('button', { name: 'Footer action' })).toHaveFocus();
    });
  });
});
