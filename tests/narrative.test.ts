import assert from 'node:assert/strict';
import test from 'node:test';

import type { AchievementEvent, GameBoxScore, SeasonTitleRecord } from '../src/engine';
import {
  NARRATIVE_GENERATOR_VERSION,
  articleFromAchievement,
  articleFromChampionship,
  articleFromFutureEvent,
  articleFromGameBoxScore,
  articleFromSeasonAwards,
  buildNarrativeFeed,
} from '../src/narrative';
import type { ChampionRecord } from '../src/state/storage';

const box: GameBoxScore = {
  gameId: '2026-04-01-giants-tigers',
  date: '2026-04-01',
  seasonYear: 2026,
  homeKey: 'giants',
  awayKey: 'tigers',
  homeScore: 4,
  awayScore: 3,
  homeHits: 9,
  awayHits: 7,
  homeErrors: 0,
  awayErrors: 1,
  innings: [
    { home: 0, away: 1 },
    { home: 0, away: 0 },
    { home: 1, away: 0 },
    { home: 0, away: 0 },
    { home: 0, away: 0 },
    { home: 1, away: 1 },
    { home: 0, away: 0 },
    { home: 0, away: 1 },
    { home: 2, away: 0 },
  ],
  extraInnings: false,
  tie: false,
  walkoff: true,
  shutoutTeam: null,
  decisions: {
    winnerId: 'p-home',
    winnerText: '勝利太郎 1勝0敗',
    loserId: 'p-away',
    loserText: '敗戦次郎 0勝1敗',
    saveId: null,
    saveText: null,
  },
  headline: null,
  hasBoxScore: true,
  batterLines: [],
  pitcherLines: [],
  notableEvents: [
    {
      type: 'walkoff',
      playerId: 'b-home',
      playerName: '劇打太郎',
      teamKey: 'giants',
      description: '劇打太郎がサヨナラ打',
    },
    {
      type: 'comeback',
      teamKey: 'giants',
      description: '巨人が終盤に逆転',
    },
  ],
};

const achievement: AchievementEvent = {
  id: 'milestone:b-home:hits:2000',
  kind: 'milestone',
  playerId: 'b-home',
  playerName: '劇打太郎',
  teamKey: 'giants',
  metricLabel: '通算安打',
  value: 2000,
  previousValue: null,
  previousHolderName: null,
  year: 2026,
  date: '2026-05-01',
};

const champion: ChampionRecord = {
  year: 2025,
  champion: 'hawks',
  runnerUp: 'giants',
  keyBatters: ['主砲一郎'],
  keyPitchers: ['エース二郎'],
  lineup: [
    { playerId: 'hawk-1', playerName: '主砲一郎', pos: '右翼手', isPitcher: false },
  ],
  teamStats: { avg: 0.252, hr: 132, sb: 71, era: 2.91, k: 1198 },
  record: { w: 82, l: 56, d: 5 },
};

const title: SeasonTitleRecord = {
  year: 2025,
  league: 'pacific',
  titleId: 'homeRuns',
  titleLabel: '本塁打王',
  playerId: 'hawk-1',
  playerName: '主砲一郎',
  teamKey: 'hawks',
  value: 42,
  displayValue: '42',
};

test('game recap is canonical, deterministic, and grounded in supplied facts', () => {
  const first = articleFromGameBoxScore(box);
  const second = articleFromGameBoxScore(structuredClone(box));
  assert.deepEqual(first, second);
  assert.equal(first.id, `game:${box.gameId}`);
  assert.equal(first.generatorVersion, NARRATIVE_GENERATOR_VERSION);
  assert.equal(first.asOfDate, box.date);
  assert.equal(first.viewMode, 'archival');
  assert.match(first.headline, /サヨナラ/);
  assert.ok(first.factRefs.some((entry) => entry.kind === 'GAME_RESULT'));
  assert.ok(first.factRefs.some((entry) => entry.kind === 'WALK_OFF'));
  assert.ok(first.factRefs.some((entry) => entry.kind === 'COMEBACK'));
  for (const segment of first.segments) {
    if (segment.class === 'FACTUAL') assert.ok(segment.factRefs.length > 0);
    if (segment.class === 'COLOR') assert.equal(segment.factRefs.length, 0);
  }
});

