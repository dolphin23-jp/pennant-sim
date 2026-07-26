import { useEffect, useRef } from 'react';

import { calcOVR } from '../../engine';
import type { Player } from '../../engine';
import { Button, EmptyState } from '../ui';
import { PlayerStatusBadges } from './PlayerStatusBadges';
import { useFocusTrap } from './useFocusTrap';

export function BullpenPickerSheet({
  targetIndex,
  closers,
  onSelect,
  onClose,
}: {
  targetIndex: number;
  closers: Player[];
  onSelect(pitcher: Player): void;
  onClose(): void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

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

  useFocusTrap(dialogRef, true);

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
        aria-labelledby="bullpen-picker-title"
        tabIndex={-1}
        style={{ maxWidth: 620 }}
      >
        <header className="player-modal__header">
          <div>
            <h1 className="player-modal__title" id="bullpen-picker-title">
              抑え 第{targetIndex + 1}優先を選択
            </h1>
            <div className="player-modal__meta">
              クローザーロールの投手から選びます。選択した投手と現在の投手を入れ替えます。
            </div>
          </div>
          <Button onClick={onClose} color="var(--color-surface-muted)" ariaLabel="抑え選択を閉じる">
            閉じる
          </Button>
        </header>
        <div className="player-modal__body">
          {!closers.length ? (
            <EmptyState>クローザーロールの投手がいません。</EmptyState>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {closers.map((pitcher, index) => {
                const injured = (pitcher.injuryDays ?? 0) > 0;
                return (
                  <button
                    key={pitcher.id}
                    type="button"
                    disabled={injured}
                    aria-label={`${pitcher.name}を抑え第${targetIndex + 1}優先に設定、現在第${index + 1}優先、OVR${calcOVR(pitcher)}`}
                    onClick={() => onSelect(pitcher)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '42px minmax(0,1fr) auto',
                      alignItems: 'center',
                      gap: 10,
                      minHeight: 64,
                      padding: '9px 10px',
                      border: `1px solid ${index === targetIndex ? 'var(--color-accent)' : 'var(--color-border)'}`,
                      borderRadius: 10,
                      color: injured ? 'var(--color-text-faint)' : 'var(--color-text)',
                      background:
                        index === targetIndex
                          ? 'var(--color-accent-soft)'
                          : 'var(--color-surface-raised)',
                      cursor: injured ? 'not-allowed' : 'pointer',
                      opacity: injured ? 0.62 : 1,
                      textAlign: 'left',
                    }}
                  >
                    <strong
                      style={{
                        display: 'grid',
                        width: 36,
                        height: 36,
                        placeItems: 'center',
                        borderRadius: 999,
                        color: 'var(--color-accent)',
                        background: 'var(--color-surface-muted)',
                      }}
                    >
                      {index + 1}
                    </strong>
                    <span style={{ minWidth: 0 }}>
                      <strong style={{ display: 'block' }}>{pitcher.name}</strong>
                      <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>
                        OVR {calcOVR(pitcher)} / 疲労 {Math.round(pitcher.fatigue ?? 0)}
                      </span>
                      <span style={{ display: 'block', marginTop: 3 }}>
                        <PlayerStatusBadges player={pitcher} compact />
                      </span>
                    </span>
                    <span style={{ color: 'var(--color-text-faint)', fontSize: 11 }}>
                      {index === targetIndex ? '現在' : '選択'}
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
