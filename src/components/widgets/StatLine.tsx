import type { AccumulatedStats, Player } from '../../engine';

/** Compact 「.XXX / N本 / N打点」 summary shared by roster, bench and batting-order views. */
export function BatterStatLine({
  player,
  accumulated,
}: {
  player: Player;
  accumulated: AccumulatedStats;
}) {
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

/** Compact 「N勝 N敗 / ERA N.NN」 summary shared by roster, bullpen and rotation views. */
export function PitcherStatLine({
  player,
  accumulated,
}: {
  player: Player;
  accumulated: AccumulatedStats;
}) {
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
