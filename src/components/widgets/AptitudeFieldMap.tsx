import { aptitudeRank } from '../../engine';
import type { PositionAptitude } from '../../engine';
import { aptitudeToneColor } from './aptitudeDisplay';
import { FIELD_SLOT_ORDER, POSITION_LAYOUT } from './FieldDiagram';
import './phaseB.css';

const SHORT_LABEL: Record<(typeof FIELD_SLOT_ORDER)[number], string> = {
  捕手: '捕',
  一塁手: '一',
  二塁手: '二',
  三塁手: '三',
  遊撃手: '遊',
  左翼手: '左',
  中堅手: '中',
  右翼手: '右',
};

function percentToNumber(value: string): number {
  return Number.parseFloat(value);
}

export function AptitudeFieldMap({ positions }: { positions: PositionAptitude[] }) {
  const aptitudeByPosition = new Map(positions.map((entry) => [entry.pos, entry.apt]));
  const summary = FIELD_SLOT_ORDER.map((position) => {
    const aptitude = aptitudeByPosition.get(position);
    return `${position}${aptitude === undefined ? '対象外' : `${Math.round(aptitude)}%`}`;
  }).join('、');

  return (
    <figure className="aptitude-field-map">
      <svg
        viewBox="0 0 100 100"
        role="img"
        aria-label={`ポジション適性マップ。${summary}`}
        className="aptitude-field-map__svg"
      >
        <polygon className="aptitude-field-map__dirt" points="50,88 74,65 50,49 26,65" />
        {FIELD_SLOT_ORDER.map((position) => {
          const aptitude = aptitudeByPosition.get(position) ?? null;
          const color = aptitudeToneColor(aptitude);
          const coordinates = POSITION_LAYOUT[position];
          const cx = percentToNumber(coordinates.left);
          const cy = percentToNumber(coordinates.top);
          const rank = aptitude === null ? null : aptitudeRank(aptitude);
          return (
            <g key={position}>
              <circle
                className="aptitude-field-map__dot"
                cx={cx}
                cy={cy}
                r={9}
                style={{
                  fill: color
                    ? `color-mix(in srgb, ${color} 30%, var(--color-surface-raised))`
                    : 'var(--color-surface-muted)',
                  stroke: color ?? 'var(--color-border-strong)',
                }}
              />
              <text className="aptitude-field-map__label" x={cx} y={cy + 1}>
                {SHORT_LABEL[position]}
              </text>
              <text
                className="aptitude-field-map__value"
                x={cx}
                y={cy + 15}
                style={{ fill: color ?? 'var(--color-text-faint)' }}
              >
                {aptitude === null ? '-' : `${rank}`}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption>ポジション適性マップ</figcaption>
    </figure>
  );
}