test('achievement, championship, and award articles keep stable ids and source scope', () => {
  const achievementArticle = articleFromAchievement(achievement);
  assert.equal(achievementArticle.id, `achievement:${achievement.id}`);
  assert.deepEqual(achievementArticle.teamKeys, ['giants']);
  assert.deepEqual(achievementArticle.playerIds, ['b-home']);

  const championshipArticle = articleFromChampionship(champion);
  assert.equal(championshipArticle.id, 'championship:2025');
  assert.ok(championshipArticle.teamKeys.includes('hawks'));
  assert.ok(championshipArticle.teamKeys.includes('giants'));
  assert.ok(championshipArticle.playerIds.includes('hawk-1'));

  const awardArticle = articleFromSeasonAwards(2025, [title]);
  assert.equal(awardArticle.id, 'season-awards:2025');
  assert.ok(awardArticle.headline.includes('2025'));
  assert.ok(awardArticle.segments.some((segment) => segment.text.includes('本塁打王')));
});

test('feed is newest-first, filterable, and paginated without changing canonical ids', () => {
  const feed = buildNarrativeFeed(
    {
      gameBoxScores: { [box.gameId]: box },
      achievementHistory: [achievement],
      championHistory: [champion],
      awardHistory: [title],
    },
    { limit: 2 },
  );
  assert.equal(feed.total, 4);
  assert.equal(feed.articles.length, 2);
  assert.equal(feed.articles[0]?.id, `achievement:${achievement.id}`);
  assert.equal(feed.articles[1]?.id, `game:${box.gameId}`);

  const teamFeed = buildNarrativeFeed(
    {
      gameBoxScores: { [box.gameId]: box },
      achievementHistory: [achievement],
      championHistory: [champion],
      awardHistory: [title],
    },
    { teamKey: 'hawks', limit: 20 },
  );
  assert.equal(teamFeed.total, 2);
  assert.ok(teamFeed.articles.every((article) => article.teamKeys.includes('hawks')));

  const gameOnly = buildNarrativeFeed(
    {
      gameBoxScores: { [box.gameId]: box },
      achievementHistory: [achievement],
      championHistory: [champion],
      awardHistory: [title],
    },
    { kinds: ['gameRecap'], limit: 20 },
  );
  assert.deepEqual(gameOnly.articles.map((article) => article.id), [`game:${box.gameId}`]);
});

test('future subsystem events enter the same article pipeline without inferred facts', () => {
  const transaction = articleFromFutureEvent({
    type: 'transaction',
    id: 'trade-1',
    year: 2026,
    date: '2026-07-10',
    transactionKind: 'trade',
    playerId: 'player-1',
    playerName: '移籍太郎',
    fromTeamKey: 'giants',
    toTeamKey: 'hawks',
    terms: '交換要員は契約済みの2選手。',
  });
  assert.equal(transaction.id, 'transaction:trade-1');
  assert.equal(transaction.kind, 'transaction');
  assert.ok(transaction.segments.some((segment) => segment.text.includes('巨人')));
  assert.ok(transaction.segments.some((segment) => segment.text.includes('ソフトバンク')));
  assert.ok(transaction.segments.some((segment) => segment.text === '交換要員は契約済みの2選手。'));

  const draft = articleFromFutureEvent({
    type: 'draft',
    id: 'draft-1',
    year: 2026,
    date: '2026-10-22',
    teamKey: 'tigers',
    playerId: 'rookie-1',
    playerName: '新人一郎',
    round: 1,
    overallPick: 3,
    origin: '大卒',
  });
  assert.equal(draft.kind, 'draft');
  assert.ok(draft.segments[0]?.text.includes('全体3番目'));
  assert.ok(draft.segments[0]?.text.includes('大卒'));

  const review = articleFromFutureEvent({
    type: 'seasonReview',
    id: 'review-giants-2026',
    year: 2026,
    date: '2026-11-30',
    teamKey: 'giants',
    rank: 2,
    wins: 76,
    losses: 62,
    draws: 5,
    champion: false,
  });
  assert.equal(review.kind, 'seasonReview');
  assert.ok(review.segments.some((segment) => segment.class === 'COLOR'));
  assert.ok(review.segments.some((segment) => segment.text.includes('76勝62敗5分')));
});
