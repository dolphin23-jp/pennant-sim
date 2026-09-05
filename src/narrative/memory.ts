import { averageText, earnedRunAverage, inningsText } from '../engine/statsFormat';
import type { PlayerSeasonRecord, TeamKey, YearlyPlayerRecords } from '../engine/types';
import type { ChampionRecord } from '../state/storage';
import type { NarrativeSource } from './generate';
import { narrativeEventArticleId } from './ledger';
import type {
  NarrativeArticle,
  NarrativeEvent,
  NarrativeFactRef,
  TransactionNarrativeEvent,
} from './types';

export type NarrativeStoryArcType =
  | 'career-origin'
  | 'club-journey'
  | 'injury-recovery'
  | 'long-career'
  | 'title-history'
  | 'championship-history'
  | 'repeat-final';

export interface NarrativeStoryArc {
  id: string;
  type: NarrativeStoryArcType;
  playerIds: string[];
  teamKeys: TeamKey[];
  sourceIds: string[];
  weight: number;
}

export interface NarrativeMemoryContext {
  sourceArticleId: string;
  sourceKind: 'playerSeason';
  asOfDate: string;
  text: string;
  factRefs: NarrativeFactRef[];
  factValue: PlayerSeasonRecord;
}

export interface NarrativeMemoryIndex {
  seasonRecordsByPlayer: Map<string, PlayerSeasonRecord[]>;
  eventsByPlayer: Map<string, NarrativeEvent[]>;
  championshipsByTeam: Map<TeamKey, ChampionRecord[]>;
}

function eventAsOfDate(event: NarrativeEvent): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(event.date) ? event.date : `${event.year}-12-31`;
}

function playerIdsFromEvent(event: NarrativeEvent): string[] {
  if (event.type === 'seasonReview') return (event.titleHolders ?? []).map((holder) => holder.playerId);
  if (event.type === 'transaction') {
    return [...new Set([event.playerId, ...(event.movements ?? []).map((movement) => movement.playerId)])];
  }
  return [event.playerId];
}

function transactionTeams(event: TransactionNarrativeEvent): TeamKey[] {
  return [
    event.fromTeamKey,
    event.toTeamKey,
    ...(event.movements ?? []).flatMap((movement) => [movement.fromTeamKey, movement.toTeamKey]),
  ].filter((team): team is TeamKey => Boolean(team));
}

export function buildNarrativeMemoryIndex(source: NarrativeSource): NarrativeMemoryIndex {
  const seasonRecordsByPlayer = new Map<string, PlayerSeasonRecord[]>();
  for (const records of Object.values(source.yearlyStats ?? ({} as YearlyPlayerRecords))) {
    for (const record of records) {
      const entries = seasonRecordsByPlayer.get(record.playerId) ?? [];
      entries.push(record);
      seasonRecordsByPlayer.set(record.playerId, entries);
    }
  }
  for (const records of seasonRecordsByPlayer.values())
    records.sort((first, second) => first.year - second.year);

  const eventsByPlayer = new Map<string, NarrativeEvent[]>();
  for (const event of Object.values(source.narrativeEvents ?? {}).flat()) {
    for (const playerId of playerIdsFromEvent(event)) {
      const entries = eventsByPlayer.get(playerId) ?? [];
      entries.push(event);
      eventsByPlayer.set(playerId, entries);
    }
  }
  for (const events of eventsByPlayer.values())
    events.sort(
      (first, second) =>
        eventAsOfDate(first).localeCompare(eventAsOfDate(second)) ||
        narrativeEventArticleId(first).localeCompare(narrativeEventArticleId(second)),
    );

  const championshipsByTeam = new Map<TeamKey, ChampionRecord[]>();
  for (const championship of source.championHistory) {
    for (const teamKey of [championship.champion, championship.runnerUp].filter(
      (team): team is TeamKey => Boolean(team),
    )) {
      const entries = championshipsByTeam.get(teamKey) ?? [];
      entries.push(championship);
      championshipsByTeam.set(teamKey, entries);
    }
  }
  for (const records of championshipsByTeam.values())
    records.sort((first, second) => first.year - second.year);

  return { seasonRecordsByPlayer, eventsByPlayer, championshipsByTeam };
}

