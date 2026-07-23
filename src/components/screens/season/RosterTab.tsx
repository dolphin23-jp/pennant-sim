import { TINFO } from '../../../data';
import type { TeamKey } from '../../../engine';
import { useGameState } from '../../../state/gameState';
import { Card, SectionTitle } from '../../ui';
import { RosterTable } from '../../widgets/RosterTable';

export function RosterTab() {
  const game = useGameState();
  if (!game.teams || !game.playerTeam) return null;

  const viewedKey = game.viewTeam ?? game.playerTeam;
  const viewedTeam = game.teams[viewedKey];

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
      <RosterTable
        team={viewedTeam}
        accumulated={viewedKey === game.playerTeam ? game.accumulated : game.leagueAccumulated}
        onSelect={game.selectPlayer}
      />
    </>
  );
}
