import { calcOVR, effectiveOVR } from '../../engine';
import type { AccumulatedStats, Player, Team } from '../../engine';
import { Card, EmptyState, SectionTitle } from '../ui';

function statLabel(player: Player, accumulated: AccumulatedStats): string {
  const stats = accumulated[player.id];
  if (!stats) return '成績なし';
  if (stats.type === 'pit') {
    const innings = stats.ip3 / 3;
    const era = innings > 0 ? ((stats.er / innings) * 9).toFixed(2) : '-.--';
    return `${stats.w}勝 ${stats.l}敗 / ERA ${era}`;
  }
  const average = stats.ab > 0 ? (stats.h / stats.ab).toFixed(3).replace(/^0/, '') : '.---';
  return `${average} / ${stats.hr}本 / ${stats.rbi}打点`;
}

export function RosterTable({
  team,
  accumulated,
  onSelect,
}: {
  team: Team;
  accumulated: AccumulatedStats;
  onSelect(player: Player): void;
}) {
  const players = [...team.fielders, ...team.pitchers];
  if (!players.length) return <EmptyState>登録選手がいません。</EmptyState>;

  return (
    <Card>
      <SectionTitle>Roster</SectionTitle>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ color: '#6f8ca8' }}>
              <th style={{ textAlign: 'left', padding: 8 }}>選手</th>
              <th style={{ padding: 8 }}>年齢</th>
              <th style={{ padding: 8 }}>役割</th>
              <th style={{ padding: 8 }}>OVR</th>
              <th style={{ textAlign: 'left', padding: 8 }}>今季</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => {
              const overall = player.isP
                ? calcOVR(player)
                : effectiveOVR(player, player._assignedPos ?? player.pos);
              return (
                <tr
                  key={player.id}
                  onClick={() => onSelect(player)}
                  style={{ borderTop: '1px solid #17283a', cursor: 'pointer' }}
                >
                  <td style={{ padding: 8, fontWeight: 800, color: '#7fd0ff' }}>{player.name}</td>
                  <td style={{ padding: 8, textAlign: 'center' }}>{player.age}</td>
                  <td style={{ padding: 8, textAlign: 'center', color: '#90a9bf' }}>
                    {player.isP ? player.role : player.pos}
                  </td>
                  <td style={{ padding: 8, textAlign: 'center', fontWeight: 900 }}>{overall}</td>
                  <td style={{ padding: 8, color: '#90a9bf' }}>{statLabel(player, accumulated)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