function seasonRecordAvailable(article: NarrativeArticle, record: PlayerSeasonRecord): boolean {
  const targetYear = Number(article.asOfDate.slice(0, 4));
  if (record.year < targetYear) return true;
  return record.year === targetYear && article.asOfDate === `${targetYear}-12-31`;
}

function hasAppearance(record: PlayerSeasonRecord): boolean {
  return record.stats.g > 0;
}

function standoutSeason(record: PlayerSeasonRecord): boolean {
  const stats = record.stats;
  if (stats.type === 'bat') {
    const average = stats.ab > 0 ? stats.h / stats.ab : 0;
    return average >= 0.3 || stats.hr >= 25 || stats.rbi >= 90 || stats.sb >= 25;
  }
  const era = earnedRunAverage(stats);
  return (
    stats.w >= 10 ||
    stats.sv >= 25 ||
    stats.hld >= 30 ||
    stats.k >= 140 ||
    (era !== null && stats.ip3 >= 300 && era < 3)
  );
}

function seasonRecordText(record: PlayerSeasonRecord): string {
  const stats = record.stats;
  if (stats.type === 'bat') {
    return `${record.year}年は${record.teamName}で${stats.g}試合に出場し、打率${averageText(stats.h, stats.ab)}、${stats.hr}本塁打、${stats.rbi}打点、${stats.sb}盗塁を記録した。`;
  }
  const era = earnedRunAverage(stats);
  const parts = [
    `${record.year}年は${record.teamName}で${stats.g}試合に登板`,
    stats.gs > 0 ? `${stats.gs}先発` : null,
    `${stats.w}勝${stats.l}敗`,
    era === null ? null : `防御率${era.toFixed(2)}`,
    `${inningsText(stats.ip3)}回`,
    `${stats.k}奪三振`,
    stats.sv > 0 ? `${stats.sv}セーブ` : null,
    stats.hld > 0 ? `${stats.hld}ホールド` : null,
  ].filter((part): part is string => Boolean(part));
  return `${parts.join('、')}だった。`;
}

function seasonRef(record: PlayerSeasonRecord): NarrativeFactRef {
  return { kind: 'PLAYER_SEASON', key: `${record.year}:${record.playerId}` };
}

/**
 * Sparse career memory: recent seasons, title seasons, standout seasons and the first active
 * season. The selection is deterministic; OVR is never exposed as a newspaper fact.
 */
export function buildCareerMemoryContext(
  article: NarrativeArticle,
  source: NarrativeSource,
  index: NarrativeMemoryIndex = buildNarrativeMemoryIndex(source),
  limit = 6,
): NarrativeMemoryContext[] {
  const selected: PlayerSeasonRecord[] = [];
  const seen = new Set<string>();
  const add = (record: PlayerSeasonRecord | undefined) => {
    if (!record || selected.length >= limit) return;
    const key = `${record.year}:${record.playerId}`;
    if (seen.has(key)) return;
    seen.add(key);
    selected.push(record);
  };

  for (const playerId of article.playerIds.slice(0, 4)) {
    const eligible = (index.seasonRecordsByPlayer.get(playerId) ?? []).filter(
      (record) => seasonRecordAvailable(article, record) && hasAppearance(record),
    );
    if (!eligible.length) continue;

    add(eligible.at(-1));

    const titleYears = new Set(
      source.awardHistory
        .filter(
          (award) =>
            award.playerId === playerId &&
            seasonRecordAvailable(article, {
              ...eligible[0],
              year: award.year,
            }),
        )
        .map((award) => award.year),
    );
    for (const record of eligible.slice().reverse())
      if (titleYears.has(record.year)) add(record);
    for (const record of eligible.slice().reverse())
      if (standoutSeason(record)) add(record);

    if (eligible.length >= 3) add(eligible[0]);
    for (const record of eligible.slice().reverse()) add(record);
  }

  return selected.slice(0, limit).map((record) => ({
    sourceArticleId: `player-season:${record.year}:${record.playerId}`,
    sourceKind: 'playerSeason' as const,
    asOfDate: `${record.year}-12-31`,
    text: seasonRecordText(record),
    factRefs: [seasonRef(record)],
    factValue: structuredClone(record),
  }));
}

function priorEvents(
  playerId: string,
  article: NarrativeArticle,
  index: NarrativeMemoryIndex,
): NarrativeEvent[] {
  return (index.eventsByPlayer.get(playerId) ?? []).filter(
    (event) =>
      narrativeEventArticleId(event) !== article.id && eventAsOfDate(event) < article.asOfDate,
  );
}

