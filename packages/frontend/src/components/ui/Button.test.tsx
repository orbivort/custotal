// Component tests for Button, the shared action button.
//
// Button is a thin wrapper over <button> whose only logic is the variant/size
// class lookup and prop forwarding, so the tests cover every lookup entry plus
// the merge behaviour of the `className` override.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

afterEach(cleanup);

describe('Button', () => {
  it('renders its children', () => {
    render(<Button>Save</Button>);

    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('defaults to the primary variant at medium size', () => {
    render(<Button>Save</Button>);

    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveClass('bg-forest', 'text-paper', 'text-sm', 'px-4', 'py-2');
  });

  it.each([
    ['secondary', 'bg-cream'],
    ['ghost', 'text-ink-muted'],
    ['danger', 'bg-danger'],
    ['subtle', 'text-forest'],
  ] as const)('applies the %s variant', (variant, expectedClass) => {
    render(<Button variant={variant}>Save</Button>);

    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass(expectedClass);
  });

  it('applies the small size', () => {
    render(<Button size="sm">Save</Button>);

    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('text-13', 'px-2.5', 'py-1.5');
  });

  it('merges a caller className over the base styles', () => {
    render(<Button className="w-full">Save</Button>);

    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveClass('w-full');
    expect(button).toHaveClass('bg-forest');
  });

  it('lets a caller className win over conflicting size utilities', () => {
    render(
      <Button size="md" className="px-8">
        Save
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveClass('px-8');
    expect(button).not.toHaveClass('px-4');
  });

  it('forwards the click handler', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire the click handler when disabled', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(button);

    expect(button).toBeDisabled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('applies the disabled styling', () => {
    render(<Button disabled>Save</Button>);

    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('disabled:opacity-50');
  });

  it('forwards native button attributes', () => {
    render(
      <Button type="submit" aria-label="Submit form">
        Save
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Submit form' });
    expect(button).toHaveAttribute('type', 'submit');
  });
});
