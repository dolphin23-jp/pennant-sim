import { displayOVRBreakdown } from '../../engine';
import type { FieldPosition, Player } from '../../engine';
import { TermTooltip } from '../ui';

function signed(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded >= 0 ? '+' : ''}${rounded}`;
}

export function DisplayOVRValue({
  player,
  position,
  compact = false,
}: {
  player: Player;
  position?: FieldPosition;
  compact?: boolean;
}) {
  const breakdown = displayOVRBreakdown(player, position);
  const changed = breakdown.total !== breakdown.base;
  const label = `基本総合値 ${breakdown.base}、特殊能力補正 ${signed(breakdown.specialAdjustment)}、特殊込み ${breakdown.total}`;

  if (compact) {
    return (
      <span aria-label={label} style={{ whiteSpace: 'nowrap' }}>
        <span style={{ color: 'var(--color-text-faint)' }}>{breakdown.base}</span>
        <span aria-hidden="true" style={{ margin: '0 4px', color: 'var(--color-text-faint)' }}>→</span>
        <strong className={breakdown.total >= 80 ? 'metric-highlight' : undefined}>
          {breakdown.total}
        </strong>
        {changed && (
          <small style={{ marginLeft: 4, color: breakdown.specialAdjustment > 0 ? 'var(--color-good)' : 'var(--color-danger)' }}>
            {signed(breakdown.specialAdjustment)}
          </small>
        )}
      </span>
    );
  }

  return (
    <span aria-label={label} style={{ display: 'inline-grid', gap: 3 }}>
      <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>
        <TermTooltip
          term="基本総合値"
          description="能力値と守備位置適性だけで算出した、従来の実効OVRです。試合計算は引き続きこちらを使います。"
        />{' '}
        {breakdown.base}
      </span>
      <strong className={breakdown.total >= 80 ? 'metric-highlight' : undefined}>
        特殊込み {breakdown.total}
        {changed ? `（${signed(breakdown.specialAdjustment)}）` : ''}
      </strong>
    </span>
  );
}
