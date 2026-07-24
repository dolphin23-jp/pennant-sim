import { aptitudeFor, calcOVR, effectiveOVR } from '../../engine';
import type { FieldPosition, Player } from '../../engine';
import { Card, SectionTitle, TermTooltip } from '../ui';

export type LineupSlot = FieldPosition | 'extra';
export type LineupAssignments = Record<LineupSlot, Player | null>;

const POSITION_LAYOUT: Record<FieldPosition, { left: string; top: string }> = {
  捕手: { left: '50%', top: '86%' },
  一塁手: { left: '78%', top: '64%' },
  二塁手: { left: '63%', top: '47%' },
  三塁手: { left: '22%', top: '64%' },
  遊撃手: { left: '37%', top: '47%' },
  左翼手: { left: '20%', top: '24%' },
  中堅手: { left: '50%', top: '12%' },
  右翼手: { left: '80%', top: '24%' },
};

export const FIELD_SLOT_ORDER = Object.keys(POSITION_LAYOUT) as FieldPosition[];
export const LINEUP_SLOT_ORDER: LineupSlot[] = [...FIELD_SLOT_ORDER, 'extra'];

export function slotEffectiveOVR(slot: LineupSlot, player: Player | null): number | null {
  if (!player) return null;
  return slot === 'extra'
    ? calcOVR(player)
    : effectiveOVR(player, slot);
}

export function slotAptitude(slot: LineupSlot, player: Player | null): number | null {
  if (!player || slot === 'extra') return null;
  return aptitudeFor(player, slot);
}

export function averageLineupOVR(assignments: LineupAssignments): number {
  const values = LINEUP_SLOT_ORDER.map((slot) => slotEffectiveOVR(slot, assignments[slot])).filter(
    (value): value is number => value !== null,
  );
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function SlotButton({
  slot,
  player,
  selected,
  onSelect,
}: {
  slot: LineupSlot;
  player: Player | null;
  selected: boolean;
  onSelect(slot: LineupSlot): void;
}) {
  const effective = slotEffectiveOVR(slot, player);
  const aptitude = slotAptitude(slot, player);
  const label = slot === 'extra' ? '追加打者' : slot;
  return (
    <button
      type="button"
      aria-label={`${label}${player ? `、${player.name}` : '、未選択'}を変更`}
      aria-pressed={selected}
      onClick={() => onSelect(slot)}
      style={{
        width: 'clamp(92px,24vw,126px)',
        minHeight: 66,
        padding: '7px 8px',
        border: `1px solid ${selected ? 'var(--color-accent)' : 'var(--color-border-strong)'}`,
        borderRadius: 10,
        color: 'var(--color-text)',
        background: selected ? 'var(--color-accent-soft)' : 'var(--color-surface-raised)',
        boxShadow: '0 5px 14px rgb(0 0 0 / 22%)',
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          display: 'block',
          color: selected ? 'var(--color-accent)' : 'var(--color-text-faint)',
          fontSize: 10,
          fontWeight: 900,
        }}
      >
        {label}
      </span>
      <strong
        style={{
          display: 'block',
          marginTop: 3,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {player?.name ?? '選手を選択'}
      </strong>
      <span style={{ display: 'block', marginTop: 3, color: 'var(--color-text-muted)', fontSize: 10 }}>
        {effective === null ? 'OVR -' : `実効 ${effective}`}
        {aptitude === null ? '' : ` / 適性 ${aptitude}%`}
      </span>
    </button>
  );
}

export function FieldDiagram({
  assignments,
  selectedSlot,
  onSelectSlot,
}: {
  assignments: LineupAssignments;
  selectedSlot: LineupSlot | null;
  onSelectSlot(slot: LineupSlot): void;
}) {
  const average = averageLineupOVR(assignments);
  return (
    <Card ariaLabel="守備位置の編成">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <SectionTitle>Field Diagram</SectionTitle>
        <div style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>
          <TermTooltip
            term="平均実効OVR"
            description="各守備位置の適性補正後OVRと、追加打者のOVRの平均です。"
          />{' '}
          <strong className={average >= 75 ? 'metric-highlight' : undefined}>{average.toFixed(1)}</strong>
        </div>
      </div>

      <div
        style={{
          position: 'relative',
          width: 'min(100%,620px)',
          height: 'clamp(420px,72vw,540px)',
          margin: '4px auto 12px',
          overflow: 'hidden',
          border: '1px solid var(--color-border)',
          borderRadius: 18,
          background:
            'radial-gradient(circle at 50% 82%, rgb(186 142 78 / 32%) 0 11%, transparent 11.5%), linear-gradient(145deg,rgb(33 116 71 / 36%),rgb(15 69 49 / 20%))',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: '50%',
            top: '57%',
            width: '42%',
            aspectRatio: '1',
            border: '1px solid rgb(255 255 255 / 22%)',
            transform: 'translate(-50%,-50%) rotate(45deg)',
          }}
        />
        {FIELD_SLOT_ORDER.map((position) => {
          const coordinates = POSITION_LAYOUT[position];
          return (
            <div
              key={position}
              style={{
                position: 'absolute',
                left: coordinates.left,
                top: coordinates.top,
                transform: 'translate(-50%,-50%)',
              }}
            >
              <SlotButton
                slot={position}
                player={assignments[position]}
                selected={selectedSlot === position}
                onSelect={onSelectSlot}
              />
            </div>
          );
        })}
      </div>

      <div style={{ display: 'grid', placeItems: 'center' }}>
        <SlotButton
          slot="extra"
          player={assignments.extra}
          selected={selectedSlot === 'extra'}
          onSelect={onSelectSlot}
        />
        <div style={{ marginTop: 6, color: 'var(--color-text-faint)', fontSize: 11 }}>
          9人目は守備につかない追加打者枠として扱います。
        </div>
      </div>
    </Card>
  );
}
