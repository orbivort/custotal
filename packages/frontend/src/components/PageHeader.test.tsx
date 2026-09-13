// Component tests for PageHeader, the shared page title block.
//
// PageHeader is purely presentational (no router, no context, no async work),
// so these tests focus on the three conditional regions: title, subtitle and
// the actions slot.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PageHeader } from './PageHeader';

afterEach(cleanup);

describe('PageHeader', () => {
  it('renders the title as a level-1 heading', () => {
    render(<PageHeader title="Contacts" />);

    const heading = screen.getByRole('heading', { level: 1, name: 'Contacts' });
    expect(heading).toBeInTheDocument();
  });

  it('omits the subtitle paragraph when no subtitle is given', () => {
    render(<PageHeader title="Contacts" />);

    expect(screen.queryByText('All people in your workspace')).not.toBeInTheDocument();
  });

  it('renders the subtitle when provided', () => {
    render(<PageHeader title="Contacts" subtitle="All people in your workspace" />);

    expect(screen.getByText('All people in your workspace')).toBeInTheDocument();
  });

  it('renders an empty subtitle string as no paragraph', () => {
    render(<PageHeader title="Contacts" subtitle="" />);

    // `subtitle ? ... : null` — the falsy empty string short-circuits.
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.queryByText('', { selector: 'p' })).not.toBeInTheDocument();
  });

  it('renders action nodes when provided', () => {
    render(
      <PageHeader
        title="Contacts"
        actions={
          <button type="button" onClick={() => undefined}>
            New contact
          </button>
        }
      />,
    );

    expect(screen.getByRole('button', { name: 'New contact' })).toBeInTheDocument();
  });

  it('renders no actions region when the actions prop is omitted', () => {
    render(<PageHeader title="Contacts" />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders title, subtitle and actions together', () => {
    render(<PageHeader title="Pipeline" subtitle="Deals by stage" actions={<span>Export</span>} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Pipeline' })).toBeInTheDocument();
    expect(screen.getByText('Deals by stage')).toBeInTheDocument();
    expect(screen.getByText('Export')).toBeInTheDocument();
  });
});
