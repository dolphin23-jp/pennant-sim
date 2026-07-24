import { useEffect, useRef } from 'react';

import { calcOVR } from '../../engine';
import type { Player } from '../../engine';
import { Button, EmptyState } from '../ui';
import { PlayerStatusBadges } from './PlayerStatusBadges';

export function RotationSwapSheet({
  candidate,
  rotation,
  onSwap,
  onClose,
}: {
  candidate: Player;
  rotation: Player[];
  onSwap(slotIndex: number): void;
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
        aria-labelledby="rotation-swap-title"
        tabIndex={-1}
        style={{ maxWidth: 620 }}
      >
        <header className="player-modal__header">
          <div>
            <h1 className="player-modal__title" id="rotation-swap-title">
              {candidate.name}を昇格
            </h1>
            <div className="player-modal__meta">
              入れ替えるローテーションの枠を選んでください。外れた投手は候補に戻ります。
            </div>
          </div>
          <Button onClick={onClose} color="var(--color-surface-muted)" ariaLabel="昇格先の選択を閉じる">
            閉じる
          </Button>
        </header>
        <div className="player-modal__body">
          {!rotation.length ? (
            <EmptyState>ローテーション枠がありません。</EmptyState>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {rotation.map((pitcher, index) => (
                <button
                  key={pitcher.id}
                  type="button"
                  aria-label={`${candidate.name}をローテーション${index + 1}番手の${pitcher.name}と入れ替え`}
                  onClick={() => onSwap(index)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '42px minmax(0,1fr) auto',
                    alignItems: 'center',
                    gap: 10,
                    minHeight: 64,
                    padding: '9px 10px',
                    border: '1px solid var(--color-border)',
                    borderRadius: 10,
                    color: 'var(--color-text)',
                    background: 'var(--color-surface-raised)',
                    cursor: 'pointer',
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
                      fontFamily: 'var(--font-display)',
                      fontSize: 16,
                    }}
                  >
                    {index + 1}
                  </strong>
                  <span style={{ minWidth: 0 }}>
                    <strong style={{ display: 'block' }}>{pitcher.name}</strong>
                    <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>
                      OVR {calcOVR(pitcher)} / スタミナ {Math.round(pitcher.p.stam)}
                    </span>
                    <span style={{ display: 'block', marginTop: 3 }}>
                      <PlayerStatusBadges player={pitcher} compact />
                    </span>
                  </span>
                  <span style={{ color: 'var(--color-text-faint)', fontSize: 11 }}>入替</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
