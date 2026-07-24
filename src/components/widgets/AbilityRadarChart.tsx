import './phaseB.css';

export interface AbilityRadarItem {
  label: string;
  value: number | undefined;
}

export interface AbilityRadarSeries {
  label: string;
  color: string;
  items: AbilityRadarItem[];
}

const SIZE = 260;
const CENTER = SIZE / 2;
const RADIUS = 84;
const LABEL_RADIUS = 111;
const MAX_VALUE = 120;
const GRID_LEVELS = [0.25, 0.5, 0.75, 1];

function pointAt(index: number, count: number, radius: number): { x: number; y: number } {
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count;
  return {
    x: CENTER + Math.cos(angle) * radius,
    y: CENTER + Math.sin(angle) * radius,
  };
}

function polygonPoints(count: number, radius: number): string {
  return Array.from({ length: count }, (_, index) => {
    const point = pointAt(index, count, radius);
    return `${point.x},${point.y}`;
  }).join(' ');
}

function valuePolygon(items: AbilityRadarItem[]): string {
  return items
    .map((item, index) => {
      const normalized = Math.max(0, Math.min(MAX_VALUE, Math.round(item.value ?? 0))) / MAX_VALUE;
      const point = pointAt(index, items.length, RADIUS * normalized);
      return `${point.x},${point.y}`;
    })
    .join(' ');
}

export function AbilityRadarChart({
  items,
  series,
}: {
  items?: AbilityRadarItem[];
  series?: AbilityRadarSeries[];
}) {
  const resolvedSeries: AbilityRadarSeries[] =
    series ?? (items ? [{ label: '', color: 'var(--color-accent)', items }] : []);
  const axis = resolvedSeries[0]?.items ?? [];
  if (axis.length < 3) return null;
  const multi = resolvedSeries.length > 1;
  const summary = resolvedSeries
    .map((entry) => {
      const values = entry.items
        .map((item) => `${item.label}${Math.round(item.value ?? 0)}`)
        .join('、');
      return entry.label ? `${entry.label}: ${values}` : values;
    })
    .join('。');

  return (
    <figure className="ability-radar">
      <svg
        className="ability-radar__svg"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={`能力レーダーチャート。${summary}`}
      >
        {GRID_LEVELS.map((level) => (
          <polygon
            className="ability-radar__grid"
            key={level}
            points={polygonPoints(axis.length, RADIUS * level)}
          />
        ))}
        {axis.map((item, index) => {
          const outer = pointAt(index, axis.length, RADIUS);
          const label = pointAt(index, axis.length, LABEL_RADIUS);
          const anchor = label.x < CENTER - 8 ? 'end' : label.x > CENTER + 8 ? 'start' : 'middle';
          return (
            <g key={item.label}>
              <line
                className="ability-radar__axis"
                x1={CENTER}
                y1={CENTER}
                x2={outer.x}
                y2={outer.y}
              />
              <text
                className="ability-radar__label"
                x={label.x}
                y={label.y}
                textAnchor={anchor}
                dominantBaseline="middle"
              >
                {item.label}
              </text>
            </g>
          );
        })}
        {resolvedSeries.map((entry, seriesIndex) => (
          <polygon
            className="ability-radar__value"
            key={entry.label || seriesIndex}
            points={valuePolygon(entry.items)}
            style={{
              fill: `color-mix(in srgb, ${entry.color} ${multi ? 14 : 24}%, transparent)`,
              stroke: entry.color,
            }}
          />
        ))}
        {resolvedSeries.map((entry, seriesIndex) =>
          entry.items.map((item, index) => {
            const normalized =
              Math.max(0, Math.min(MAX_VALUE, Math.round(item.value ?? 0))) / MAX_VALUE;
            const point = pointAt(index, entry.items.length, RADIUS * normalized);
            return (
              <circle
                className="ability-radar__point"
                key={`${entry.label || seriesIndex}-${item.label}`}
                cx={point.x}
                cy={point.y}
                r={multi ? 2.5 : 3.5}
                style={{ stroke: entry.color }}
              />
            );
          }),
        )}
      </svg>
      {multi ? (
        <ul className="ability-radar__legend" aria-hidden="true">
          {resolvedSeries.map((entry, seriesIndex) => (
            <li key={entry.label || seriesIndex}>
              <span className="ability-radar__legend-swatch" style={{ background: entry.color }} />
              {entry.label}
            </li>
          ))}
        </ul>
      ) : (
        <figcaption>能力バランス</figcaption>
      )}
    </figure>
  );
}
