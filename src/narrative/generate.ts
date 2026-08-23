import { TINFO } from '../data';
import type { AchievementEvent, GameBoxScore, SeasonTitleRecord, TeamKey } from '../engine';
import type { ChampionRecord } from '../state/storage';
import {
  NARRATIVE_GENERATOR_VERSION,
  type CareerNarrativeEvent,
  type DevelopmentNarrativeEvent,
  type DraftNarrativeEvent,
  type FutureNarrativeEvent,
  type InjuryNarrativeEvent,
  type NarrativeArticle,
  type NarrativeArticleKind,
  type NarrativeFactKind,
  type NarrativeFactRef,
  type NarrativeFeedFilter,
  type NarrativeSegment,
  type SeasonReviewNarrativeEvent,
  type TransactionNarrativeEvent,
} from './types';

export interface NarrativeSource {
  gameBoxScores: Record<string, GameBoxScore>;
  achievementHistory: AchievementEvent[];
  championHistory: ChampionRecord[];
  awardHistory: SeasonTitleRecord[];
}

export interface NarrativeFeedResult {
  articles: NarrativeArticle[];
  total: number;
}

interface ArticleCandidate {
  id: string;
  kind: NarrativeArticleKind;
  year: number;
  asOfDate: string;
  teamKeys: TeamKey[];
  playerIds: string[];
  create(): NarrativeArticle;
}

