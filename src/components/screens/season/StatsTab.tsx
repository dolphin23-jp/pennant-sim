import { useMemo, useState } from 'react';

import type { Player, TeamKey } from '../../../engine';
import { useGameState } from '../../../state/gameState';
import { Card, SectionTitle } from '../../ui';
import { SortableStatsTable } from '../../widgets/SortableStatsTable';

type StatsScope = 'team' | 'league';

export function StatsTab() {
  const game = useGameState();
  const [scope, setScope] = useState<StatsScope>('team');

  const leaguePlayers = useMemo<Player[]>(
    () =>
      game.teams
        ? Object.values(game.teams).flatMap((team) => [...team.fielders, ...team.pitchers])
        : [],
    [game.teams],
  );

  if (!game.teams || !game.playerTeam) return null;
  const playerTeam = game.teams[game.playerTeam];
  const players =
    scope === 'team' ? [...playerTeam.fielders, ...playerTeam.pitchers] : leaguePlayers;
  const gamesByTeam = Object.fromEntries(
    (Object.keys(game.standings) as TeamKey[]).map((teamKey) => [
      teamKey,
      game.standings[teamKey].g,
    ]),
  ) as Record<TeamKey, number>;

  return (
    <>
      <Card style={{ marginBottom: 12 }} ariaLabel="成績の表示範囲">
        <SectionTitle>Stats Scope</SectionTitle>
        <div role="group" aria-label="成績を表示する範囲" style={{ display: 'flex', gap: 6 }}>
          {([
            ['team', '自球団'],
            ['league', 'リーグ全体'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-label={`${label}の成績を表示`}
              aria-pressed={scope === id}
              onClick={() => setScope(id)}
              style={{
                minHeight: 40,
                padding: '8px 14px',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                color: scope === id ? 'var(--color-accent)' : 'var(--color-text-muted)',
                background:
                  scope === id ? 'var(--color-accent-soft)' : 'var(--color-surface-raised)',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </Card>
      <SortableStatsTable
        players={players}
        currentStats={scope === 'team' ? game.accumulated : game.leagueAccumulated}
        careerStats={
          scope === 'team' ? game.careerAccumulated : game.leagueCareerAccumulated
        }
        yearlyStats={game.yearlyStats}
        gamesByTeam={gamesByTeam}
        onSelect={game.selectPlayer}
      />
    </>
  );
}
