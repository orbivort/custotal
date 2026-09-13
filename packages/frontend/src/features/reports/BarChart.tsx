export function BarChart({
  data,
  formatValue,
}: {
  data: { label: string; value: number }[];
  formatValue: (n: number) => string;
}) {
  const width = 640;
  const height = 240;
  const padX = 24;
  const padTop = 28;
  const padBottom = 46;
  const max = Math.max(...data.map((d) => d.value), 1);
  const slot = (width - padX * 2) / Math.max(data.length, 1);
  const barW = Math.min(64, slot * 0.55);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Bar chart">
      {data.map((d, i) => {
        const cx = padX + slot * i + slot / 2;
        const h = (d.value / max) * (height - padTop - padBottom);
        const x = cx - barW / 2;
        const y = height - padBottom - h;
        return (
          <g key={d.label}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={Math.max(h, 2)}
              rx={5}
              fill="var(--color-forest)"
            />
            <text
              x={cx}
              y={y - 8}
              textAnchor="middle"
              fontSize="11.5"
              fill="var(--color-ink-muted)"
              fontWeight={500}
            >
              {formatValue(d.value)}
            </text>
            <text
              x={cx}
              y={height - padBottom + 18}
              textAnchor="middle"
              fontSize="11"
              fill="var(--color-ink-faint)"
            >
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
