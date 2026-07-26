import { useCallback } from 'react';

import { calcOVR } from '../../engine';
import type { Player } from '../../engine';
import { Card, EmptyState, SectionTitle } from '../ui';
import { PlayerStatusBadges } from './PlayerStatusBadges';
import { usePointerDrag } from './usePointerDrag';

export function RotationOrderList({
  pitchers,
  slotCount,
  onMove,
  onReorder,
  onSelectPlayer,
}: {
  pitchers: Player[];
  slotCount: number;
  onMove(index: number, direction: -1 | 1): void;
  onReorder(activeId: string, overId: string): void;
  onSelectPlayer(player: Player): void;
}) {
  const pitcherIds = pitchers.map((pitcher) => pitcher.id);
  const handleDrop = useCallback(
    (activeId: string, overId: string) => {
      if (activeId !== overId && pitcherIds.includes(activeId) && pitcherIds.includes(overId)) {
        onReorder(activeId, overId);
      }
    },
    [onReorder, pitcherIds],
  );
  const drag = usePointerDrag(handleDrop);

  return (
    <Card ariaLabel="先発ローテーションの編集">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
          marginBottom: 4,
        }}
      >
        <SectionTitle>Starting Rotation</SectionTitle>
        <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>
          <strong style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}>
            {pitchers.length}
          </strong>
          {' / '}
          {slotCount}枠
        </span>
      </div>
      {!pitchers.length ? (
        <EmptyState>先発ロールの投手がいません。</EmptyState>
      ) : (
        <ol style={{ display: 'grid', gap: 7, margin: 0, padding: 0, listStyle: 'none' }}>
          {pitchers.map((pitcher, index) => {
            const dragging = drag.activeId === pitcher.id;
            const dropTarget =
              drag.activeId !== null && drag.overId === pitcher.id && drag.activeId !== pitcher.id;
            return (
              <li
                key={pitcher.id}
                data-drop-id={pitcher.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '40px 36px minmax(0,1fr) auto',
                  alignItems: 'center',
                  gap: 8,
                  minHeight: 62,
                  padding: '8px 9px',
                  border: `1px solid ${dropTarget ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  borderRadius: 10,
                  background: dropTarget
                    ? 'var(--color-accent-soft)'
                    : 'var(--color-surface-raised)',
                  boxShadow: dropTarget ? '0 0 0 2px var(--color-accent)' : undefined,
                  opacity: dragging ? 0.56 : 1,
                  transform: dropTarget ? 'translateY(2px)' : undefined,
                  transition: 'opacity 120ms ease, transform 120ms ease, box-shadow 120ms ease',
                }}
              >
                <strong
                  aria-label={`ローテーション${index + 1}番手`}
                  style={{
                    display: 'grid',
                    width: 36,
                    height: 36,
                    placeItems: 'center',
                    borderRadius: 999,
                    color: 'var(--color-accent)',
                    background: 'var(--color-accent-soft)',
                    fontFamily: 'var(--font-display)',
                    fontSize: 16,
                  }}
                >
                  {index + 1}
                </strong>
                <button
                  type="button"
                  {...drag.handleProps(pitcher.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowUp' && index > 0) {
                      event.preventDefault();
                      onMove(index, -1);
                    } else if (event.key === 'ArrowDown' && index < pitchers.length - 1) {
                      event.preventDefault();
                      onMove(index, 1);
                    }
                  }}
                  aria-label={`${pitcher.name}をドラッグまたは上下矢印キーでローテーション順を変更`}
                  title="ドラッグまたは上下矢印キーで登板順変更"
                  style={{
                    display: 'grid',
                    width: 36,
                    height: 36,
                    placeItems: 'center',
                    padding: 0,
                    border: '1px solid var(--color-border)',
                    borderRadius: 8,
                    color: dragging ? 'var(--color-accent)' : 'var(--color-text-muted)',
                    background: 'var(--color-surface-muted)',
                    cursor: dragging ? 'grabbing' : 'grab',
                    touchAction: 'none',
                    fontSize: 18,
                  }}
                >
                  ⠿
                </button>
                <div style={{ minWidth: 0 }}>
                  <button
                    type="button"
                    className="roster-player-button"
                    aria-label={`${pitcher.name}の詳細を表示${pitcher.activeRoster === false ? '、二軍登録中' : ''}`}
                    onClick={() => onSelectPlayer(pitcher)}
                    style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  >
                    {pitcher.name}
                  </button>
                  <div style={{ marginTop: 3, color: 'var(--color-text-muted)', fontSize: 11 }}>
                    OVR {calcOVR(pitcher)} / スタミナ {Math.round(pitcher.p.stam)}
                    {pitcher.activeRoster === false && (
                      <span
                        title="二軍に登録されています"
                        style={{
                          marginLeft: 5,
                          padding: '1px 4px',
                          borderRadius: 4,
                          color: 'var(--color-warning)',
                          background: 'color-mix(in srgb, var(--color-warning) 20%, transparent)',
                          fontSize: 9,
                          fontWeight: 900,
                        }}
                      >
                        二軍
                      </span>
                    )}
                  </div>
                  <div style={{ marginTop: 3 }}>
                    <PlayerStatusBadges player={pitcher} compact />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,36px)', gap: 5 }}>
                  <button
                    type="button"
                    disabled={index === 0}
                    aria-label={`${pitcher.name}をローテーションで1つ上へ移動`}
                    onClick={() => onMove(index, -1)}
                    style={{
                      minWidth: 36,
                      minHeight: 36,
                      border: '1px solid var(--color-border)',
                      borderRadius: 8,
                      color: 'var(--color-text)',
                      background: 'var(--color-surface-muted)',
                      cursor: index === 0 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={index === pitchers.length - 1}
                    aria-label={`${pitcher.name}をローテーションで1つ下へ移動`}
                    onClick={() => onMove(index, 1)}
                    style={{
                      minWidth: 36,
                      minHeight: 36,
                      border: '1px solid var(--color-border)',
                      borderRadius: 8,
                      color: 'var(--color-text)',
                      background: 'var(--color-surface-muted)',
                      cursor: index === pitchers.length - 1 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    ↓
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <div style={{ marginTop: 9, color: 'var(--color-text-faint)', fontSize: 11 }}>
        グリップを別の投手へドラッグするか、矢印で登板順を変更できます。故障時は自動選出へフォールバックします。
      </div>
    </Card>
  );
}
