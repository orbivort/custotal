// Component tests for AdminNav, the shared admin tab bar.
//
// The only collaborator is react-router's NavLink, so rendering happens inside
// a real MemoryRouter and each tab's active state follows the current path.
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { AdminNav } from './AdminNav';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AdminNav />
    </MemoryRouter>,
  );
}

describe('AdminNav', () => {
  afterEach(cleanup);

  it('renders every admin section as a labelled link', () => {
    renderAt('/admin');

    expect(screen.getByRole('navigation', { name: 'Admin sections' })).toBeInTheDocument();

    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual([
      'Overview',
      'Users',
      'Pipeline stages',
      'CSV import',
      'Recovery',
    ]);
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/admin',
      '/admin/users',
      '/admin/stages',
      '/admin/import',
      '/admin/recover',
    ]);
  });

  it('marks Overview as current only on the exact overview route', () => {
    renderAt('/admin');

    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Users' })).not.toHaveAttribute('aria-current');
  });

  it('marks the matching section as current on a subroute', () => {
    renderAt('/admin/users');

    expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Pipeline stages' })).not.toHaveAttribute(
      'aria-current',
    );
  });
});
