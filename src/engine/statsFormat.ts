import type { BatterStats, PitcherStats, PlayerStats } from './types';

export interface StatItem {
  label: string;
  value: string;
  description?: string;
  elite?: boolean;
  power?: boolean;
}

export interface YearlyRow {
  year: string;
  stats: PlayerStats;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isPlayerStats = (value: unknown): value is PlayerStats =>
  isRecord(value) && (value.type === 'bat' || value.type === 'pit');

export const averageText = (hits: number, atBats: number): string =>
  atBats > 0 ? (hits / atBats).toFixed(3).replace(/^0/, '') : '.---';

// Batting average and earned run average were each open-coded in a dozen places, which
// made them impossible to change in one step. Both now live here.
export const battingAverage = (stats: BatterStats): number | null =>
  stats.ab > 0 ? stats.h / stats.ab : null;

export const earnedRunAverage = (stats: PitcherStats): number | null =>
  stats.ip3 > 0 ? (stats.er * 27) / stats.ip3 : null;

export const inningsText = (outs: number): string => {
  const innings = Math.floor(outs / 3);
  const remainder = outs % 3;
  return `${innings}${remainder ? `.${remainder}` : ''}`;
};

export const babip = (stats: BatterStats): number | null => {
  const denominator = stats.ab - stats.k - stats.hr;
  return denominator > 0 ? (stats.h - stats.hr) / denominator : null;
};

// Official formula: (H + BB + HBP) / (AB + BB + HBP + SF). Hit-by-pitch was missing from
// both sides until season stats started tracking it.
export const onBasePercentage = (stats: BatterStats): number | null => {
  const denominator = stats.ab + stats.bb + stats.hbp + stats.sf;
  return denominator > 0 ? (stats.h + stats.bb + stats.hbp) / denominator : null;
};

export const sluggingPercentage = (stats: BatterStats): number | null => {
  if (stats.ab <= 0) return null;
  const totalBases = stats.s + stats.d * 2 + stats.t * 3 + stats.hr * 4;
  return totalBases / stats.ab;
};

export const ops = (stats: BatterStats): number | null => {
  const obp = onBasePercentage(stats);
  const slugging = sluggingPercentage(stats);
  return obp === null || slugging === null ? null : obp + slugging;
};

export const whip = (stats: PitcherStats): number | null =>
  stats.ip3 > 0 ? ((stats.h + stats.bb) * 3) / stats.ip3 : null;

export const strikeoutsPerNine = (stats: PitcherStats): number | null =>
  stats.ip3 > 0 ? (stats.k * 27) / stats.ip3 : null;

// QS率は登板ごとの投球回と自責点が必要だが、現行PitcherStatsはシーズン累計のみのため算出しない。
export function statItems(stats: PlayerStats | undefined): StatItem[] {
  if (!stats) return [];
  if (stats.type === 'pit') {
    const era = earnedRunAverage(stats);
    const calculatedWhip = whip(stats);
    const k9 = strikeoutsPerNine(stats);
    return [
      { label: '登板', value: String(stats.g) },
      { label: '先発', value: String(stats.gs) },
      { label: '勝敗', value: `${stats.w}勝 ${stats.l}敗`, elite: stats.w >= 10 },
      { label: '防御率', value: era === null ? '-.--' : era.toFixed(2), elite: era !== null && era < 3 },
      { label: '投球回', value: inningsText(stats.ip3) },
      { label: '奪三振', value: String(stats.k), elite: stats.k >= 100 },
      {
        label: 'WHIP',
        description: '1投球回あたりに許した安打と四球の合計です。',
        value: calculatedWhip === null ? '-.--' : calculatedWhip.toFixed(2),
        elite: calculatedWhip !== null && calculatedWhip < 1.1,
      },
      {
        label: 'K/9',
        description: '9投球回あたりの奪三振数です。',
        value: k9 === null ? '-.--' : k9.toFixed(2),
        elite: k9 !== null && k9 >= 9,
      },
      { label: '失点', value: String(stats.r) },
      { label: '被安打', value: String(stats.h) },
      { label: '被本塁打', value: String(stats.hr) },
      { label: '与四球', value: String(stats.bb) },
      { label: 'セーブ', value: String(stats.sv), elite: stats.sv >= 30 },
      { label: 'ホールド', value: String(stats.hld), elite: stats.hld >= 30 },
      { label: 'ブロウンセーブ', value: String(stats.bs) },
    ];
  }
  const average = stats.ab > 0 ? stats.h / stats.ab : null;
  const calculatedBabip = babip(stats);
  const calculatedOps = ops(stats);
  return [
    { label: '試合', value: String(stats.g) },
    { label: '打席', value: String(stats.pa) },
    { label: '打数', value: String(stats.ab) },
    {
      label: '打率',
      value: averageText(stats.h, stats.ab),
      elite: average !== null && average >= 0.3,
    },
    { label: '安打', value: String(stats.h) },
    { label: '本塁打', value: String(stats.hr), power: stats.hr >= 30 },
    { label: '打点', value: String(stats.rbi), elite: stats.rbi >= 100 },
    { label: '得点', value: String(stats.r) },
    { label: '四球', value: String(stats.bb) },
    { label: '死球', value: String(stats.hbp) },
    { label: '三振', value: String(stats.k) },
    { label: '盗塁', value: String(stats.sb), elite: stats.sb >= 20 },
    { label: '犠打', value: String(stats.bnt) },
    { label: '犠飛', value: String(stats.sf) },
    { label: '併殺打', value: String(stats.gdp) },
    { label: '失策', value: String(stats.e) },
    {
      label: 'OPS',
      description: '出塁率と長打率を足した指標です。',
      value: calculatedOps === null ? '.---' : calculatedOps.toFixed(3).replace(/^0/, ''),
      elite: calculatedOps !== null && calculatedOps >= 0.8,
    },
    {
      label: 'BABIP',
      description: '本塁打を除くインプレー打球が安打になった割合です。',
      value: calculatedBabip === null ? '.---' : calculatedBabip.toFixed(3).replace(/^0/, ''),
      elite: calculatedBabip !== null && calculatedBabip >= 0.32,
    },
  ];
}

export function yearlyRows(
  yearlyStats: Record<string, unknown[]>,
  playerId: string,
): YearlyRow[] {
  const rows: YearlyRow[] = [];
  for (const [year, entries] of Object.entries(yearlyStats)) {
    for (const entry of entries) {
      if (!isRecord(entry)) continue;
      let candidate: unknown;
      if (entry.playerId === playerId || entry.id === playerId || entry.pid === playerId) {
        candidate = entry.stats ?? entry;
      } else if (isRecord(entry[playerId])) {
        candidate = entry[playerId];
      }
      if (isPlayerStats(candidate)) rows.push({ year, stats: candidate });
    }
  }
  return rows.sort((first, second) => second.year.localeCompare(first.year));
}
