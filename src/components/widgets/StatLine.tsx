import { battingAverage, earnedRunAverage, inningsText, ops, whip } from '../../engine';
import type { AccumulatedStats, Player } from '../../engine';

const rate = (value: number | null, digits: number, empty: string): string =>
  value === null ? empty : value.toFixed(digits).replace(/^0\./, '.');

/**
 * Compact 「.XXX / N本 / N打点」 summary shared by roster, bench and batting-order views.
 * `detailed` adds OPS, for the roster where there is room to compare hitters properly.
 */
export function BatterStatLine({
  player,
  accumulated,
  detailed = false,
}: {
  player: Player;
  accumulated: AccumulatedStats;
  detailed?: boolean;
}) {
  const stats = accumulated[player.id];
  if (!stats || stats.type !== 'bat') return <span>成績なし</span>;
  const average = battingAverage(stats);
  const onBasePlusSlugging = ops(stats);
  return (
    <span>
      <span className={average !== null && average >= 0.3 ? 'metric-highlight' : undefined}>
        {rate(average, 3, '.---')}
      </span>
      {' / '}
      <span className={stats.hr >= 30 ? 'metric-power' : undefined}>{stats.hr}本</span>
      {' / '}
      <span className={stats.rbi >= 100 ? 'metric-highlight' : undefined}>{stats.rbi}打点</span>
      {detailed && (
        <>
          {' / OPS '}
          <span
            className={
              onBasePlusSlugging !== null && onBasePlusSlugging >= 0.9
                ? 'metric-highlight'
                : undefined
            }
          >
            {rate(onBasePlusSlugging, 3, '.---')}
          </span>
        </>
      )}
    </span>
  );
}

/**
 * Compact 「N勝 N敗 / ERA N.NN」 summary shared by roster, bullpen and rotation views.
 * `detailed` adds saves, innings, strikeouts and WHIP for the roster.
 */
export function PitcherStatLine({
  player,
  accumulated,
  detailed = false,
}: {
  player: Player;
  accumulated: AccumulatedStats;
  detailed?: boolean;
}) {
  const stats = accumulated[player.id];
  if (!stats || stats.type !== 'pit') return <span>成績なし</span>;
  const era = earnedRunAverage(stats);
  const walksHitsPerInning = whip(stats);
  return (
    <span>
      <span className={stats.w >= 10 ? 'metric-highlight' : undefined}>
        {stats.w}勝 {stats.l}敗
      </span>
      {detailed && stats.sv > 0 && ` ${stats.sv}S`}
      {detailed && stats.hld > 0 && ` ${stats.hld}H`}
      {' / ERA '}
      <span className={era !== null && era < 3 ? 'metric-highlight' : undefined}>
        {era === null ? '-.--' : era.toFixed(2)}
      </span>
      {detailed && (
        <>
          {` / ${inningsText(stats.ip3)}回 / ${stats.k}K / WHIP `}
          <span
            className={
              walksHitsPerInning !== null && walksHitsPerInning < 1.1
                ? 'metric-highlight'
                : undefined
            }
          >
            {walksHitsPerInning === null ? '-.--' : walksHitsPerInning.toFixed(2)}
          </span>
        </>
      )}
    </span>
  );
}
