import { useMemo, useState } from 'react';

import { displayOVRBreakdown } from '../../engine';
import type { AccumulatedStats, Player } from '../../engine';
import { Card, EmptyState, SectionTitle } from '../ui';
import { AgePositionFilterBar } from './AgePositionFilterBar';
import { matchesAge, matchesPositionFilter, type AgeFilter, type PositionFilter } from './playerFilters';
import { PlayerStatusBadges } from './PlayerStatusBadges';
import { BatterStatLine } from './StatLine';

export function BenchPanel({
  players,
  accumulated,
  armedPlayerId,
  onToggleArm,
  onSelectPlayer,
}: {
  players: Player[];
  accumulated: AccumulatedStats;
  armedPlayerId: string | null;
  onToggleArm(player: Player): void;
  onSelectPlayer(player: Player): void;
}) {
  const [ageFilter, setAgeFilter] = useState<AgeFilter>('all');
  const [positionFilter, setPositionFilter] = useState<PositionFilter>('all');
  const filteredPlayers = useMemo(
    () =>
      players.filter(
        (player) => matchesAge(player, ageFilter) && matchesPositionFilter(player, positionFilter),
      ),
    [players, ageFilter, positionFilter],
  );

  return (
    <Card ariaLabel="ベンチの野手一覧">
      <SectionTitle>Bench</SectionTitle>
      <div style={{ color: 'var(--color-text-muted)', fontSize: 12, marginBottom: 10 }}>
        選手をタップしてから守備位置をタップすると入れ替えます。もう一度タップすると解除します。
      </div>
      {players.length > 0 && (
        <AgePositionFilterBar
          ageFilter={ageFilter}
          onAgeFilterChange={setAgeFilter}
          positionFilter={positionFilter}
          onPositionFilterChange={setPositionFilter}
          matchCount={filteredPlayers.length}
          totalCount={players.length}
          ariaLabelPrefix="ベンチの野手"
        />
      )}
      {!players.length ? (
        <EmptyState>ベンチの野手はいません。</EmptyState>
      ) : !filteredPlayers.length ? (
        <EmptyState>条件に一致するベンチの野手がいません。</EmptyState>
      ) : (
        <div
          role="list"
          aria-label="ベンチの野手"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,190px),1fr))',
            gap: 7,
          }}
        >
          {filteredPlayers.map((player) => {
            const armed = armedPlayerId === player.id;
            const injured = (player.injuryDays ?? 0) > 0;
            const breakdown = displayOVRBreakdown(player, player.pos);
            return (
              <div
                role="listitem"
                key={player.id}
                style={{
                  display: 'grid',
                  gap: 6,
                  padding: '8px 9px',
                  border: `1px solid ${armed ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  borderRadius: 9,
                  background: armed ? 'var(--color-accent-soft)' : 'var(--color-surface-raised)',
                  boxShadow: armed ? '0 0 0 2px var(--color-accent)' : undefined,
                }}
              >
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
                  <div style={{ marginTop: 3, color: 'var(--color-text-muted)', fontSize: 10 }}>
                    {player.pos ?? '-'} / {breakdown.base} → <strong>{breakdown.total}</strong>
                  </div>
                  <div style={{ marginTop: 2, color: 'var(--color-text-muted)', fontSize: 10 }}>
                    <BatterStatLine player={player} accumulated={accumulated} />
                  </div>
                  <div style={{ marginTop: 3 }}>
                    <PlayerStatusBadges player={player} compact />
                  </div>
                </div>
                <button
                  type="button"
                  disabled={injured}
                  aria-pressed={armed}
                  aria-label={
                    armed
                      ? `${player.name}の配置選択を解除`
                      : `${player.name}を配置対象に選択、続けて守備位置をタップ`
                  }
                  onClick={() => onToggleArm(player)}
                  style={{
                    minHeight: 32,
                    padding: '5px 8px',
                    border: '1px solid var(--color-border-strong)',
                    borderRadius: 7,
                    color: injured
                      ? 'var(--color-text-faint)'
                      : armed
                        ? 'var(--color-accent)'
                        : 'var(--color-text-muted)',
                    background: 'var(--color-surface)',
                    fontSize: 11,
                    fontWeight: 900,
                    cursor: injured ? 'not-allowed' : 'pointer',
                  }}
                >
                  {armed ? '選択中(解除)' : '配置する'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
