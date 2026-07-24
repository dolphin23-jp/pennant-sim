import './phaseB.css';

export interface AbilityRadarItem {
  label: string;
  value: number | undefined;
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

export function AbilityRadarChart({ items }: { items: AbilityRadarItem[] }) {
  if (items.length < 3) return null;
  const valuePoints = items
    .map((item, index) => {
      const normalized = Math.max(0, Math.min(MAX_VALUE, Math.round(item.value ?? 0))) / MAX_VALUE;
      const point = pointAt(index, items.length, RADIUS * normalized);
      return `${point.x},${point.y}`;
    })
    .join(' ');
  const summary = items.map((item) => `${item.label}${Math.round(item.value ?? 0)}`).join('、');

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
            points={polygonPoints(items.length, RADIUS * level)}
          />
        ))}
        {items.map((item, index) => {
          const outer = pointAt(index, items.length, RADIUS);
          const label = pointAt(index, items.length, LABEL_RADIUS);
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
        <polygon className="ability-radar__value" points={valuePoints} />
        {items.map((item, index) => {
          const normalized = Math.max(0, Math.min(MAX_VALUE, Math.round(item.value ?? 0))) / MAX_VALUE;
          const point = pointAt(index, items.length, RADIUS * normalized);
          return <circle className="ability-radar__point" key={item.label} cx={point.x} cy={point.y} r={3.5} />;
        })}
      </svg>
      <figcaption>能力バランス</figcaption>
    </figure>
  );
}