const ref = (kind: NarrativeFactKind, key: string): NarrativeFactRef => ({ kind, key });

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function uniqueRefs(refs: NarrativeFactRef[]): NarrativeFactRef[] {
  const seen = new Set<string>();
  return refs.filter((candidate) => {
    const key = `${candidate.kind}:${candidate.key}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeAsOfDate(date: string, year: number): string {
  return /^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 10) : `${year}-12-31`;
}

function factual(text: string, factRefs: NarrativeFactRef[]): NarrativeSegment {
  return { class: 'FACTUAL', text, factRefs: uniqueRefs(factRefs) };
}

function color(text: string): NarrativeSegment {
  return { class: 'COLOR', text, factRefs: [] };
}

function makeArticle(input: Omit<NarrativeArticle, 'generatorVersion' | 'factRefs'>): NarrativeArticle {
  return {
    ...input,
    generatorVersion: NARRATIVE_GENERATOR_VERSION,
    factRefs: uniqueRefs(input.segments.flatMap((segment) => segment.factRefs)),
  };
}

function scoreText(box: GameBoxScore): string {
  return `${box.awayScore}-${box.homeScore}`;
}

function gameHeadline(box: GameBoxScore): string {
  if (box.headline) return box.headline;
  const home = TINFO[box.homeKey];
  const away = TINFO[box.awayKey];
  if (box.tie) return `${away.ab}と${home.ab}、${scoreText(box)}で引き分け`;
  const homeWon = box.homeScore > box.awayScore;
  const winner = homeWon ? home : away;
  const loser = homeWon ? away : home;
  if (box.walkoff && homeWon) return `${winner.ab}、${loser.ab}にサヨナラ勝ち`;
  if (box.shutoutTeam) return `${winner.ab}、${loser.ab}を零封`;
  return `${winner.ab}が${loser.ab}を${Math.max(box.homeScore, box.awayScore)}-${Math.min(
    box.homeScore,
    box.awayScore,
  )}で下す`;
}

/** Exposes the exact factual ledger classes that a game recap may cite. */
export function gameFactRefs(box: GameBoxScore): NarrativeFactRef[] {
  const refs = [ref('GAME_RESULT', box.gameId)];
  if (box.innings.length) refs.push(ref('SCORE_TIMELINE', box.gameId));
  if (box.walkoff) refs.push(ref('WALK_OFF', box.gameId));
  if (box.notableEvents.some((event) => event.type === 'comeback')) {
    refs.push(ref('COMEBACK', box.gameId));
  }
  if (box.notableEvents.some((event) => event.playerId)) {
    refs.push(ref('PLAYER_GAME_LINE', box.gameId));
  }
  if (box.decisions.winnerId || box.decisions.loserId || box.decisions.saveId) {
    refs.push(ref('PITCHING_DECISION', box.gameId));
  }
  return refs;
}

export function articleFromGameBoxScore(box: GameBoxScore): NarrativeArticle {
  const home = TINFO[box.homeKey];
  const away = TINFO[box.awayKey];
  const resultRef = ref('GAME_RESULT', box.gameId);
  const segments: NarrativeSegment[] = [];

  if (box.tie) {
    segments.push(
      factual(
        `${away.n}と${home.n}は${box.awayScore}-${box.homeScore}で引き分けた。`,
        [resultRef],
      ),
    );
  } else {
    const homeWon = box.homeScore > box.awayScore;
    const winner = homeWon ? home : away;
    const loser = homeWon ? away : home;
    const winningScore = homeWon ? box.homeScore : box.awayScore;
    const losingScore = homeWon ? box.awayScore : box.homeScore;
    segments.push(
      factual(`${winner.n}が${loser.n}に${winningScore}-${losingScore}で勝利した。`, [resultRef]),
    );
  }

  segments.push(
    factual(
      `安打は${away.ab}${box.awayHits}、${home.ab}${box.homeHits}。失策は${away.ab}${box.awayErrors}、${home.ab}${box.homeErrors}だった。`,
      [resultRef],
    ),
  );

  const decisions = [
    box.decisions.winnerText ? `勝 ${box.decisions.winnerText}` : null,
    box.decisions.loserText ? `敗 ${box.decisions.loserText}` : null,
    box.decisions.saveText ? `S ${box.decisions.saveText}` : null,
  ].filter((entry): entry is string => Boolean(entry));
  if (decisions.length) {
    segments.push(factual(decisions.join(' / '), [ref('PITCHING_DECISION', box.gameId)]));
  }

  const notable = box.notableEvents.slice(0, 4);
  if (notable.length) {
    segments.push(
      factual(
        notable.map((event) => event.description).join('。') + '。',
        notable.flatMap((event) => {
          if (event.type === 'walkoff' || event.type === 'walkoffHr') return [ref('WALK_OFF', box.gameId)];
          if (event.type === 'comeback') return [ref('COMEBACK', box.gameId)];
          return [ref('PLAYER_GAME_LINE', box.gameId)];
        }),
      ),
    );
  }

  return makeArticle({
    id: `game:${box.gameId}`,
    kind: 'gameRecap',
    year: box.seasonYear,
    publishedAt: box.date,
    asOfDate: normalizeAsOfDate(box.date, box.seasonYear),
    viewMode: 'archival',
    headline: gameHeadline(box),
    dek: `${away.ab} ${box.awayScore} - ${box.homeScore} ${home.ab}`,
    teamKeys: [box.awayKey, box.homeKey],
    playerIds: unique([
      ...box.batterLines.map((line) => line.playerId),
      ...box.pitcherLines.map((line) => line.playerId),
    ]),
    segments,
  });
}

function achievementLabel(kind: AchievementEvent['kind']): string {
  if (kind === 'milestone') return 'メモリアル';
  if (kind === 'seasonRecord') return 'シーズン新記録';
  return '球団史新記録';
}

export function articleFromAchievement(event: AchievementEvent): NarrativeArticle {
  const info = TINFO[event.teamKey];
  const eventRef = ref('ACHIEVEMENT', event.id);
  const segments = [
    factual(
      `${info.n}の${event.playerName}が${event.metricLabel}${event.value}を記録した。`,
      [eventRef],
    ),
  ];
  if (event.previousHolderName && event.previousValue != null) {
    segments.push(
      factual(
        `従来の記録は${event.previousHolderName}の${event.previousValue}だった。`,
        [eventRef],
      ),
    );
  }

  return makeArticle({
    id: `achievement:${event.id}`,
    kind: 'achievement',
    year: event.year,
    publishedAt: event.date,
    asOfDate: normalizeAsOfDate(event.date, event.year),
    viewMode: 'archival',
    headline: `【${achievementLabel(event.kind)}】${event.playerName}、${event.metricLabel}${event.value}`,
    teamKeys: [event.teamKey],
    playerIds: [event.playerId],
    segments,
  });
}

export function articleFromChampionship(record: ChampionRecord): NarrativeArticle {
  const champion = TINFO[record.champion];
  const championshipRef = ref('CHAMPIONSHIP', String(record.year));
  const segments: NarrativeSegment[] = [
    factual(`${champion.n}が${record.year}年の日本一に輝いた。`, [championshipRef]),
  ];
  if (record.runnerUp) {
    segments.push(
      factual(`日本シリーズの相手は${TINFO[record.runnerUp].n}だった。`, [championshipRef]),
    );
  }
  if (record.record) {
    segments.push(
      factual(
        `レギュラーシーズンは${record.record.w}勝${record.record.l}敗${record.record.d}分。`,
        [ref('SEASON_STANDING', `${record.year}:${record.champion}`)],
      ),
    );
  }
  if (record.teamStats) {
    segments.push(
      factual(
        `チーム成績は打率${record.teamStats.avg.toFixed(3).replace(/^0/, '')}、${record.teamStats.hr}本塁打、${record.teamStats.sb}盗塁、防御率${record.teamStats.era.toFixed(2)}、${record.teamStats.k}奪三振。`,
        [championshipRef],
      ),
    );
  }
  const keyPlayers = [...(record.keyBatters ?? []), ...(record.keyPitchers ?? [])];
  if (keyPlayers.length) {
    segments.push(factual(`主力には${keyPlayers.join('、')}が名を連ねた。`, [championshipRef]));
  }
  segments.push(color('そのシーズンの頂点に立ったチームとして、記録に刻まれる。'));

  return makeArticle({
    id: `championship:${record.year}`,
    kind: 'championship',
    year: record.year,
    publishedAt: `${record.year}年 日本シリーズ終了`,
    asOfDate: `${record.year}-12-31`,
    viewMode: 'archival',
    headline: `${champion.n}、${record.year}年日本一`,
    teamKeys: unique([record.champion, ...(record.runnerUp ? [record.runnerUp] : [])]),
    playerIds: unique((record.lineup ?? []).map((entry) => entry.playerId)),
    segments,
  });
}

export function articleFromSeasonAwards(year: number, records: SeasonTitleRecord[]): NarrativeArticle {
  const sorted = records
    .slice()
    .sort((first, second) =>
      `${first.league}:${first.titleLabel}:${first.playerName}`.localeCompare(
        `${second.league}:${second.titleLabel}:${second.playerName}`,
        'ja',
      ),
    );
  const refs = sorted.map((record) =>
    ref('SEASON_TITLE', `${record.year}:${record.league}:${record.titleId}:${record.playerId}`),
  );
  const leagueText = (league: SeasonTitleRecord['league'], label: string): NarrativeSegment | null => {
    const rows = sorted.filter((record) => record.league === league);
    if (!rows.length) return null;
    return factual(
      `${label}：${rows
        .map((record) => `${record.titleLabel} ${record.playerName}（${TINFO[record.teamKey].ab}、${record.displayValue}）`)
        .join(' / ')}`,
      rows.map((record) =>
        ref('SEASON_TITLE', `${record.year}:${record.league}:${record.titleId}:${record.playerId}`),
      ),
    );
  };
  const segments = [leagueText('central', 'セ・リーグ'), leagueText('pacific', 'パ・リーグ')].filter(
    (segment): segment is NarrativeSegment => segment !== null,
  );

  return makeArticle({
    id: `season-awards:${year}`,
    kind: 'seasonAwards',
    year,
    publishedAt: `${year}年 個人タイトル確定`,
    asOfDate: `${year}-12-31`,
    viewMode: 'archival',
    headline: `${year}年 個人タイトルが確定`,
    teamKeys: unique(sorted.map((record) => record.teamKey)),
    playerIds: unique(sorted.map((record) => record.playerId)),
    segments: segments.length ? segments : [factual('個人タイトルの記録が確定した。', refs)],
  });
}

function articleFromTransaction(event: TransactionNarrativeEvent): NarrativeArticle {
  const from = event.fromTeamKey ? TINFO[event.fromTeamKey].n : null;
  const to = event.toTeamKey ? TINFO[event.toTeamKey].n : null;
  let headline = `${event.playerName}の去就が決定`;
  let sentence = `${event.playerName}の所属に動きがあった。`;
  if (event.transactionKind === 'trade' && from && to) {
    headline = `${event.playerName}、${from}から${to}へトレード`;
    sentence = `${event.playerName}が${from}から${to}へトレードで移籍した。`;
  } else if (event.transactionKind === 'faSigning' && to) {
    headline = `${to}、FAで${event.playerName}を獲得`;
    sentence = `${event.playerName}がFAで${to}へ加入した。`;
  } else if (event.transactionKind === 'foreignSigning' && to) {
    headline = `${to}、${event.playerName}を新外国人として獲得`;
    sentence = `${event.playerName}が新外国人選手として${to}へ加入した。`;
  } else if (event.transactionKind === 'release' && from) {
    headline = `${from}、${event.playerName}の退団を発表`;
    sentence = `${event.playerName}が${from}を退団した。`;
  } else if (event.transactionKind === 'retirement') {
    headline = `${event.playerName}が現役引退`;
    sentence = `${event.playerName}が現役を引退した。`;
  }
  const eventRef = ref('TRANSACTION', event.id);
  const segments = [factual(sentence, [eventRef])];
  if (event.terms) segments.push(factual(event.terms, [eventRef]));
  return makeArticle({
    id: `transaction:${event.id}`,
    kind: 'transaction',
    year: event.year,
    publishedAt: event.date,
    asOfDate: normalizeAsOfDate(event.date, event.year),
    viewMode: 'archival',
    headline,
    teamKeys: unique(
      [event.fromTeamKey, event.toTeamKey].filter((key): key is TeamKey => Boolean(key)),
    ),
    playerIds: [event.playerId],
    segments,
  });
}

function articleFromDraft(event: DraftNarrativeEvent): NarrativeArticle {
  const team = TINFO[event.teamKey];
  const pick = event.overallPick != null ? `（全体${event.overallPick}番目）` : '';
  const origin = event.origin ? `、${event.origin}` : '';
  const eventRef = ref('DRAFT_SELECTION', event.id);
  return makeArticle({
    id: `draft:${event.id}`,
    kind: 'draft',
    year: event.year,
    publishedAt: event.date,
    asOfDate: normalizeAsOfDate(event.date, event.year),
    viewMode: 'archival',
    headline: `${team.n}、ドラフト${event.round}巡目で${event.playerName}を指名`,
    teamKeys: [event.teamKey],
    playerIds: [event.playerId],
    segments: [
      factual(
        `${team.n}はドラフト${event.round}巡目${pick}で${event.playerName}${origin}を指名した。`,
        [eventRef],
      ),
    ],
  });
}

function articleFromCareer(event: CareerNarrativeEvent): NarrativeArticle {
  const eventRef = ref('CAREER_EVENT', event.id);
  const label: Record<CareerNarrativeEvent['careerKind'], string> = {
    debut: 'デビュー',
    roleChange: '役割変更',
    returnFromInjury: '復帰',
    breakthrough: '転機',
    retirement: '引退',
  };
  return makeArticle({
    id: `career:${event.id}`,
    kind: 'career',
    year: event.year,
    publishedAt: event.date,
    asOfDate: normalizeAsOfDate(event.date, event.year),
    viewMode: 'archival',
    headline: `${event.playerName} ― ${label[event.careerKind]}`,
    teamKeys: [event.teamKey],
    playerIds: [event.playerId],
    segments: [factual(event.detail, [eventRef])],
  });
}

function articleFromSeasonReview(event: SeasonReviewNarrativeEvent): NarrativeArticle {
  const team = TINFO[event.teamKey];
  const standingRef = ref('SEASON_STANDING', `${event.year}:${event.teamKey}`);
  const segments: NarrativeSegment[] = [
    factual(
      `${team.n}は${event.year}年を${event.rank}位、${event.wins}勝${event.losses}敗${event.draws}分で終えた。`,
      [standingRef],
    ),
  ];
  if (event.champion) {
    segments.push(factual('日本シリーズを制し、日本一となった。', [ref('CHAMPIONSHIP', String(event.year))]));
  }
  if (event.titleHolders?.length) {
    segments.push(
      factual(
        `個人タイトル：${event.titleHolders
          .map((entry) => `${entry.titleLabel} ${entry.playerName}`)
          .join('、')}。`,
        event.titleHolders.map((entry) =>
          ref('SEASON_TITLE', `${event.year}:${entry.titleLabel}:${entry.playerId}`),
        ),
      ),
    );
  }
  segments.push(color('ひとつのシーズンが、球団史の一頁になった。'));
  return makeArticle({
    id: `season-review:${event.id}`,
    kind: 'seasonReview',
    year: event.year,
    publishedAt: event.date,
    asOfDate: normalizeAsOfDate(event.date, event.year),
    viewMode: 'archival',
    headline: `${team.n} ${event.year}年シーズン総括`,
    teamKeys: [event.teamKey],
    playerIds: unique(event.titleHolders?.map((entry) => entry.playerId) ?? []),
    segments,
  });
}

function articleFromInjury(event: InjuryNarrativeEvent): NarrativeArticle {
  const severityLabel = { light: '軽傷', mid: '中程度', heavy: '重傷' }[event.severity];
  const eventRef = ref('INJURY', event.id);
  return makeArticle({
    id: `injury:${event.id}`,
    kind: 'injury',
    year: event.year,
    publishedAt: event.date,
    asOfDate: normalizeAsOfDate(event.date, event.year),
    viewMode: 'archival',
    headline: `${event.playerName}が離脱、${severityLabel}`,
    teamKeys: [event.teamKey],
    playerIds: [event.playerId],
    segments: [factual(`${event.playerName}は${severityLabel}で、離脱見込みは${event.days}日。`, [eventRef])],
  });
}

function articleFromDevelopment(event: DevelopmentNarrativeEvent): NarrativeArticle {
  const eventRef = ref('DEVELOPMENT', event.id);
  return makeArticle({
    id: `development:${event.id}`,
    kind: 'development',
    year: event.year,
    publishedAt: event.date,
    asOfDate: normalizeAsOfDate(event.date, event.year),
    viewMode: 'archival',
    headline: `${event.playerName}に成長の兆し`,
    teamKeys: [event.teamKey],
    playerIds: [event.playerId],
    segments: [factual(event.detail, [eventRef])],
  });
}

export function articleFromFutureEvent(event: FutureNarrativeEvent): NarrativeArticle {
  switch (event.type) {
    case 'transaction':
      return articleFromTransaction(event);
    case 'draft':
      return articleFromDraft(event);
    case 'career':
      return articleFromCareer(event);
    case 'seasonReview':
      return articleFromSeasonReview(event);
    case 'injury':
      return articleFromInjury(event);
    case 'development':
      return articleFromDevelopment(event);
  }
}

function gameCandidate(box: GameBoxScore): ArticleCandidate {
  return {
    id: `game:${box.gameId}`,
    kind: 'gameRecap',
    year: box.seasonYear,
    asOfDate: normalizeAsOfDate(box.date, box.seasonYear),
    teamKeys: [box.awayKey, box.homeKey],
    playerIds: unique([
      ...box.batterLines.map((line) => line.playerId),
      ...box.pitcherLines.map((line) => line.playerId),
    ]),
    create: () => articleFromGameBoxScore(box),
  };
}

function achievementCandidate(event: AchievementEvent): ArticleCandidate {
  return {
    id: `achievement:${event.id}`,
    kind: 'achievement',
    year: event.year,
    asOfDate: normalizeAsOfDate(event.date, event.year),
    teamKeys: [event.teamKey],
    playerIds: [event.playerId],
    create: () => articleFromAchievement(event),
  };
}

function championshipCandidate(record: ChampionRecord): ArticleCandidate {
  return {
    id: `championship:${record.year}`,
    kind: 'championship',
    year: record.year,
    asOfDate: `${record.year}-12-31`,
    teamKeys: unique([record.champion, ...(record.runnerUp ? [record.runnerUp] : [])]),
    playerIds: unique((record.lineup ?? []).map((entry) => entry.playerId)),
    create: () => articleFromChampionship(record),
  };
}

function awardCandidates(records: SeasonTitleRecord[]): ArticleCandidate[] {
  const byYear = new Map<number, SeasonTitleRecord[]>();
  for (const record of records) {
    const existing = byYear.get(record.year) ?? [];
    existing.push(record);
    byYear.set(record.year, existing);
  }
  return [...byYear.entries()].map(([year, yearRecords]) => ({
    id: `season-awards:${year}`,
    kind: 'seasonAwards' as const,
    year,
    asOfDate: `${year}-12-31`,
    teamKeys: unique(yearRecords.map((record) => record.teamKey)),
    playerIds: unique(yearRecords.map((record) => record.playerId)),
    create: () => articleFromSeasonAwards(year, yearRecords),
  }));
}

function candidateMatches(candidate: ArticleCandidate, filter: NarrativeFeedFilter): boolean {
  if (filter.kinds?.length && !filter.kinds.includes(candidate.kind)) return false;
  if (filter.teamKey && !candidate.teamKeys.includes(filter.teamKey)) return false;
  if (filter.playerId && !candidate.playerIds.includes(filter.playerId)) return false;
  if (filter.year != null && candidate.year !== filter.year) return false;
  return true;
}

/**
 * Build only the visible page of articles. Long careers can contain tens of thousands
 * of game boxes; filtering/sorting lightweight candidates avoids rendering article text
 * for the entire archive on every UI update.
 */
export function buildNarrativeFeed(
  source: NarrativeSource,
  filter: NarrativeFeedFilter = {},
): NarrativeFeedResult {
  const candidates: ArticleCandidate[] = [
    ...Object.values(source.gameBoxScores).map(gameCandidate),
    ...source.achievementHistory.map(achievementCandidate),
    ...source.championHistory.map(championshipCandidate),
    ...awardCandidates(source.awardHistory),
  ]
    .filter((candidate) => candidateMatches(candidate, filter))
    .sort((first, second) => {
      const dateOrder = second.asOfDate.localeCompare(first.asOfDate);
      return dateOrder || second.id.localeCompare(first.id);
    });
  const offset = Math.max(0, filter.offset ?? 0);
  const limit = Math.max(1, filter.limit ?? 100);
  return {
    total: candidates.length,
    articles: candidates.slice(offset, offset + limit).map((candidate) => candidate.create()),
  };
}
