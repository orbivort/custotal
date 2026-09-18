// Component tests for the brand mark and its lockup.
//
// The mark is deliberately not a fixed asset: it changes shape with the size
// it is rendered at and colour with the surface it sits on. These tests pin
// the four decisions a caller can get wrong — optical size, ground, monochrome
// and the accessible name — rather than the path data, which the spec sheet in
// temp/ is responsible for.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BrandLockup, BrandMark } from './BrandMark';

/** The plate and the seal are the only rects the mark ever draws. */
function rects(container: HTMLElement) {
  return container.querySelectorAll('rect');
}

afterEach(cleanup);

describe('BrandMark', () => {
  it('renders on the 32-unit design grid at the requested size', () => {
    const { container } = render(<BrandMark size={48} />);
    const svg = container.querySelector('svg');

    expect(svg).toHaveAttribute('viewBox', '0 0 32 32');
    expect(svg).toHaveAttribute('width', '48');
    expect(svg).toHaveAttribute('height', '48');
  });

  it('is decorative by default so a visible wordmark names the product alone', () => {
    const { container } = render(<BrandMark />);
    const svg = container.querySelector('svg');

    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).not.toHaveAttribute('aria-label');
    expect(svg).not.toHaveAttribute('role');
  });

  it('becomes a named image when it stands alone', () => {
    render(<BrandMark label="Custotal" />);
    const svg = screen.getByRole('img', { name: 'Custotal' });

    expect(svg).not.toHaveAttribute('aria-hidden');
  });

  it('drops the seal below 24px, where its clearances fall under 1.5 device px', () => {
    const { container } = render(<BrandMark size={16} />);

    expect(rects(container)).toHaveLength(0);
  });

  it('keeps the seal at the smallest size it is used beside text', () => {
    const { container } = render(<BrandMark size={24} />);
    const seal = rects(container)[0];

    expect(rects(container)).toHaveLength(1);
    expect(seal).toHaveAttribute('x', '15');
    expect(seal).toHaveAttribute('width', '8');
  });

  it('lets a caller force full detail below the threshold', () => {
    const { container } = render(<BrandMark size={16} detail="full" />);

    expect(rects(container)).toHaveLength(1);
  });

  it('lets a caller force compact detail above the threshold', () => {
    const { container } = render(<BrandMark size={64} detail="compact" />);

    expect(rects(container)).toHaveLength(0);
  });

  it('adds a plate when used as an icon, ahead of the glyph', () => {
    const { container } = render(<BrandMark size={48} tile />);
    const [plate, seal] = rects(container);

    expect(rects(container)).toHaveLength(2);
    expect(plate).toHaveClass('fill-forest');
    expect(seal).toHaveClass('fill-brass-light');
  });

  it('picks the brass that survives the ground it is read against', () => {
    const { container: onPaper } = render(<BrandMark />);
    const { container: onNavy } = render(<BrandMark tile />);
    const { container: onDark } = render(<BrandMark tone="dark" />);

    // `warn` on paper, `brass-light` on navy. The reverse pair measures under
    // 2.2:1 and reads as a smudge rather than a seal.
    expect(rects(onPaper)[0]).toHaveClass('fill-warn');
    expect(rects(onNavy)[1]).toHaveClass('fill-brass-light');
    expect(rects(onDark)[0]).toHaveClass('fill-brass-light');
  });

  it('inverts the plate on a dark surface so the mark is not lost in it', () => {
    const { container } = render(<BrandMark tile tone="dark" />);
    const [plate, seal] = rects(container);

    expect(plate).toHaveClass('fill-paper');
    expect(seal).toHaveClass('fill-warn');
  });

  it('flattens to one ink in monochrome, keeping the seal at full strength', () => {
    const { container } = render(<BrandMark tone="mono" />);
    const [bracket, seal] = container.querySelectorAll('path, rect');

    expect(bracket).toHaveClass('fill-current');
    expect(seal).toHaveClass('fill-current');
  });

  it('knocks the glyph out in cream when a monochrome mark is plated', () => {
    const { container } = render(<BrandMark tile tone="mono" />);
    const [plate, seal] = rects(container);

    expect(plate).toHaveClass('fill-current');
    expect(seal).toHaveClass('fill-cream');
  });

  it('forwards className and svg props', () => {
    const { container } = render(<BrandMark className="size-8 rotate-90" data-testid="mark" />);
    const svg = container.querySelector('svg');

    expect(svg).toHaveClass('size-8', 'rotate-90');
    expect(svg).toHaveAttribute('data-testid', 'mark');
  });
});

describe('BrandLockup', () => {
  it('names the product once, from the wordmark rather than the mark', () => {
    render(<BrandLockup />);

    expect(screen.getByText('Custotal')).toBeInTheDocument();
    // The wordmark is a valid accessible name, so the mark stays out of the
    // accessibility tree instead of duplicating it.
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('steps the wordmark with the mark so the lockup scales as one object', () => {
    const { rerender } = render(<BrandLockup size={32} />);
    expect(screen.getByText('Custotal')).toHaveClass('text-19');

    rerender(<BrandLockup size={40} />);
    expect(screen.getByText('Custotal')).toHaveClass('text-22');

    rerender(<BrandLockup size={64} />);
    expect(screen.getByText('Custotal')).toHaveClass('text-26');
  });

  it('stacks for the hero form', () => {
    const { container } = render(<BrandLockup orientation="stacked" size={64} />);

    expect(container.firstElementChild).toHaveClass('flex-col');
  });

  it('reverses the wordmark on a dark surface', () => {
    render(<BrandLockup tone="dark" />);

    expect(screen.getByText('Custotal')).toHaveClass('text-paper');
  });

  it('lets a host hide the wordmark without dropping it from the tree', () => {
    render(<BrandLockup wordmarkClassName="lg:sr-only" />);

    // The rail collapses to the plate alone, but the name stays queryable.
    expect(screen.getByText('Custotal')).toHaveClass('lg:sr-only');
  });
});
