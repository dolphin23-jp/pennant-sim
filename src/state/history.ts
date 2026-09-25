import type {
  AccumulatedStats,
  PlayerStats,
  SeasonHonorRecord,
  SeasonTitleRecord,
  TeamKey,
  Teams,
  YearlyPlayerRecords,
} from '../engine';
import { TINFO } from '../data';
import type { NarrativeEventLedger, SeasonReviewNarrativeEvent } from '../narrative/types';
import type { Player } from '../engine';
import type { ChampionRecord } from './storage';

/** The facts the history views are built from; all of them are already in the save. */
export interface HistorySource {
  teams: Teams | null;
  retiredPlayers: Player[];
  /** Players in MLB: departed, but their careers are not over. */
  overseasPlayers: Player[];
  leagueCareerAccumulated: AccumulatedStats;
  yearlyStats: YearlyPlayerRecords;
  championHistory: ChampionRecord[];
  awardHistory: SeasonTitleRecord[];
  honorHistory: SeasonHonorRecord[];
  narrativeEvents: NarrativeEventLedger;
}

const counting = (stats: PlayerStats | undefined, key: string): number => {
  const value = stats ? (stats as unknown as Record<string, unknown>)[key] : undefined;
  return typeof value === 'number' ? value : 0;
};

// ---------------------------------------------------------------------------------------
// 殿堂 (Hall of Fame)

export interface HallOfFameEntry {
  playerId: string;
  playerName: string;
  isPitcher: boolean;
  /** Last club, when known. */
  teamKey: TeamKey | null;
  /** The year he left the league, when the save recorded it. */
  retiredYear: number | null;
  careerLine: string;
  /** Why he is in: 名球会 thresholds, MVPs, titles. */
  reasons: string[];
  score: number;
}

/** 名球会 thresholds, and further marks that alone make a Hall of Fame career. */
const CAREER_MARKS: Array<{ key: string; kind: 'bat' | 'pit'; value: number; label: string }> = [
  { key: 'h', kind: 'bat', value: 2000, label: '通算2000安打' },
  { key: 'hr', kind: 'bat', value: 400, label: '通算400本塁打' },
  { key: 'w', kind: 'pit', value: 200, label: '通算200勝' },
  { key: 'sv', kind: 'pit', value: 250, label: '通算250セーブ' },
  { key: 'k', kind: 'pit', value: 2500, label: '通算2500奪三振' },
];

function careerLine(stats: PlayerStats): string {
  if (stats.type === 'bat')
    return `${stats.g}試合 ${stats.h}安打 ${stats.hr}本塁打 打率${(stats.ab
      ? stats.h / stats.ab
      : 0
    )
      .toFixed(3)
      .replace(/^0/, '')}`;
  return `${stats.g}登板 ${stats.w}勝 ${stats.sv}セーブ 防御率${(stats.ip3
    ? (stats.er * 27) / stats.ip3
    : 0
  ).toFixed(2)}`;
}

function retirementYears(ledger: NarrativeEventLedger): Map<string, number> {
  const years = new Map<string, number>();
  for (const events of Object.values(ledger))
    for (const event of events)
      if (
        event.type === 'transaction' &&
        (event.transactionKind === 'retirement' || event.transactionKind === 'release')
      )
        years.set(event.playerId, event.year);
  return years;
}

/**
 * Retired players whose careers earned a place: a 名球会 mark, two MVPs, or a long career
 * decorated with titles and honors. Recomputed from the record books, never stored.
 */