function arc(
  type: NarrativeStoryArcType,
  key: string,
  sourceIds: string[],
  weight: number,
  playerIds: string[] = [],
  teamKeys: TeamKey[] = [],
): NarrativeStoryArc {
  return { id: `arc:${type}:${key}`, type, sourceIds, weight, playerIds, teamKeys };
}

/**
 * StoryArcs are editorial relationships derived from canonical history. They are hints for
 * context selection, never independent facts and never simulation state.
 */
export function buildNarrativeStoryArcs(
  article: NarrativeArticle,
  source: NarrativeSource,
  index: NarrativeMemoryIndex = buildNarrativeMemoryIndex(source),
): NarrativeStoryArc[] {
  const arcs: NarrativeStoryArc[] = [];

  for (const playerId of article.playerIds.slice(0, 4)) {
    const events = priorEvents(playerId, article, index);
    const draft = events.find((event) => event.type === 'draft');
    if (draft)
      arcs.push(
        arc('career-origin', playerId, [narrativeEventArticleId(draft)], 8, [playerId], [
          draft.teamKey,
        ]),
      );

    const transaction = events
      .filter((event): event is TransactionNarrativeEvent => event.type === 'transaction')
      .at(-1);
    if (transaction)
      arcs.push(
        arc(
          'club-journey',
          playerId,
          [narrativeEventArticleId(transaction)],
          12,
          [playerId],
          transactionTeams(transaction),
        ),
      );

    const injury = events.filter((event) => event.type === 'injury').at(-1);
    const recovery = events
      .filter(
        (event) => event.type === 'career' && event.careerKind === 'returnFromInjury',
      )
      .at(-1);
    if (injury && recovery && eventAsOfDate(injury) <= eventAsOfDate(recovery))
      arcs.push(
        arc(
          'injury-recovery',
          playerId,
          [narrativeEventArticleId(injury), narrativeEventArticleId(recovery)],
          10,
          [playerId],
          [injury.teamKey],
        ),
      );

    const records = (index.seasonRecordsByPlayer.get(playerId) ?? []).filter(
      (record) => seasonRecordAvailable(article, record) && hasAppearance(record),
    );
    if (records.length >= 8)
      arcs.push(
        arc(
          'long-career',
          playerId,
          [
            `player-season:${records[0].year}:${playerId}`,
            `player-season:${records.at(-1)!.year}:${playerId}`,
          ],
          10,
          [playerId],
          [...new Set(records.map((record) => record.teamKey))],
        ),
      );

    const titleYears = source.awardHistory
      .filter((award) => award.playerId === playerId && award.year < Number(article.asOfDate.slice(0, 4)))
      .map((award) => award.year);
    if (titleYears.length)
      arcs.push(
        arc(
          'title-history',
          playerId,
          [...new Set(titleYears)].map((year) => `season-awards:${year}`),
          10,
          [playerId],
        ),
      );
  }

  for (const teamKey of article.teamKeys) {
    const prior = (index.championshipsByTeam.get(teamKey) ?? []).filter(
      (record) => record.year < article.year && record.champion === teamKey,
    );
    if (prior.length)
      arcs.push(
        arc(
          'championship-history',
          teamKey,
          prior.slice(-3).map((record) => `championship:${record.year}`),
          8,
          [],
          [teamKey],
        ),
      );
  }

  if (article.kind === 'championship') {
    const current = source.championHistory.find((record) => record.year === article.year);
    if (current?.runnerUp) {
      const pair = new Set([current.champion, current.runnerUp]);
      const repeat = source.championHistory
        .filter(
          (record) =>
            record.year < current.year &&
            record.runnerUp &&
            pair.has(record.champion) &&
            pair.has(record.runnerUp),
        )
        .at(-1);
      if (repeat)
        arcs.push(
          arc(
            'repeat-final',
            `${current.champion}:${current.runnerUp}`,
            [`championship:${repeat.year}`],
            12,
            [],
            [current.champion, current.runnerUp],
          ),
        );
    }
  }

  const deduped = new Map<string, NarrativeStoryArc>();
  for (const candidate of arcs) deduped.set(candidate.id, candidate);
  return [...deduped.values()].sort(
    (first, second) => second.weight - first.weight || first.id.localeCompare(second.id),
  );
}
