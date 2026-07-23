import { calcOVR, effectiveOVR } from '../../engine';
import type { AccumulatedStats, Player, Team } from '../../engine';
import { Card, EmptyState, SectionTitle, TermTooltip } from '../ui';
import { PlayerStatusBadges } from './PlayerStatusBadges';

function BatterStatLine({ player, accumulated }: { player: Player; accumulated: AccumulatedStats }) {
  const stats = accumulated[player.id];
  if (!stats || stats.type !== 'bat') return <span>成績なし</span>;
  const average = stats.ab > 0 ? stats.h / stats.ab : null;
  return (
    <span>
      <span className={average !== null && average >= 0.3 ? 'metric-highlight' : undefined}>
        {average === null ? '.---' : average.toFixed(3).replace(/^0/, '')}
      </span>
      {' / '}
      <span className={stats.hr >= 30 ? 'metric-power' : undefined}>{stats.hr}本</span>
      {' / '}
      <span className={stats.rbi >= 100 ? 'metric-highlight' : undefined}>{stats.rbi}打点</span>
    </span>
  );
}

function PitcherStatLine({ player, accumulated }: { player: Player; accumulated: AccumulatedStats }) {
  const stats = accumulated[player.id];
  if (!stats || stats.type !== 'pit') return <span>成績なし</span>;
  const era = stats.ip3 > 0 ? (stats.er * 27) / stats.ip3 : null;
  return (
    <span>
      <span className={stats.w >= 10 ? 'metric-highlight' : undefined}>
        {stats.w}勝 {stats.l}敗
      </span>
      {' / ERA '}
      <span className={era !== null && era < 3 ? 'metric-highlight' : undefined}>
        {era === null ? '-.--' : era.toFixed(2)}
      </span>
    </span>
  );
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
    <Card ariaLabel={`${team.n}のロスター`}>
      <SectionTitle>Roster</SectionTitle>
      <div className="roster-table-wrap">
        <table className="roster-table" aria-label={`${team.n}の選手一覧`}>
          <caption>選手名を選択すると詳細を表示します。</caption>
          <thead>
            <tr>
              <th scope="col" style={{ textAlign: 'left' }}>選手</th>
              <th scope="col">年齢</th>
              <th scope="col">役割</th>
              <th scope="col">
                <TermTooltip
                  term="OVR"
                  description="複数の能力値を役割ごとの重みでまとめた総合評価です。"
                />
              </th>
              <th scope="col">状態</th>
              <th scope="col" style={{ textAlign: 'left' }}>今季</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => {
              const overall = player.isP
                ? calcOVR(player)
                : effectiveOVR(player, player._assignedPos ?? player.pos);
              return (
                <tr key={player.id}>
                  <td>
                    <button
                      className="roster-player-button"
                      type="button"
                      onClick={() => onSelect(player)}
                      aria-label={`${player.name}の詳細を表示`}
                    >
                      {player.name}
                    </button>
                  </td>
                  <td style={{ textAlign: 'center' }}>{player.age}</td>
                  <td style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    {player.isP ? player.role : player.pos}
                  </td>
                  <td
                    className={overall >= 80 ? 'metric-highlight' : undefined}
                    style={{ textAlign: 'center', fontWeight: 900 }}
                  >
                    {overall}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <PlayerStatusBadges player={player} compact />
                  </td>
                  <td style={{ color: 'var(--color-text-muted)' }}>
                    {player.isP ? (
                      <PitcherStatLine player={player} accumulated={accumulated} />
                    ) : (
                      <BatterStatLine player={player} accumulated={accumulated} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