export function buildHallOfFame(source: HistorySource): HallOfFameEntry[] {
  const retired = retirementYears(source.narrativeEvents);
  const mvps = new Map<string, number>();
  const honors = new Map<string, number>();
  for (const honor of source.honorHistory) {
    if (honor.honorId === 'mvp') mvps.set(honor.playerId, (mvps.get(honor.playerId) ?? 0) + 1);
    if (honor.honorId === 'bestNine')
      honors.set(honor.playerId, (honors.get(honor.playerId) ?? 0) + 1);
  }
  const titles = new Map<string, number>();
  for (const title of source.awardHistory)
    titles.set(title.playerId, (titles.get(title.playerId) ?? 0) + 1);

  const entries: HallOfFameEntry[] = [];
  const seen = new Set<string>(source.overseasPlayers.map((player) => player.id));
  for (const player of source.retiredPlayers) {
    if (seen.has(player.id)) continue;
    seen.add(player.id);
    const stats = source.leagueCareerAccumulated[player.id];
    if (!stats) continue;
    const reasons = CAREER_MARKS.filter(
      (mark) => stats.type === mark.kind && counting(stats, mark.key) >= mark.value,
    ).map((mark) => mark.label);
    const mvp = mvps.get(player.id) ?? 0;
    const titleCount = titles.get(player.id) ?? 0;
    const bestNine = honors.get(player.id) ?? 0;
    if (mvp >= 2) reasons.push(`MVP ${mvp}回`);
    if (!reasons.length && titleCount + bestNine >= 8 && stats.g >= 1000)
      reasons.push(`タイトル${titleCount}回・ベストナイン${bestNine}回`);
    if (!reasons.length) continue;
    const score =
      stats.type === 'bat'
        ? counting(stats, 'h') / 20 + counting(stats, 'hr') / 4
        : counting(stats, 'w') / 2 + counting(stats, 'sv') / 3 + counting(stats, 'k') / 30;
    entries.push({
      playerId: player.id,
      playerName: player.name,
      isPitcher: player.isP,
      teamKey: player.tk in TINFO ? (player.tk as TeamKey) : null,
      retiredYear: retired.get(player.id) ?? null,
      careerLine: careerLine(stats),
      reasons: [
        ...reasons,
        ...(mvp && mvp < 2 ? [`MVP ${mvp}回`] : []),
        ...(titleCount && !reasons.some((reason) => reason.startsWith('タイトル'))
          ? [`タイトル${titleCount}回`]
          : []),
      ],
      score: score + mvp * 30 + titleCount * 5 + bestNine * 3,
    });
  }
  return entries.sort((first, second) => second.score - first.score);
}

// ---------------------------------------------------------------------------------------
// 球団史 (franchise history)

export interface FranchiseSeason {
  year: number;
  rank: number | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  /** Won the Japan Series. */
  champion: boolean;
  /** Played in the Japan Series and lost. */
  runnerUp: boolean;
}

export interface FranchiseLeader {
  playerId: string;
  playerName: string;
  value: number;
}

export interface FranchiseHistory {
  teamKey: TeamKey;
  seasons: FranchiseSeason[];
  pennants: number;
  championships: number;
  leaders: Array<{ label: string; entries: FranchiseLeader[] }>;
  honors: SeasonHonorRecord[];
  titles: SeasonTitleRecord[];
}

const FRANCHISE_LEADERS: Array<{ key: string; kind: 'bat' | 'pit'; label: string }> = [
  { key: 'h', kind: 'bat', label: '安打' },
  { key: 'hr', kind: 'bat', label: '本塁打' },
  { key: 'sb', kind: 'bat', label: '盗塁' },
  { key: 'w', kind: 'pit', label: '勝利' },
  { key: 'sv', kind: 'pit', label: 'セーブ' },
  { key: 'k', kind: 'pit', label: '奪三振' },
];

/**
 * A club's story: every season it finished (rank from the season reviews, Japan Series
 * from the champion records), and club career leaders summed from the year-by-year
 * records while players wore its uniform.
 */
