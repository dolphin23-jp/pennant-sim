import { useEffect, useMemo, useRef } from 'react';

import { FIELD_POSITIONS } from '../../data';
import { aptitudeFor, calcOVR, effectiveOVR } from '../../engine';
import type { FieldPosition, Player } from '../../engine';
import { Button, EmptyState } from '../ui';
import type { LineupAssignments, LineupSlot } from './FieldDiagram';
import { LINEUP_SLOT_ORDER } from './FieldDiagram';
import { PlayerStatusBadges } from './PlayerStatusBadges';

function bestPositionValue(player: Player): { position: FieldPosition; value: number } {
  return FIELD_POSITIONS.map((position) => ({
    position,
    value: effectiveOVR(player, position),
  })).sort((first, second) => second.value - first.value)[0] as {
    position: FieldPosition;
    value: number;
  };
}

function currentValue(player: Player, slot: LineupSlot): number {
  return slot === 'extra' ? calcOVR(player) : effectiveOVR(player, slot);
}

function assignedSlot(assignments: LineupAssignments, playerId: string): LineupSlot | null {
  return LINEUP_SLOT_ORDER.find((slot) => assignments[slot]?.id === playerId) ?? null;
}

export function PositionPickerSheet({
  slot,
  players,
  assignments,
  onSelect,
  onClose,
}: {
  slot: LineupSlot;
  players: Player[];
  assignments: LineupAssignments;
  onSelect(player: Player): void;
  onClose(): void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const candidates = useMemo(
    () =>
      players
        .map((player) => {
          const best = bestPositionValue(player);
          const value = currentValue(player, slot);
          return {
            player,
            best,
            value,
            aptitude: slot === 'extra' ? null : aptitudeFor(player, slot),
            currentSlot: assignedSlot(assignments, player.id),
          };
        })
        .sort((first, second) => {
          const valueDifference = second.value - first.value;
          return valueDifference || first.player.name.localeCompare(second.player.name, 'ja');
        }),
    [assignments, players, slot],
  );

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.requestAnimationFrame(() => dialogRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const slotLabel = slot === 'extra' ? '追加打者' : slot;

  return (
    <div
      className="player-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <div
        className="player-modal"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="position-picker-title"
        tabIndex={-1}
        style={{ maxWidth: 720 }}
      >
        <header className="player-modal__header">
          <div>
            <h1 className="player-modal__title" id="position-picker-title">
              {slotLabel}の選手を選択
            </h1>
            <div className="player-modal__meta">
              {slot === 'extra'
                ? '守備につかない9人目の打者です。OVR順に表示しています。'
                : `${slot}での実効OVR順です。選択済み選手を選ぶと配置を入れ替えます。`}
            </div>
          </div>
          <Button onClick={onClose} color="var(--color-surface-muted)" ariaLabel="選手選択を閉じる">
            閉じる
          </Button>
        </header>
        <div className="player-modal__body">
          {!candidates.length ? (
            <EmptyState>選択できる野手がいません。</EmptyState>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {candidates.map(({ player, best, value, aptitude, currentSlot }) => {
                const injured = (player.injuryDays ?? 0) > 0;
                const current = currentSlot === slot;
                const difference = slot === 'extra' ? null : value - best.value;
                return (
                  <button
                    key={player.id}
                    type="button"
                    disabled={injured}
                    aria-label={`${player.name}を${slotLabel}に配置${currentSlot && !current ? `、現在は${currentSlot === 'extra' ? '追加打者' : currentSlot}` : ''}`}
                    onClick={() => onSelect(player)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(130px,1.5fr) repeat(3,minmax(72px,0.65fr))',
                      alignItems: 'center',
                      gap: 8,
                      minHeight: 62,
                      padding: '9px 10px',
                      border: `1px solid ${current ? 'var(--color-accent)' : 'var(--color-border)'}`,
                      borderRadius: 10,
                      color: injured ? 'var(--color-text-faint)' : 'var(--color-text)',
                      background: current ? 'var(--color-accent-soft)' : 'var(--color-surface-raised)',
                      cursor: injured ? 'not-allowed' : 'pointer',
                      opacity: injured ? 0.62 : 1,
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ minWidth: 0 }}>
                      <strong
                        style={{
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {player.name}
                      </strong>
                      <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>
                        本職 {player.pos ?? '-'}
                        {currentSlot
                          ? ` / ${currentSlot === slot ? '現在配置' : `${currentSlot === 'extra' ? '追加打者' : currentSlot}から入替`}`
                          : ' / ベンチ'}
                      </span>
                      <span style={{ display: 'block', marginTop: 3 }}>
                        <PlayerStatusBadges player={player} compact />
                      </span>
                    </span>
                    <span style={{ textAlign: 'center' }}>
                      <span style={{ display: 'block', color: 'var(--color-text-faint)', fontSize: 10 }}>
                        {slot === 'extra' ? 'OVR' : '実効OVR'}
                      </span>
                      <strong className={value >= 80 ? 'metric-highlight' : undefined}>{value}</strong>
                    </span>
                    <span style={{ textAlign: 'center' }}>
                      <span style={{ display: 'block', color: 'var(--color-text-faint)', fontSize: 10 }}>
                        適性
                      </span>
                      <strong>{aptitude === null ? '-' : `${aptitude}%`}</strong>
                    </span>
                    <span style={{ textAlign: 'center' }}>
                      <span style={{ display: 'block', color: 'var(--color-text-faint)', fontSize: 10 }}>
                        最良位置比
                      </span>
                      <strong
                        className={difference === 0 ? 'metric-highlight' : undefined}
                        title={`最良は${best.position}（実効OVR ${best.value}）`}
                      >
                        {difference === null ? '-' : difference === 0 ? '±0' : String(difference)}
                      </strong>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
