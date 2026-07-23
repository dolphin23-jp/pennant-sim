import { useGameState } from '../../../state/gameState';
import { StandingsTable } from '../../widgets/StandingsTable';

export function StandingsTab() {
  const game = useGameState();
  return <StandingsTable standings={game.standings} schedule={game.season.schedule} />;
}
