import { useMemo } from 'react';

import { calcInterleagueStandings } from '../../../engine';
import type { TeamKey } from '../../../engine';
import { useGameState } from '../../../state/gameState';
import { StandingsTable } from '../../widgets/StandingsTable';

export function StandingsTab({ onSelectTeam }: { onSelectTeam?(teamKey: TeamKey): void }) {
  const game = useGameState();
  const interleagueStandings = useMemo(
    () => calcInterleagueStandings(game.season.schedule),
    [game.season.schedule],
  );
  return (
    <StandingsTable
      standings={game.standings}
      interleagueStandings={interleagueStandings}
      schedule={game.season.schedule}
      onSelectTeam={onSelectTeam}
    />
  );
}
