// Component tests for Pagination, the list-page pager.
//
// The component's only logic is the page/range arithmetic and the disabled
// edges, so the tests walk that arithmetic (empty, first, middle, last and
// partial pages) and the two navigation callbacks.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Pagination } from './Pagination';

/** Reads the "Showing x–y of z" summary span. */
function summary(text: string) {
  return screen.getByText((_content, el) => el?.textContent === text);
}

function renderPager(page: number, pageSize: number, total: number, onChange = vi.fn()) {
  return {
    onChange,
    ...render(<Pagination page={page} pageSize={pageSize} total={total} onChange={onChange} />),
  };
}

afterEach(cleanup);

describe('Pagination', () => {
  it('reports an empty range when there are no rows', () => {
    renderPager(1, 10, 0);

    expect(summary('Showing 0–0 of 0')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
  });

  it('disables both arrows on an empty list', () => {
    renderPager(1, 10, 0);

    expect(screen.getByRole('button', { name: /Previous/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Next/ })).toBeDisabled();
  });

  it('caps the last page at the total row count', () => {
    renderPager(2, 10, 15);

    expect(summary('Showing 11–15 of 15')).toBeInTheDocument();
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
  });

  it('computes a full middle page', () => {
    renderPager(2, 10, 25);

    expect(summary('Showing 11–20 of 25')).toBeInTheDocument();
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
  });

  it('computes the first page of a single-page list', () => {
    renderPager(1, 10, 5);

    expect(summary('Showing 1–5 of 5')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
  });

  it('disables Previous on the first page only', () => {
    renderPager(1, 10, 25);

    expect(screen.getByRole('button', { name: /Previous/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Next/ })).toBeEnabled();
  });

  it('disables Next on the last page only', () => {
    renderPager(3, 10, 25);

    expect(screen.getByRole('button', { name: /Next/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Previous/ })).toBeEnabled();
  });

  it('requests the previous page when Previous is clicked', () => {
    const { onChange } = renderPager(2, 10, 25);

    fireEvent.click(screen.getByRole('button', { name: /Previous/ }));

    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('requests the next page when Next is clicked', () => {
    const { onChange } = renderPager(2, 10, 25);

    fireEvent.click(screen.getByRole('button', { name: /Next/ }));

    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('does not request navigation when a disabled arrow is clicked', () => {
    const { onChange } = renderPager(1, 10, 25);

    fireEvent.click(screen.getByRole('button', { name: /Previous/ }));

    expect(onChange).not.toHaveBeenCalled();
  });
});
