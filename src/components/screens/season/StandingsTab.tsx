import type { TeamKey } from '../../../engine';
import { useGameState } from '../../../state/gameState';
import { StandingsTable } from '../../widgets/StandingsTable';

export function StandingsTab({ onSelectTeam }: { onSelectTeam?(teamKey: TeamKey): void }) {
  const game = useGameState();
  return (
    <StandingsTable
      standings={game.standings}
      schedule={game.season.schedule}
      onSelectTeam={onSelectTeam}
    />
  );
}
