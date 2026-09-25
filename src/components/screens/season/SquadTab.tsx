import { ACTIVE_ROSTER_BALANCE } from '../../../data';
import type { Player, TeamKey, Teams } from '../../../engine';
import { useGameState } from '../../../state/gameState';
import { SquadBoard } from '../../widgets/SquadBoard';

function withToggledActiveRoster(teams: Teams, teamKey: TeamKey, player: Player): Teams {
  const team = teams[teamKey];
  const nextActive = player.activeRoster === false;
  const activeTotal = [...team.pitchers, ...team.fielders].filter(
    (candidate) => candidate.activeRoster !== false,
  ).length;
  if (nextActive && activeTotal >= ACTIVE_ROSTER_BALANCE.limit) return teams;
  const updatePlayer = (candidate: Player): Player =>
    candidate.id === player.id ? { ...candidate, activeRoster: nextActive } : candidate;
  return {
    ...teams,
    [teamKey]: {
      ...team,
      fielders: team.fielders.map(updatePlayer),
      pitchers: team.pitchers.map(updatePlayer),
    },
  };
}

export function SquadTab() {
  const game = useGameState();
  if (!game.teams || !game.playerTeam) return null;

  const teams = game.teams;
  const playerTeam = game.playerTeam;

  return (
    <SquadBoard
      team={teams[playerTeam]}
      onSelectPlayer={game.selectPlayer}
      onToggleActive={(player) =>
        game.replaceTeams(withToggledActiveRoster(teams, playerTeam, player))
      }
    />
  );
}
