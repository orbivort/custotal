// Component tests for BarChart.
//
// The chart is pure SVG with no data layer, so these tests render it directly
// and assert the emitted geometry: bar count, the scaling of every bar against
// the largest value, the minimum bar height for zero values, the bar-width cap,
// and that `formatValue` drives the value labels.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BarChart } from './BarChart';

// Geometry constants mirrored from the component (see BarChart.tsx).
const WIDTH = 640;
const HEIGHT = 240;
const PAD_X = 24;
const PAD_TOP = 28;
const PAD_BOTTOM = 46;
/** Height of the drawable band: the tallest bar fills exactly this. */
const PLOT_HEIGHT = HEIGHT - PAD_TOP - PAD_BOTTOM; // 166
/** y of the baseline (bottom of every bar). */
const BASELINE_Y = HEIGHT - PAD_BOTTOM; // 194

interface Bar {
  valueLabel: string;
  axisLabel: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Reads every rendered bar group back out of the SVG. */
function bars(container: HTMLElement): Bar[] {
  return Array.from(container.querySelectorAll('g')).map((g) => {
    const rect = g.querySelector('rect');
    const texts = Array.from(g.querySelectorAll('text')).map((t) => t.textContent ?? '');
    return {
      valueLabel: texts[0] ?? '',
      axisLabel: texts[1] ?? '',
      x: Number(rect?.getAttribute('x')),
      y: Number(rect?.getAttribute('y')),
      width: Number(rect?.getAttribute('width')),
      height: Number(rect?.getAttribute('height')),
    };
  });
}

function renderChart(
  data: { label: string; value: number }[],
  formatValue = (n: number) => `$ ${n / 100}`,
) {
  return render(<BarChart data={data} formatValue={formatValue} />);
}

// Vitest runs without `globals: true`, so @testing-library/react cannot register
// its automatic afterEach cleanup; unmount between tests explicitly.
afterEach(() => cleanup());

describe('BarChart', () => {
  it('exposes itself to assistive technology as a labelled image', () => {
    const { container } = renderChart([{ label: 'Won', value: 100 }]);

    const svg = screen.getByRole('img', { name: 'Bar chart' });
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg).toHaveAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
    expect(svg).toHaveClass('w-full');
    expect(container.querySelectorAll('rect')).toHaveLength(1);
  });

  it('renders one bar per datum with its axis label and formatted value', () => {
    const { container } = renderChart([
      { label: 'Discovery', value: 150000 },
      { label: 'Proposal', value: 50000 },
    ]);

    const rendered = bars(container);
    expect(rendered.map((b) => b.axisLabel)).toEqual(['Discovery', 'Proposal']);
    expect(rendered.map((b) => b.valueLabel)).toEqual(['$ 1500', '$ 500']);
  });

  it('scales every bar against the largest value, filling the plot band', () => {
    const { container } = renderChart([
      { label: 'Big', value: 100 },
      { label: 'Half', value: 50 },
      { label: 'Quarter', value: 25 },
    ]);

    const rendered = bars(container);
    expect(rendered.map((b) => b.height)).toEqual([PLOT_HEIGHT, PLOT_HEIGHT / 2, PLOT_HEIGHT / 4]);
    // Bars hang from the baseline: taller bars start higher up the canvas.
    expect(rendered.map((b) => b.y)).toEqual([
      BASELINE_Y - PLOT_HEIGHT,
      BASELINE_Y - PLOT_HEIGHT / 2,
      BASELINE_Y - PLOT_HEIGHT / 4,
    ]);
  });

  it('gives every bar the full plot height when all values are equal', () => {
    const { container } = renderChart([
      { label: 'A', value: 7 },
      { label: 'B', value: 7 },
    ]);

    expect(bars(container).map((b) => b.height)).toEqual([PLOT_HEIGHT, PLOT_HEIGHT]);
  });

  it('clamps a zero-value bar to a minimum height so it stays visible', () => {
    const { container } = renderChart([{ label: 'Empty', value: 0 }]);

    const rendered = bars(container);
    expect(rendered).toHaveLength(1);
    expect(rendered[0].height).toBe(2);
    expect(rendered[0].y).toBe(BASELINE_Y);
    expect(rendered[0].valueLabel).toBe('$ 0');
  });

  it('centers each bar in its slot and spaces slots evenly', () => {
    const { container } = renderChart([
      { label: 'A', value: 10 },
      { label: 'B', value: 20 },
      { label: 'C', value: 30 },
    ]);

    const slot = (WIDTH - PAD_X * 2) / 3;
    const barW = Math.min(64, slot * 0.55);
    const rendered = bars(container);

    expect(rendered[0].width).toBeCloseTo(barW, 6);
    // First bar is centered in the first slot (padX + slot/2 - barW/2).
    expect(rendered[0].x).toBeCloseTo(PAD_X + slot / 2 - barW / 2, 6);
    // Slots advance by a constant step.
    expect(rendered[1].x - rendered[0].x).toBeCloseTo(slot, 6);
    expect(rendered[2].x - rendered[1].x).toBeCloseTo(slot, 6);
  });

  it('caps the bar width at 64px when there are few bars', () => {
    const { container } = renderChart([
      { label: 'A', value: 10 },
      { label: 'B', value: 20 },
    ]);

    expect(bars(container).map((b) => b.width)).toEqual([64, 64]);
  });

  it('narrows bars proportionally when there are many of them', () => {
    const data = Array.from({ length: 20 }, (_, i) => ({ label: `S${i}`, value: i + 1 }));
    const { container } = renderChart(data);

    const slot = (WIDTH - PAD_X * 2) / 20;
    const expected = slot * 0.55;
    const rendered = bars(container);
    expect(rendered).toHaveLength(20);
    expect(rendered[0].width).toBeCloseTo(expected, 6);
    expect(rendered[0].width).toBeLessThan(64);
  });

  it('renders an empty chart (no bars) when there is no data', () => {
    const { container } = renderChart([]);

    expect(container.querySelectorAll('g')).toHaveLength(0);
    expect(container.querySelectorAll('rect')).toHaveLength(0);
    expect(screen.getByRole('img', { name: 'Bar chart' })).toBeInTheDocument();
  });

  it('hands every value to formatValue, including negatives', () => {
    const formatValue = (n: number) => `v:${n}`;
    const { container } = renderChart([{ label: 'Down', value: -5 }], formatValue);

    expect(bars(container)[0].valueLabel).toBe('v:-5');
  });
});
