import { TINFO } from '../../../data';
import type { Player, TeamKey, Teams } from '../../../engine';
import { useGameState } from '../../../state/gameState';
import { Card, SectionTitle } from '../../ui';
import { RosterTable } from '../../widgets/RosterTable';
import { SquadBoard } from '../../widgets/SquadBoard';

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
      <Card style={{ marginBottom: 12 }} ariaLabel="表示する球団を選択">
        <SectionTitle>Roster Browser</SectionTitle>
        <select
          aria-label="ロスターを表示する球団"
          value={viewedKey}
          onChange={(event) => game.setViewTeam(event.target.value as TeamKey)}
          style={{
            background: 'var(--color-bg-soft)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
            borderRadius: 7,
            padding: '8px 10px',
          }}
        >
          {(Object.keys(game.teams) as TeamKey[]).map((teamKey) => (
            <option key={teamKey} value={teamKey}>
              {TINFO[teamKey].n}
            </option>
          ))}
        </select>
      </Card>
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
