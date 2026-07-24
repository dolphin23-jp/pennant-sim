import type { Player, TeamKey, Teams } from '../../../engine';
import { useGameState } from '../../../state/gameState';
import { RosterTable } from '../../widgets/RosterTable';
import { SquadBoard } from '../../widgets/SquadBoard';
import { TeamSwitcher } from '../../widgets/TeamSwitcher';

function withToggledActiveRoster(teams: Teams, teamKey: TeamKey, player: Player): Teams {
  const team = teams[teamKey];
  const nextActive = player.activeRoster === false;
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

export function RosterTab() {
  const game = useGameState();
  if (!game.teams || !game.playerTeam) return null;

  const viewedKey = game.viewTeam ?? game.playerTeam;
  const viewedTeam = game.teams[viewedKey];
  const teams = game.teams;
  const isOwnTeam = viewedKey === game.playerTeam;

  return (
    <>
      <TeamSwitcher
        title="Roster Browser"
        cardAriaLabel="表示する球団を選択"
        selectAriaLabel="ロスターを表示する球団"
        value={viewedKey}
        teamKeys={Object.keys(game.teams) as TeamKey[]}
        onChange={game.setViewTeam}
      />
      {isOwnTeam && (
        <SquadBoard
          team={viewedTeam}
          onSelectPlayer={game.selectPlayer}
          onToggleActive={(player) => game.replaceTeams(withToggledActiveRoster(teams, viewedKey, player))}
        />
      )}
      <RosterTable
        team={viewedTeam}
        accumulated={viewedKey === game.playerTeam ? game.accumulated : game.leagueAccumulated}
        onSelect={game.selectPlayer}
      />
    </>
  );
}
