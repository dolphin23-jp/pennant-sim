import { useMemo, useState } from 'react';

import type { Player, TeamKey } from '../../../engine';
import { useGameState } from '../../../state/gameState';
import { Card, SectionTitle, SegmentedControl } from '../../ui';
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
        <SegmentedControl<StatsScope>
          ariaLabel="成績を表示する範囲"
          value={scope}
          onChange={setScope}
          options={[
            { id: 'team', label: '自球団', ariaLabel: '自球団の成績を表示' },
            { id: 'league', label: 'リーグ全体', ariaLabel: 'リーグ全体の成績を表示' },
          ]}
        />
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