export function buildFranchiseHistory(source: HistorySource, teamKey: TeamKey): FranchiseHistory {
  const reviews = new Map<number, SeasonReviewNarrativeEvent>();
  for (const events of Object.values(source.narrativeEvents))
    for (const event of events)
      if (event.type === 'seasonReview' && event.teamKey === teamKey)
        reviews.set(event.year, event);
  const years = new Set<number>([
    ...reviews.keys(),
    ...source.championHistory
      .filter((record) => record.champion === teamKey || record.runnerUp === teamKey)
      .map((record) => record.year),
  ]);
  const seasons = [...years]
    .sort((a, b) => b - a)
    .map((year) => {
      const review = reviews.get(year);
      const champion = source.championHistory.find((record) => record.year === year);
      return {
        year,
        rank: review?.rank ?? null,
        wins: review?.wins ?? null,
        losses: review?.losses ?? null,
        draws: review?.draws ?? null,
        champion: champion?.champion === teamKey,
        runnerUp: champion?.runnerUp === teamKey,
      };
    });

  const totals = new Map<string, { name: string; stats: Record<string, number> }>();
  for (const records of Object.values(source.yearlyStats))
    for (const record of records) {
      if (record.teamKey !== teamKey) continue;
      const entry = totals.get(record.playerId) ?? { name: record.playerName, stats: {} };
      for (const leader of FRANCHISE_LEADERS)
        if (record.stats.type === leader.kind)
          entry.stats[leader.key] =
            (entry.stats[leader.key] ?? 0) + counting(record.stats, leader.key);
      totals.set(record.playerId, entry);
    }
  const leaders = FRANCHISE_LEADERS.map((leader) => ({
    label: leader.label,
    entries: [...totals.entries()]
      .map(([playerId, entry]) => ({
        playerId,
        playerName: entry.name,
        value: entry.stats[leader.key] ?? 0,
      }))
      .filter((entry) => entry.value > 0)
      .sort((first, second) => second.value - first.value)
      .slice(0, 5),
  })).filter((leader) => leader.entries.length);

  return {
    teamKey,
    seasons,
    // A pennant is a first-place finish, or a Japan Series appearance in a generated year.
    pennants: seasons.filter(
      (season) =>
        season.rank === 1 || (season.rank === null && (season.champion || season.runnerUp)),
    ).length,
    championships: seasons.filter((season) => season.champion).length,
    leaders,
    honors: source.honorHistory
      .filter((honor) => honor.teamKey === teamKey && honor.honorId === 'mvp')
      .sort((a, b) => b.year - a.year),
    titles: source.awardHistory
      .filter((title) => title.teamKey === teamKey)
      .sort((a, b) => b.year - a.year),
  };
}

// ---------------------------------------------------------------------------------------
// 記録ウォッチ (record watch)

export interface RecordWatchEntry {
  playerId: string;
  playerName: string;
  teamKey: TeamKey;
  label: string;
  current: number;
  target: number;
  remaining: number;
}

/** Career marks worth watching, and how close a player must be for it to be news. */
const WATCHED_MARKS: Array<{
  key: string;
  kind: 'bat' | 'pit';
  label: string;
  marks: number[];
  window: number;
}> = [
  { key: 'h', kind: 'bat', label: '通算安打', marks: [1000, 1500, 2000, 2500, 3000], window: 120 },
  { key: 'hr', kind: 'bat', label: '通算本塁打', marks: [200, 300, 400, 500, 600], window: 30 },
  { key: 'sb', kind: 'bat', label: '通算盗塁', marks: [300, 500, 700, 900], window: 30 },
  { key: 'w', kind: 'pit', label: '通算勝利', marks: [100, 150, 200, 250, 300], window: 12 },
  { key: 'sv', kind: 'pit', label: '通算セーブ', marks: [100, 200, 250, 300, 400], window: 25 },
  {
    key: 'k',
    kind: 'pit',
    label: '通算奪三振',
    marks: [1000, 1500, 2000, 2500, 3000],
    window: 120,
  },
];

/** Active players within reach of a round career number, closest first. */
export function buildRecordWatch(source: HistorySource, limit = 12): RecordWatchEntry[] {
  if (!source.teams) return [];
  const entries: RecordWatchEntry[] = [];
  for (const [teamKey, team] of Object.entries(source.teams) as Array<[TeamKey, Teams[TeamKey]]>)
    for (const player of [...team.pitchers, ...team.fielders]) {
      const stats = source.leagueCareerAccumulated[player.id];
      if (!stats) continue;
      for (const watched of WATCHED_MARKS) {
        if (stats.type !== watched.kind) continue;
        const current = counting(stats, watched.key);
        const target = watched.marks.find((mark) => mark > current);
        if (target === undefined || target - current > watched.window) continue;
        entries.push({
          playerId: player.id,
          playerName: player.name,
          teamKey,
          label: watched.label,
          current,
          target,
          remaining: target - current,
        });
      }
    }
  const closeness = (entry: RecordWatchEntry) => entry.remaining / entry.target;
  return entries.sort((first, second) => closeness(first) - closeness(second)).slice(0, limit);
}
