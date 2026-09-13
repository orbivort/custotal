// Component tests for Badge, the inline status pill.
//
// Badge only maps a tone onto a class pair and merges a caller className, so
// the tests cover every tone plus the default and the merge behaviour.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Badge } from './Badge';

afterEach(cleanup);

describe('Badge', () => {
  it('renders its children', () => {
    render(<Badge tone="forest">Primary</Badge>);

    expect(screen.getByText('Primary')).toBeInTheDocument();
  });

  it('defaults to the neutral tone', () => {
    render(<Badge>Neutral</Badge>);

    expect(screen.getByText('Neutral')).toHaveClass('bg-ink/5', 'text-ink-muted');
  });

  it.each([
    ['neutral', 'bg-ink/5'],
    ['forest', 'bg-forest/10'],
    ['danger', 'bg-danger/10'],
    ['warn', 'bg-warn/15'],
    ['success', 'bg-success/10'],
    ['info', 'bg-info/10'],
  ] as const)('applies the %s tone', (tone, expectedClass) => {
    render(<Badge tone={tone}>{tone}</Badge>);

    expect(screen.getByText(tone)).toHaveClass(expectedClass);
  });

  it('keeps the shared pill styling for every tone', () => {
    render(<Badge tone="success">Active</Badge>);

    expect(screen.getByText('Active')).toHaveClass(
      'inline-flex',
      'items-center',
      'rounded-full',
      'text-12',
    );
  });

  it('merges a caller className with the tone styles', () => {
    render(
      <Badge tone="danger" className="uppercase">
        Overdue
      </Badge>,
    );

    const badge = screen.getByText('Overdue');
    expect(badge).toHaveClass('uppercase');
    expect(badge).toHaveClass('bg-danger/10');
  });

  it('lets a caller className win over conflicting utilities', () => {
    render(
      <Badge tone="danger" className="text-ink">
        Overdue
      </Badge>,
    );

    const badge = screen.getByText('Overdue');
    expect(badge).toHaveClass('text-ink');
    expect(badge).not.toHaveClass('text-danger');
  });

  it('renders non-text children such as icons', () => {
    render(
      <Badge tone="success">
        <span aria-label="ok" />
        Active
      </Badge>,
    );

    expect(screen.getByLabelText('ok')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });
});
