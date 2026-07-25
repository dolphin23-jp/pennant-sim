import { ops } from './statsFormat';
import type {
  BatterStats,
  PitcherStats,
  PlayerSeasonRecord,
  PlayerStats,
  TeamKey,
  YearlyPlayerRecords,
} from './types';

export type HistoricalRankingScope = 'season' | 'career';
export type HistoricalRankingKind = 'bat' | 'pit';
export type HistoricalRankingMetric =
  | 'average'
  | 'hits'
  | 'homeRuns'
  | 'runsBattedIn'
  | 'stolenBases'
  | 'ops'
  | 'era'
  | 'wins'
  | 'strikeouts'
  | 'saves'
  | 'holds';

export interface HistoricalRankingEntry {
  playerId: string;
  playerName: string;
  value: number;
  year: number;
  age: number;
  teamKey: TeamKey;
  teamAbbreviation: string;
  isActive: boolean;
  seasons: number;
  stats: PlayerStats;
}

export interface HistoricalRankingOptions {
  scope: HistoricalRankingScope;
  metric: HistoricalRankingMetric;
  teamKey?: TeamKey | null;
  activePlayerIds?: ReadonlySet<string>;
  limit?: number;
}

const metricKind: Record<HistoricalRankingMetric, HistoricalRankingKind> = {
  average: 'bat',
  hits: 'bat',
  homeRuns: 'bat',
  runsBattedIn: 'bat',
  stolenBases: 'bat',
  ops: 'bat',
  era: 'pit',
  wins: 'pit',
  strikeouts: 'pit',
  saves: 'pit',
  holds: 'pit',
};

export function historicalMetricKind(metric: HistoricalRankingMetric): HistoricalRankingKind {
  return metricKind[metric];
}

export function historicalMetricDirection(metric: HistoricalRankingMetric): 'asc' | 'desc' {
  return metric === 'era' ? 'asc' : 'desc';
}

export function historicalMetricValue(
  metric: HistoricalRankingMetric,
  stats: PlayerStats,
): number | null {
  if (stats.type === 'bat') {
    if (metric === 'average') return stats.ab > 0 ? stats.h / stats.ab : null;
    if (metric === 'hits') return stats.h;
    if (metric === 'homeRuns') return stats.hr;
    if (metric === 'runsBattedIn') return stats.rbi;
    if (metric === 'stolenBases') return stats.sb;
    if (metric === 'ops') return stats.pa > 0 ? ops(stats) : null;
    return null;
  }
  if (metric === 'era') return stats.ip3 > 0 ? (stats.er * 27) / stats.ip3 : null;
  if (metric === 'wins') return stats.w;
  if (metric === 'strikeouts') return stats.k;
  if (metric === 'saves') return stats.sv;
  if (metric === 'holds') return stats.hld;
  return null;
}

function mergeSameKindStats(base: PlayerStats, addition: PlayerStats): PlayerStats {
  if (base.type !== addition.type) return base;
  const merged = { ...base } as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(addition)) {
    if (typeof value === 'number') merged[key] = Number(merged[key] ?? 0) + value;
    else if (key === 'name' || key === 'type') merged[key] = value;
  }
  return merged as unknown as PlayerStats;
}

function allRecords(yearlyStats: YearlyPlayerRecords): PlayerSeasonRecord[] {
  return Object.values(yearlyStats).flat().filter((record) => record && record.stats);
}

function entryFromRecord(
  record: PlayerSeasonRecord,
  value: number,
  activePlayerIds: ReadonlySet<string>,
): HistoricalRankingEntry {
  return {
    playerId: record.playerId,
    playerName: record.playerName,
    value,
    year: record.year,
    age: record.age,
    teamKey: record.teamKey,
    teamAbbreviation: record.teamAbbreviation,
    isActive: activePlayerIds.has(record.playerId),
    seasons: 1,
    stats: { ...record.stats } as PlayerStats,
  };
}

function seasonEntries(
  records: PlayerSeasonRecord[],
  metric: HistoricalRankingMetric,
  activePlayerIds: ReadonlySet<string>,
): HistoricalRankingEntry[] {
  return records.flatMap((record) => {
    if (record.stats.type !== metricKind[metric]) return [];
    const value = historicalMetricValue(metric, record.stats);
    return value === null ? [] : [entryFromRecord(record, value, activePlayerIds)];
  });
}

function careerEntries(
  records: PlayerSeasonRecord[],
  metric: HistoricalRankingMetric,
  activePlayerIds: ReadonlySet<string>,
): HistoricalRankingEntry[] {
  const grouped = new Map<string, { records: PlayerSeasonRecord[]; stats: PlayerStats }>();
  for (const record of records) {
    if (record.stats.type !== metricKind[metric]) continue;
    const current = grouped.get(record.playerId);
    if (!current) {
      grouped.set(record.playerId, {
        records: [record],
        stats: { ...record.stats } as PlayerStats,
      });
      continue;
    }
    current.records.push(record);
    current.stats = mergeSameKindStats(current.stats, record.stats);
  }

  return [...grouped.values()].flatMap(({ records: playerRecords, stats }) => {
    const value = historicalMetricValue(metric, stats);
    if (value === null) return [];
    const latest = [...playerRecords].sort((a, b) => b.year - a.year)[0];
    return [{
      ...entryFromRecord(latest, value, activePlayerIds),
      seasons: playerRecords.length,
      stats,
    }];
  });
}

export function buildHistoricalRanking(
  yearlyStats: YearlyPlayerRecords,
  options: HistoricalRankingOptions,
): HistoricalRankingEntry[] {
  const activePlayerIds = options.activePlayerIds ?? new Set<string>();
  const records = allRecords(yearlyStats).filter(
    (record) => !options.teamKey || record.teamKey === options.teamKey,
  );
  const entries = options.scope === 'season'
    ? seasonEntries(records, options.metric, activePlayerIds)
    : careerEntries(records, options.metric, activePlayerIds);
  const direction = historicalMetricDirection(options.metric);
  entries.sort((first, second) => {
    const difference = first.value - second.value;
    if (difference !== 0) return direction === 'asc' ? difference : -difference;
    if (first.year !== second.year) return first.year - second.year;
    return first.playerName.localeCompare(second.playerName, 'ja');
  });
  return entries.slice(0, options.limit ?? 20);
}

export function formatHistoricalRankingValue(
  metric: HistoricalRankingMetric,
  value: number,
): string {
  if (metric === 'average' || metric === 'ops') return value.toFixed(3).replace(/^0/, '');
  if (metric === 'era') return value.toFixed(2);
  return String(Math.round(value));
}

export const BATTER_HISTORICAL_METRICS: Array<{ id: HistoricalRankingMetric; label: string }> = [
  { id: 'average', label: '打率' },
  { id: 'hits', label: '安打' },
  { id: 'homeRuns', label: '本塁打' },
  { id: 'runsBattedIn', label: '打点' },
  { id: 'stolenBases', label: '盗塁' },
  { id: 'ops', label: 'OPS' },
];

export const PITCHER_HISTORICAL_METRICS: Array<{ id: HistoricalRankingMetric; label: string }> = [
  { id: 'era', label: '防御率' },
  { id: 'wins', label: '勝利' },
  { id: 'strikeouts', label: '奪三振' },
  { id: 'saves', label: 'セーブ' },
  { id: 'holds', label: 'ホールド' },
];
