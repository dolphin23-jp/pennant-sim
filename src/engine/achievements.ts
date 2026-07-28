import type { AccumulatedStats, BatterStats, PitcherStats, TeamKey, Teams, YearlyPlayerRecords } from './types';

export type AchievementKind = 'milestone' | 'seasonRecord' | 'careerRecord';

export interface AchievementEvent {
  id: string;
  kind: AchievementKind;
  playerId: string;
  playerName: string;
  teamKey: TeamKey;
  metricLabel: string;
  value: number;
  /** Only set for record-breaking events (not plain milestones). */
  previousValue?: number | null;
  previousHolderName?: string | null;
  year: number;
  date: string;
}

interface CountingMetricDefinition {
  key: keyof BatterStats | keyof PitcherStats;
  kind: 'bat' | 'pit';
  label: string;
}

const BATTER_RECORD_METRICS: CountingMetricDefinition[] = [
  { key: 'hr', kind: 'bat', label: '本塁打' },
  { key: 'h', kind: 'bat', label: '安打' },
  { key: 'rbi', kind: 'bat', label: '打点' },
  { key: 'sb', kind: 'bat', label: '盗塁' },
];
const PITCHER_RECORD_METRICS: CountingMetricDefinition[] = [
  { key: 'w', kind: 'pit', label: '勝利' },
  { key: 'k', kind: 'pit', label: '奪三振' },
  { key: 'sv', kind: 'pit', label: 'セーブ' },
  { key: 'hld', kind: 'pit', label: 'ホールド' },
];
const RECORD_METRICS: CountingMetricDefinition[] = [...BATTER_RECORD_METRICS, ...PITCHER_RECORD_METRICS];

// Below these, a "record" is too trivial to be worth a celebration (a rookie's 3rd
// career hit is not a record, even if literally nobody else has 3 hits yet in a
// freshly-started game).
const SEASON_RECORD_FLOOR: Partial<Record<string, number>> = {
  hr: 20,
  h: 100,
  rbi: 50,
  sb: 20,
  w: 10,
  k: 100,
  sv: 15,
  hld: 15,
};
const CAREER_RECORD_FLOOR: Partial<Record<string, number>> = {
  hr: 100,
  h: 500,
  rbi: 300,
  sb: 100,
  w: 50,
  k: 500,
  sv: 80,
  hld: 80,
};

interface MilestoneDefinition {
  key: keyof BatterStats | keyof PitcherStats;
  kind: 'bat' | 'pit';
  label: string;
  start: number;
  step: number;
}

// 2000本以降の1000本ごと、200勝以降の100勝ごと、250セーブ以降の150セーブごと、
// 250ホールド以降の150ホールドごと、300盗塁以降の200盗塁ごと。
const MILESTONE_DEFINITIONS: MilestoneDefinition[] = [
  { key: 'h', kind: 'bat', label: '通算安打', start: 2000, step: 1000 },
  { key: 'w', kind: 'pit', label: '通算勝利', start: 200, step: 100 },
  { key: 'sv', kind: 'pit', label: '通算セーブ', start: 250, step: 150 },
  { key: 'hld', kind: 'pit', label: '通算ホールド', start: 250, step: 150 },
  { key: 'sb', kind: 'bat', label: '通算盗塁', start: 300, step: 200 },
];

function metricValue(
  definition: { key: keyof BatterStats | keyof PitcherStats; kind: 'bat' | 'pit' },
  stats: BatterStats | PitcherStats | undefined,
): number {
  if (!stats || stats.type !== definition.kind) return 0;
  const value = (stats as unknown as Record<string, unknown>)[definition.key];
  return typeof value === 'number' ? value : 0;
}

/** Every threshold strictly greater than `before` and at most `after`, e.g. crossing
 * from 1950 to 3200 hits with start=2000/step=1000 yields [2000, 3000]. */
function crossedThresholds(before: number, after: number, start: number, step: number): number[] {
  if (after < start) return [];
  const thresholds: number[] = [];
  let threshold = start;
  while (threshold <= after) {
    if (threshold > before) thresholds.push(threshold);
    threshold += step;
  }
  return thresholds;
}

interface PlayerInfo {
  name: string;
  teamKey: TeamKey;
}

function buildPlayerInfo(teams: Teams): Map<string, PlayerInfo> {
  const info = new Map<string, PlayerInfo>();
  for (const [teamKey, team] of Object.entries(teams) as Array<[TeamKey, Teams[TeamKey]]>) {
    for (const player of [...team.fielders, ...team.pitchers]) {
      info.set(player.id, { name: player.name, teamKey });
    }
  }
  return info;
}

function detectCareerMilestones(
  before: AccumulatedStats,
  after: AccumulatedStats,
  playerInfo: Map<string, PlayerInfo>,
  year: number,
  date: string,
): AchievementEvent[] {
  const events: AchievementEvent[] = [];
  for (const [playerId, afterStats] of Object.entries(after)) {
    const info = playerInfo.get(playerId);
    if (!info) continue;
    for (const definition of MILESTONE_DEFINITIONS) {
      if (afterStats.type !== definition.kind) continue;
      const beforeValue = metricValue(definition, before[playerId]),
        afterValue = metricValue(definition, afterStats);
      for (const threshold of crossedThresholds(beforeValue, afterValue, definition.start, definition.step)) {
        events.push({
          id: `milestone:${playerId}:${definition.key}:${threshold}`,
          kind: 'milestone',
          playerId,
          playerName: info.name,
          teamKey: info.teamKey,
          metricLabel: definition.label,
          value: threshold,
          year,
          date,
        });
      }
    }
  }
  return events;
}

