import { calcOVR } from '../../engine';
import type { Player } from '../../engine';
import { Card, EmptyState, SectionTitle } from '../ui';
import { PlayerStatusBadges } from './PlayerStatusBadges';

export function RotationOrderList({
  pitchers,
  onMove,
  onSelectPlayer,
}: {
  pitchers: Player[];
  onMove(index: number, direction: -1 | 1): void;
  onSelectPlayer(player: Player): void;
}) {
  return (
    <Card ariaLabel="先発ローテーションの編集">
      <SectionTitle>Starting Rotation</SectionTitle>
      {!pitchers.length ? (
        <EmptyState>先発ロールの投手がいません。</EmptyState>
      ) : (
        <ol style={{ display: 'grid', gap: 7, margin: 0, padding: 0, listStyle: 'none' }}>
          {pitchers.map((pitcher, index) => (
            <li
              key={pitcher.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '40px minmax(0,1fr) auto',
                alignItems: 'center',
                gap: 8,
                minHeight: 62,
                padding: '8px 9px',
                border: '1px solid var(--color-border)',
                borderRadius: 10,
                background: 'var(--color-surface-raised)',
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
                }}
              >
                {index + 1}
              </strong>
              <div style={{ minWidth: 0 }}>
                <button
                  type="button"
                  className="roster-player-button"
                  aria-label={`${pitcher.name}の詳細を表示`}
                  onClick={() => onSelectPlayer(pitcher)}
                  style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}
                >
                  {pitcher.name}
                </button>
                <div style={{ marginTop: 3, color: 'var(--color-text-muted)', fontSize: 11 }}>
                  OVR {calcOVR(pitcher)} / スタミナ {Math.round(pitcher.p.stam)}
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
          ))}
        </ol>
      )}
      <div style={{ marginTop: 9, color: 'var(--color-text-faint)', fontSize: 11 }}>
        上から順に登板します。故障などで登板できない場合は、自動選出へフォールバックします。
      </div>
    </Card>
  );
}
