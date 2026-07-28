import { useMemo, useState } from 'react';

import { calcOVR } from '../../engine';
import type { Player } from '../../engine';
import { Card, EmptyState, SectionTitle } from '../ui';
import { AgePositionFilterBar } from './AgePositionFilterBar';
import { matchesAge, type AgeFilter } from './playerFilters';
import { PlayerStatusBadges } from './PlayerStatusBadges';

export function RotationCandidatesList({
  pitchers,
  onPromote,
  onSelectPlayer,
}: {
  pitchers: Player[];
  onPromote(pitcher: Player): void;
  onSelectPlayer(player: Player): void;
}) {
  const [ageFilter, setAgeFilter] = useState<AgeFilter>('all');
  const filteredPitchers = useMemo(
    () => pitchers.filter((pitcher) => matchesAge(pitcher, ageFilter)),
    [pitchers, ageFilter],
  );

  return (
    <Card ariaLabel="ローテーション候補の先発投手">
      <SectionTitle>Rotation Candidates</SectionTitle>
      <div style={{ color: 'var(--color-text-muted)', fontSize: 12, marginBottom: 10 }}>
        ローテーション外の先発投手です。「昇格」でローテーションの枠と入れ替えます。
      </div>
      {pitchers.length > 0 && (
        <AgePositionFilterBar
          ageFilter={ageFilter}
          onAgeFilterChange={setAgeFilter}
          matchCount={filteredPitchers.length}
          totalCount={pitchers.length}
          ariaLabelPrefix="ローテーション候補"
        />
      )}
      {!pitchers.length ? (
        <EmptyState>ローテーション外の先発投手はいません。</EmptyState>
      ) : !filteredPitchers.length ? (
        <EmptyState>条件に一致するローテーション外の先発投手がいません。</EmptyState>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,210px),1fr))',
            gap: 7,
          }}
        >
          {filteredPitchers.map((pitcher) => {
            const injured = (pitcher.injuryDays ?? 0) > 0;
            return (
              <div
                key={pitcher.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0,1fr) auto',
                  alignItems: 'center',
                  gap: 8,
                  minHeight: 62,
                  padding: '8px 9px',
                  border: '1px solid var(--color-border)',
                  borderRadius: 9,
                  background: 'var(--color-surface-raised)',
                }}
              >
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
                  <div style={{ marginTop: 3, color: 'var(--color-text-muted)', fontSize: 10 }}>
                    OVR {calcOVR(pitcher)} / スタミナ {Math.round(pitcher.p.stam)}
                  </div>
                  <div style={{ marginTop: 3 }}>
                    <PlayerStatusBadges player={pitcher} compact />
                  </div>
                </div>
                <button
                  type="button"
                  disabled={injured}
                  aria-label={`${pitcher.name}をローテーションへ昇格`}
                  onClick={() => onPromote(pitcher)}
                  style={{
                    minHeight: 34,
                    padding: '6px 10px',
                    border: '1px solid var(--color-border-strong)',
                    borderRadius: 8,
                    color: injured ? 'var(--color-text-faint)' : 'var(--color-accent)',
                    background: 'var(--color-surface)',
                    fontSize: 11,
                    fontWeight: 900,
                    cursor: injured ? 'not-allowed' : 'pointer',
                  }}
                >
                  昇格
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
