import { CENTRAL, PACIFIC } from '../data';
import { qualifiesForRate, STATS_QUALIFICATION } from '../engine';
import type {
  AccumulatedStats,
  AchievementEvent,
  PlayerSeasonRecord,
  SeasonTitleRecord,
  TeamKey,
  YearlyPlayerRecords,
} from '../engine';
import type {
  DevelopmentNarrativeEvent,
  DraftNarrativeEvent,
  NarrativeEvent,
  NarrativeEventLedger,
  SeasonReviewNarrativeEvent,
  TransactionNarrativeEvent,
} from '../narrative/types';
import type { ChampionRecord } from './storage';

/** Everything a year's review is assembled from; all of it is already in the save. */
export interface YearReviewSource {
  championHistory: ChampionRecord[];
  awardHistory: SeasonTitleRecord[];
  achievementHistory: AchievementEvent[];
  narrativeEvents: NarrativeEventLedger;
  yearlyStats: YearlyPlayerRecords;
  leagueCareerAccumulated: AccumulatedStats;
}

export interface YearReviewLeader {
  playerId: string;
  playerName: string;
  teamKey: TeamKey;
  value: string;
}

export interface YearReviewRetirement {
  playerId: string;
  playerName: string;
  teamKey: TeamKey | null;
  /** Career summary from the archived league totals, when the player is archived. */
  career: string | null;
  /** Ordering weight: how substantial the career was. */
  weight: number;
}

export interface YearReview {
  year: number;
  standings: Record<'central' | 'pacific', SeasonReviewNarrativeEvent[]>;
  champion: ChampionRecord | null;
  titles: Record<'central' | 'pacific', SeasonTitleRecord[]>;
  leaders: Array<{ label: string; entries: YearReviewLeader[] }>;
  achievements: AchievementEvent[];
  moves: { total: number; highlights: TransactionNarrativeEvent[] };
  retirements: YearReviewRetirement[];
  firstRoundPicks: DraftNarrativeEvent[];
  breakouts: DevelopmentNarrativeEvent[];
}

const LEAGUE_OF = (teamKey: TeamKey): 'central' | 'pacific' =>
  (CENTRAL as readonly TeamKey[]).includes(teamKey) ? 'central' : 'pacific';

const ACHIEVEMENT_PRIORITY: Record<AchievementEvent['kind'], number> = {
  careerRecord: 0,
  seasonRecord: 1,
  milestone: 2,
};

const rate = (numerator: number, denominator: number): number =>
  denominator > 0 ? numerator / denominator : 0;

function leaders(
  records: PlayerSeasonRecord[],
  label: string,
  kind: 'bat' | 'pit',
  score: (record: PlayerSeasonRecord) => number | null,
  format: (value: number) => string,
  ascending = false,
): { label: string; entries: YearReviewLeader[] } {
  const scored = records
    .filter((record) => record.stats.type === kind)
    .map((record) => ({ record, value: score(record) }))
    .filter((entry): entry is { record: PlayerSeasonRecord; value: number } => entry.value != null)
    .sort((first, second) => (ascending ? first.value - second.value : second.value - first.value));
  return {
    label,
    entries: scored.slice(0, 3).map(({ record, value }) => ({
      playerId: record.playerId,
      playerName: record.playerName,
      teamKey: record.teamKey,
      value: format(value),
    })),
  };
}

function seasonLeaders(records: PlayerSeasonRecord[]) {
  const games = STATS_QUALIFICATION.fullSeasonTeamGames;
  return [
    leaders(
      records,
      '本塁打',
      'bat',
      (record) => (record.stats.type === 'bat' ? record.stats.hr : null),
      (value) => `${value}本`,
    ),
    leaders(
      records,
      '打率',
      'bat',
      (record) =>
        record.stats.type === 'bat' && qualifiesForRate(record.stats, games)
          ? rate(record.stats.h, record.stats.ab)
          : null,
      (value) => value.toFixed(3).replace(/^0/, ''),
    ),
    leaders(
      records,
      '勝利',
      'pit',
      (record) => (record.stats.type === 'pit' ? record.stats.w : null),
      (value) => `${value}勝`,
    ),
    leaders(
      records,
      '防御率',
      'pit',
      (record) =>
        record.stats.type === 'pit' && qualifiesForRate(record.stats, games)
          ? rate(record.stats.er * 27, record.stats.ip3)
          : null,
      (value) => value.toFixed(2),
      true,
    ),
  ].filter((section) => section.entries.length > 0);
}

