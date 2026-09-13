// Component tests for the Feedback primitives: Spinner, LoadingBlock,
// EmptyState and ErrorBanner.
//
// All four are small presentational helpers; the tests pin the accessible
// labels/defaults and the optional slots that pages rely on.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EmptyState, ErrorBanner, LoadingBlock, Spinner } from './Feedback';

afterEach(cleanup);

describe('Spinner', () => {
  it('exposes an accessible loading label', () => {
    render(<Spinner />);

    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
  });

  it('applies the spin animation classes', () => {
    render(<Spinner />);

    expect(screen.getByLabelText('Loading')).toHaveClass('animate-spin', 'rounded-full');
  });

  it('merges a caller className, letting it win over the default size', () => {
    render(<Spinner className="size-8" />);

    const spinner = screen.getByLabelText('Loading');
    expect(spinner).toHaveClass('size-8');
    expect(spinner).not.toHaveClass('size-4');
  });
});

describe('LoadingBlock', () => {
  it('defaults to a generic loading label', () => {
    render(<LoadingBlock />);

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
  });

  it('renders a custom label', () => {
    render(<LoadingBlock label="Restoring session…" />);

    expect(screen.getByText('Restoring session…')).toBeInTheDocument();
  });
});

describe('EmptyState', () => {
  it('renders the title', () => {
    render(<EmptyState title="No contacts yet" />);

    expect(screen.getByText('No contacts yet')).toBeInTheDocument();
  });

  it('omits the description and action slots when not provided', () => {
    render(<EmptyState title="No contacts yet" />);

    expect(screen.queryByText('Import a CSV to get started')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders the description when provided', () => {
    render(<EmptyState title="No contacts yet" description="Import a CSV to get started" />);

    expect(screen.getByText('Import a CSV to get started')).toBeInTheDocument();
  });

  it('renders an action node when provided', () => {
    render(
      <EmptyState title="No contacts yet" action={<button type="button">New contact</button>} />,
    );

    expect(screen.getByRole('button', { name: 'New contact' })).toBeInTheDocument();
  });

  it('renders title, description and action together', () => {
    render(
      <EmptyState
        title="No deals"
        description="Create your first opportunity"
        action={<span>Export</span>}
      />,
    );

    expect(screen.getByText('No deals')).toBeInTheDocument();
    expect(screen.getByText('Create your first opportunity')).toBeInTheDocument();
    expect(screen.getByText('Export')).toBeInTheDocument();
  });
});

describe('ErrorBanner', () => {
  it('renders the message', () => {
    render(<ErrorBanner message="Could not load contacts." />);

    expect(screen.getByText('Could not load contacts.')).toBeInTheDocument();
  });

  it('renders the alert icon as decoration', () => {
    const { container } = render(<ErrorBanner message="Boom" />);

    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('applies the danger styling', () => {
    render(<ErrorBanner message="Boom" />);

    expect(screen.getByText('Boom').closest('div')).toHaveClass('text-danger', 'bg-danger/5');
  });
});
