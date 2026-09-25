import { useEffect, useRef } from 'react';

import type { GameBoxScore, GamePlayLog, GameSummary, TeamKey } from '../../engine';
import { PlayByPlay } from './PlayByPlay';
import { Button } from '../ui';
import { GameDetailView } from './GameDetailView';
import { useFocusTrap } from './useFocusTrap';

export function GameDetailModal({
  box,
  playLog,
  onSelectPlayer,
  onClose,
  onWatchLive,
}: {
  box: GameSummary | GameBoxScore | null;
  /** Play-by-play, kept for the user's most recent games. */
  playLog?: GamePlayLog | null;
  onSelectPlayer?(playerId: string, teamKey: TeamKey): void;
  onClose(): void;
  /** Replays the game in the live viewer, for games whose play-by-play is kept. */
  onWatchLive?: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!box) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.requestAnimationFrame(() => dialogRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [box]);

  useEffect(() => {
    if (!box) return;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [box, onClose]);

  useFocusTrap(dialogRef, Boolean(box));

  if (!box) return null;

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
        aria-labelledby="game-modal-title"
        tabIndex={-1}
      >
        <header className="player-modal__header">
          <div>
            <h1 className="player-modal__title" id="game-modal-title">
              試合結果
            </h1>
            <div className="player-modal__meta">{box.date}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {onWatchLive && (
              <Button onClick={onWatchLive} ariaLabel="この試合をライブで見る">
                ライブで見る
              </Button>
            )}
            <Button
              onClick={onClose}
              color="var(--color-surface-muted)"
              ariaLabel="試合詳細を閉じる"
            >
              閉じる
            </Button>
          </div>
        </header>
        <div className="player-modal__body">
          <div className="stack">
            {playLog && <PlayByPlay log={playLog} />}
            <GameDetailView box={box} onSelectPlayer={onSelectPlayer} />
          </div>
        </div>
      </div>
    </div>
  );
}
