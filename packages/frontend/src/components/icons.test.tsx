// Smoke tests for the shared inline SVG icon set.
//
// Every icon is produced by the same `base()` factory, so the tests assert the
// shared defaults once per icon (size, viewBox, stroke styling) plus prop
// forwarding, which is what callers rely on for sizing (`className="size-4"`).
import { cleanup, render } from '@testing-library/react';
import type { ReactElement, SVGProps } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import * as iconModule from './icons';

type IconComponent = (props: SVGProps<SVGSVGElement>) => ReactElement;

const icons = Object.entries(iconModule).filter(
  (entry): entry is [string, IconComponent] => typeof entry[1] === 'function',
);

afterEach(cleanup);

describe('icons', () => {
  it('exports the shared icon set', () => {
    expect(icons.length).toBeGreaterThanOrEqual(20);
  });

  it.each(icons)('%s renders an svg with the shared defaults', (_name, Icon) => {
    const { container } = render(<Icon />);
    const svg = container.querySelector('svg');

    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('width', '20');
    expect(svg).toHaveAttribute('height', '20');
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
    expect(svg).toHaveAttribute('fill', 'none');
    expect(svg).toHaveAttribute('stroke', 'currentColor');
    expect(svg).toHaveAttribute('stroke-width', '1.75');
  });

  it('forwards className so Tailwind sizing utilities apply', () => {
    const { container } = render(<iconModule.SearchIcon className="size-4" />);

    expect(container.querySelector('svg')).toHaveClass('size-4');
  });

  it('lets callers override the default dimensions', () => {
    const { container } = render(<iconModule.SearchIcon width={32} height={32} />);

    expect(container.querySelector('svg')).toHaveAttribute('width', '32');
    expect(container.querySelector('svg')).toHaveAttribute('height', '32');
  });

  it('forwards arbitrary svg props such as aria attributes', () => {
    const { container } = render(<iconModule.AlertIcon aria-label="Warning" role="img" />);

    expect(container.querySelector('svg')).toHaveAttribute('aria-label', 'Warning');
    expect(container.querySelector('svg')).toHaveAttribute('role', 'img');
  });
});
