import type { Player } from '../../engine';
import { Card, EmptyState, SectionTitle } from '../ui';
import type { LineupAssignments, LineupSlot } from './FieldDiagram';
import { LINEUP_SLOT_ORDER } from './FieldDiagram';
import { PlayerStatusBadges } from './PlayerStatusBadges';

function slotForPlayer(assignments: LineupAssignments, playerId: string): LineupSlot | null {
  return LINEUP_SLOT_ORDER.find((slot) => assignments[slot]?.id === playerId) ?? null;
}

export function BattingOrderList({
  players,
  assignments,
  onMove,
  onSelectPlayer,
}: {
  players: Player[];
  assignments: LineupAssignments;
  onMove(index: number, direction: -1 | 1): void;
  onSelectPlayer(player: Player): void;
}) {
  return (
    <Card ariaLabel="打順の編集">
      <SectionTitle>Batting Order</SectionTitle>
      {!players.length ? (
        <EmptyState>打順に選手がいません。</EmptyState>
      ) : (
        <ol style={{ display: 'grid', gap: 7, margin: 0, padding: 0, listStyle: 'none' }}>
          {players.map((player, index) => {
            const slot = slotForPlayer(assignments, player.id);
            return (
              <li
                key={player.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '34px minmax(0,1fr) auto',
                  alignItems: 'center',
                  gap: 8,
                  minHeight: 58,
                  padding: '8px 9px',
                  border: '1px solid var(--color-border)',
                  borderRadius: 10,
                  background: 'var(--color-surface-raised)',
                }}
              >
                <strong
                  aria-label={`${index + 1}番`}
                  style={{
                    display: 'grid',
                    width: 30,
                    height: 30,
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
                    aria-label={`${player.name}の詳細を表示`}
                    onClick={() => onSelectPlayer(player)}
                    style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  >
                    {player.name}
                  </button>
                  <div style={{ marginTop: 3, color: 'var(--color-text-muted)', fontSize: 11 }}>
                    {slot === 'extra' ? '追加打者' : slot ?? '未配置'} / {player.hand.bat ?? '-'}打
                  </div>
                  <div style={{ marginTop: 3 }}>
                    <PlayerStatusBadges player={player} compact />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,36px)', gap: 5 }}>
                  <button
                    type="button"
                    disabled={index === 0}
                    aria-label={`${player.name}を打順で1つ上へ移動`}
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
                    disabled={index === players.length - 1}
                    aria-label={`${player.name}を打順で1つ下へ移動`}
                    onClick={() => onMove(index, 1)}
                    style={{
                      minWidth: 36,
                      minHeight: 36,
                      border: '1px solid var(--color-border)',
                      borderRadius: 8,
                      color: 'var(--color-text)',
                      background: 'var(--color-surface-muted)',
                      cursor: index === players.length - 1 ? 'not-allowed' : 'pointer',
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
        ドラッグ操作は不要です。矢印ボタンで打順を入れ替えられます。
      </div>
    </Card>
  );
}