function careerLine(totals: AccumulatedStats[string] | undefined): {
  text: string | null;
  weight: number;
} {
  if (!totals) return { text: null, weight: 0 };
  if (totals.type === 'bat')
    return {
      text: `通算${totals.g}試合 ${totals.h}安打 ${totals.hr}本塁打`,
      weight: totals.h + totals.hr * 4,
    };
  return {
    text: `通算${totals.g}登板 ${totals.w}勝 ${totals.sv ?? 0}セーブ`,
    weight: totals.w * 10 + (totals.sv ?? 0) * 4,
  };
}

/** A single page's worth of "what happened this year", from facts already in the save. */
export function buildYearReview(source: YearReviewSource, year: number): YearReview {
  const events: NarrativeEvent[] = source.narrativeEvents[String(year)] ?? [];
  const reviews = events.filter(
    (event): event is SeasonReviewNarrativeEvent => event.type === 'seasonReview',
  );
  const standings = {
    central: reviews
      .filter((event) => LEAGUE_OF(event.teamKey) === 'central')
      .sort((a, b) => a.rank - b.rank),
    pacific: reviews
      .filter((event) => LEAGUE_OF(event.teamKey) === 'pacific')
      .sort((a, b) => a.rank - b.rank),
  };
  const yearTitles = source.awardHistory.filter((title) => title.year === year);
  const transactions = events.filter(
    (event): event is TransactionNarrativeEvent => event.type === 'transaction',
  );
  const moves = transactions.filter(
    (event) =>
      event.transactionKind === 'trade' ||
      event.transactionKind === 'faSigning' ||
      event.transactionKind === 'foreignSigning',
  );
  const retirements = transactions
    .filter((event) => event.transactionKind === 'retirement')
    .map((event) => {
      const career = careerLine(source.leagueCareerAccumulated[event.playerId]);
      return {
        playerId: event.playerId,
        playerName: event.playerName,
        teamKey: event.fromTeamKey ?? null,
        career: career.text,
        weight: career.weight,
      };
    })
    .sort((first, second) => second.weight - first.weight)
    .slice(0, 15);
  const growth = (event: DevelopmentNarrativeEvent) =>
    event.developmentKind === 'awakening' ? 100 : (event.ovrAfter ?? 0) - (event.ovrBefore ?? 0);
  return {
    year,
    standings,
    champion: source.championHistory.find((record) => record.year === year) ?? null,
    titles: {
      central: yearTitles.filter((title) => title.league === 'central'),
      pacific: yearTitles.filter((title) => title.league === 'pacific'),
    },
    leaders: seasonLeaders(source.yearlyStats[String(year)] ?? []),
    achievements: source.achievementHistory
      .filter((event) => event.year === year)
      .sort(
        (first, second) =>
          ACHIEVEMENT_PRIORITY[first.kind] - ACHIEVEMENT_PRIORITY[second.kind] ||
          first.date.localeCompare(second.date),
      )
      .slice(0, 10),
    // Trades first: every one is a story, while FA signings are routine each winter.
    moves: {
      total: moves.length,
      highlights: [
        ...moves.filter((event) => event.transactionKind === 'trade'),
        ...moves.filter((event) => event.transactionKind !== 'trade'),
      ].slice(0, 10),
    },
    retirements,
    firstRoundPicks: events
      .filter((event): event is DraftNarrativeEvent => event.type === 'draft' && event.round === 1)
      .sort((first, second) => (first.overallPick ?? 99) - (second.overallPick ?? 99)),
    breakouts: events
      .filter(
        (event): event is DevelopmentNarrativeEvent =>
          event.type === 'development' && growth(event) > 0,
      )
      .sort((first, second) => growth(second) - growth(first))
      .slice(0, 5),
  };
}

/** Completed years with anything to review, newest first. `throughYear` excludes a season
 * still in progress, whose partial facts would read as a finished year. */
export function availableReviewYears(source: YearReviewSource, throughYear: number): number[] {
  const years = new Set<number>([
    ...source.championHistory.map((record) => record.year),
    ...source.awardHistory.map((title) => title.year),
    ...Object.keys(source.narrativeEvents).map(Number),
    ...Object.keys(source.yearlyStats).map(Number),
  ]);
  return [...years]
    .filter((year) => Number.isInteger(year) && year <= throughYear)
    .sort((a, b) => b - a);
}

export const YEAR_REVIEW_LEAGUES = [
  { id: 'central', label: 'セ・リーグ', teams: CENTRAL },
  { id: 'pacific', label: 'パ・リーグ', teams: PACIFIC },
] as const;