/** The best single-season total anyone has ever recorded for this metric, across every
 * completed season in `yearlyStats` - the real "single-season record" a current player's
 * in-progress season is measured against. Comparing against current-season contemporaries
 * instead (as an earlier version of this function did) meant that on a brand-new save,
 * with nobody on record for anything yet, nearly every regular player would trivially
 * "break the record" simply by clearing the season floor - see the flood of ~270 false
 * positives caught by live verification of a single fresh season. Comparing against
 * completed-season history keeps this rare and meaningful, and correctly yields nothing
 * to celebrate in the very first season of a new save, when no history exists yet.
 */
function bestSingleSeasonValue(
  definition: CountingMetricDefinition,
  yearlyStats: YearlyPlayerRecords,
): { value: number; holderName: string } | null {
  let best: { value: number; holderName: string } | null = null;
  for (const records of Object.values(yearlyStats)) {
    for (const record of records) {
      if (record.stats.type !== definition.kind) continue;
      const value = metricValue(definition, record.stats);
      if (!best || value > best.value) best = { value, holderName: record.playerName };
    }
  }
  return best;
}

function detectSeasonRecords(
  before: AccumulatedStats,
  after: AccumulatedStats,
  playerInfo: Map<string, PlayerInfo>,
  yearlyStats: YearlyPlayerRecords,
  year: number,
  date: string,
): AchievementEvent[] {
  const events: AchievementEvent[] = [];
  for (const [playerId, afterStats] of Object.entries(after)) {
    const info = playerInfo.get(playerId);
    if (!info) continue;
    for (const definition of RECORD_METRICS) {
      if (afterStats.type !== definition.kind) continue;
      const afterValue = metricValue(definition, afterStats);
      const floor = SEASON_RECORD_FLOOR[definition.key as string] ?? Infinity;
      if (afterValue < floor) continue;
      const rival = bestSingleSeasonValue(definition, yearlyStats);
      if (!rival) continue;
      const beforeValue = metricValue(definition, before[playerId]);
      if (beforeValue > rival.value || afterValue <= rival.value) continue;
      events.push({
        id: `seasonRecord:${year}:${playerId}:${definition.key}`,
        kind: 'seasonRecord',
        playerId,
        playerName: info.name,
        teamKey: info.teamKey,
        metricLabel: definition.label,
        value: afterValue,
        previousValue: rival.value,
        previousHolderName: rival.holderName,
        year,
        date,
      });
    }
  }
  return events;
}

/** Career totals through the end of the last completed season, per player - the frozen
 * baseline career-record detection compares this year's in-progress totals against. */
function careerBaselines(
  yearlyStats: YearlyPlayerRecords,
): Map<string, { value: Partial<Record<string, number>>; name: string }> {
  const totals = new Map<string, { value: Partial<Record<string, number>>; name: string }>();
  for (const records of Object.values(yearlyStats)) {
    for (const record of records) {
      const entry = totals.get(record.playerId) ?? { value: {}, name: record.playerName };
      for (const definition of RECORD_METRICS) {
        if (record.stats.type !== definition.kind) continue;
        const current = entry.value[definition.key as string] ?? 0;
        entry.value[definition.key as string] = current + metricValue(definition, record.stats);
      }
      entry.name = record.playerName;
      totals.set(record.playerId, entry);
    }
  }
  return totals;
}

function detectCareerRecords(
  after: AccumulatedStats,
  playerInfo: Map<string, PlayerInfo>,
  yearlyStats: YearlyPlayerRecords,
  year: number,
  date: string,
): AchievementEvent[] {
  const baselines = careerBaselines(yearlyStats);
  const events: AchievementEvent[] = [];
  for (const [playerId, afterStats] of Object.entries(after)) {
    const info = playerInfo.get(playerId);
    if (!info) continue;
    const selfBaseline = baselines.get(playerId);
    for (const definition of RECORD_METRICS) {
      if (afterStats.type !== definition.kind) continue;
      const afterValue = metricValue(definition, afterStats);
      const floor = CAREER_RECORD_FLOOR[definition.key as string] ?? Infinity;
      if (afterValue < floor) continue;
      const beforeValue = selfBaseline?.value[definition.key as string] ?? 0;
      let rivalValue = 0,
        rivalName: string | null = null;
      for (const [otherId, other] of baselines) {
        if (otherId === playerId) continue;
        const value = other.value[definition.key as string] ?? 0;
        if (value > rivalValue) {
          rivalValue = value;
          rivalName = other.name;
        }
      }
      if (beforeValue > rivalValue || afterValue <= rivalValue) continue;
      events.push({
        id: `careerRecord:${playerId}:${definition.key}:${rivalValue}`,
        kind: 'careerRecord',
        playerId,
        playerName: info.name,
        teamKey: info.teamKey,
        metricLabel: definition.label,
        value: afterValue,
        previousValue: rivalValue > 0 ? rivalValue : null,
        previousHolderName: rivalName,
        year,
        date,
      });
    }
  }
  return events;
}

export function detectAchievements(input: {
  year: number;
  date: string;
  teams: Teams;
  beforeSeasonStats: AccumulatedStats;
  afterSeasonStats: AccumulatedStats;
  beforeCareerStats: AccumulatedStats;
  afterCareerStats: AccumulatedStats;
  yearlyStats: YearlyPlayerRecords;
}): AchievementEvent[] {
  const playerInfo = buildPlayerInfo(input.teams);
  return [
    ...detectCareerMilestones(
      input.beforeCareerStats,
      input.afterCareerStats,
      playerInfo,
      input.year,
      input.date,
    ),
    ...detectSeasonRecords(
      input.beforeSeasonStats,
      input.afterSeasonStats,
      playerInfo,
      input.yearlyStats,
      input.year,
      input.date,
    ),
    ...detectCareerRecords(input.afterCareerStats, playerInfo, input.yearlyStats, input.year, input.date),
  ];
}
