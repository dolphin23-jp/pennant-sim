import { useMemo } from 'react';

import { calcInterleagueStandings } from '../../../engine';
import type { TeamKey } from '../../../engine';
import { useGameState } from '../../../state/gameState';
import { HeadToHeadComparison, TeamStatsComparison } from '../../widgets/StandingsDetail';
import { StandingsTable } from '../../widgets/StandingsTable';

export function StandingsTab({ onSelectTeam }: { onSelectTeam?(teamKey: TeamKey): void }) {
  const game = useGameState();
  const interleagueStandings = useMemo(
    () => calcInterleagueStandings(game.season.schedule),
    [game.season.schedule],
  );
  if (!game.teams) return null;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <StandingsTable
        standings={game.standings}
        interleagueStandings={interleagueStandings}
        schedule={game.season.schedule}
        onSelectTeam={onSelectTeam}
      />
      <TeamStatsComparison
        teams={game.teams}
        standings={game.standings}
        statsSource={game.leagueAccumulated}
      />
      <HeadToHeadComparison schedule={game.season.schedule} standings={game.standings} />
    </div>
  );
}
