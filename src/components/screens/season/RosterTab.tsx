import type { TeamKey } from '../../../engine';
import { useGameState } from '../../../state/gameState';
import { RosterTable } from '../../widgets/RosterTable';
import { TeamSwitcher } from '../../widgets/TeamSwitcher';

export function RosterTab() {
  const game = useGameState();
  if (!game.teams || !game.playerTeam) return null;

  const viewedKey = game.viewTeam ?? game.playerTeam;
  const viewedTeam = game.teams[viewedKey];

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
      <RosterTable
        team={viewedTeam}
        accumulated={viewedKey === game.playerTeam ? game.accumulated : game.leagueAccumulated}
        onSelect={game.selectPlayer}
      />
    </>
  );
}
