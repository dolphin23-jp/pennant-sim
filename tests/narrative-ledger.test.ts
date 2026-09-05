import { retirePlayers } from '../src/engine/offseason';
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  configureRandom,
  initTeams,
  resetRandom,
  random,
  generateSchedule,
  simulateGame,
  skipGames,
  simCpuUntilNext,
  applyDraftPicks,
  runCpuDraft,
  genFreeAgentMarket,
  genForeignMarket,
  signPlayerToTeam,
  cpuAutoSignMarketRounds,
  cpuAutoTradeBetweenTeams,
  growthPhase,
  prepareCpuRostersForDraft,
  reviewForeignPlayers,
  calcStandings,
} from '../src/engine';
import {
  narrativeEventsFromPostGame,
  seasonReviewEvents,
} from '../src/engine/narrativeEvents';
import { applyPostGamePlayerEvents } from '../src/engine/playerEvents';
import { applyTrade, type TradeOffer } from '../src/state/offseason';
import { createEmptyRotations } from '../src/state/storage';
import {
  appendNarrativeEvents,
  migrateNarrativeEvents,
  articleFromFutureEvent,
  buildNarrativeFeed,
  type NarrativeEvent,
  type NarrativeEventContext,
} from '../src/narrative';

function seeded(seed = 73) {
  let value = seed;
  configureRandom(
    () => {
      value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
      return value / 2 ** 32;
    },
    () => 1700000000000,
  );
}
function collector(year = 2034) {
  const events: NarrativeEvent[] = [];
  const context: NarrativeEventContext = {
    year,
    date: `${year}年オフ`,
    emit: (e) => events.push(e),
  };
  return { events, context };
}
const emptySource = {
  gameBoxScores: {},
  achievementHistory: [],
  championHistory: [],
  awardHistory: [],
};

test('one multi-player trade owns one article, all participants, immutable snapshots and idempotent replay', () => {
  seeded();
  try {
    const teams = initTeams();
    const offer: TradeOffer = {
      id: 'offer-stable-1',
      fromTeam: 'tigers',
      give: [teams.tigers.pitchers[0], teams.tigers.fielders[0]],
      receive: [teams.giants.fielders[0]],
      cash: 300,
      summary: 'unused prose',
    };
    const { events, context } = collector();
    const next = applyTrade(teams, 'giants', offer, context);
    assert.equal(events.length, 1);
    assert.equal(applyTrade(next, 'giants', offer, context), next);
    assert.equal(events.length, 1);
    const ledger = appendNarrativeEvents({}, events);
    const article = articleFromFutureEvent(ledger['2034'][0]);
    assert.equal(article.id, 'transaction:trade:2034:offer-stable-1');
    assert.equal(article.playerIds.length, 3);
    assert.deepEqual(new Set(article.teamKeys), new Set(['tigers', 'giants']));
    assert.equal(appendNarrativeEvents(ledger, events), ledger);
    offer.give[0].name = 'future name';
    next.giants.pitchers.at(-1)!.tk = 'hawks';
    assert.deepEqual(articleFromFutureEvent(ledger['2034'][0]), article);
    for (const playerId of article.playerIds)
      assert.equal(
        buildNarrativeFeed({ ...emptySource, narrativeEvents: ledger }, { playerId }).articles[0]
          .id,
        article.id,
      );
    assert.throws(
      () => appendNarrativeEvents(ledger, [{ ...events[0], date: '2034-12-30' }]),
      /Conflicting/,
    );
  } finally {
    resetRandom();
  }
});

test('confirmed draft picks emit once; preview applications emit nothing and duplicates cannot sign twice', () => {
  seeded();
  try {
    const teams = initTeams();
    const { events, context } = collector();
    const draft = runCpuDraft(teams, 6, context);
    assert.equal(events.length, 72);
    assert.equal(new Set(events.map((e) => e.id)).size, 72);
    assert.ok(
      events.every(
        (e) =>
          e.type === 'draft' &&
          e.id === `draft:2034:${e.teamKey}:${e.round}:${e.playerId}` &&
          !e.overallPick,
      ),
    );
    assert.deepEqual(applyDraftPicks(draft.teams, draft.picks, context), draft.teams);
    assert.equal(events.length, 72);
    const preview = applyDraftPicks(teams, draft.picks);
    assert.deepEqual(preview, draft.teams);
    assert.equal(events.length, 72);
  } finally {
    resetRandom();
  }
});

test('user/CPU market signings, refused signings and exits report only the operation committed', () => {
  seeded();
  try {
    let teams = initTeams();
    const { events, context } = collector();
    const fa = genFreeAgentMarket();
    teams = signPlayerToTeam(teams, 'giants', fa[0], context);
    assert.equal(events.length, 1);
    assert.equal(signPlayerToTeam(teams, 'giants', fa[0], context), teams);
    assert.equal(events.length, 1);
    const cpu = cpuAutoSignMarketRounds(teams, fa.slice(1), 'fa', 4, 'giants', context);
    teams = cpu.teams;
    assert.equal(events.length, fa.length - cpu.remaining.length);
    assert.ok(
      events.every(
        (e) => e.type === 'transaction' && e.transactionKind === 'faSigning' && !e.fromTeamKey,
      ),
    );
    const foreign = genForeignMarket(2035);
    teams = signPlayerToTeam(teams, 'giants', foreign[0], context);
    assert.ok(
      events.some((e) => e.type === 'transaction' && e.transactionKind === 'foreignSigning'),
    );
    const before = events.length;
    const retirement = retirePlayers(teams, 'giants', [fa[0].id], context);
    assert.equal(events.length, before + 1);
    retirePlayers(retirement.teams, 'giants', [fa[0].id], context);
    assert.equal(events.length, before + 1);
    teams.tigers.fielders[0].age = 45;
    prepareCpuRostersForDraft(teams, {}, context);
    assert.ok(
      events.some((e) => e.type === 'transaction' && e.exitReason === 'mandatoryRetirement'),
    );
    assert.ok(events.some((e) => e.type === 'transaction' && e.transactionKind === 'release'));
    const veteran =
      teams.giants.fielders.find((p) => p.id === foreign[0].id) ??
      teams.giants.pitchers.find((p) => p.id === foreign[0].id)!;
    veteran.age = 40;
    veteran.foreignProfile!.contractYearsRemaining = 1;
    reviewForeignPlayers(teams, {}, 2034, context);
    assert.ok(events.some((e) => e.type === 'transaction' && e.exitReason === 'foreignRelease'));
    assert.ok(Object.keys(migrateNarrativeEvents(appendNarrativeEvents({}, events))).length);
  } finally {
    resetRandom();
  }
});

test('growth and CPU trade observation consumes no random draws and changes no simulation result', () => {
  seeded();
  const original = initTeams();
  // Complementary positional shortages make at least one mutually beneficial CPU trade.
  Object.values(original).forEach((team, index) =>
    team.fielders.forEach((player) => {
      player.pos = index % 2 ? '一塁手' : '左翼手';
      player.positions = [{ pos: player.pos, apt: 100 }];
    }),
  );
  try {
    const run = (record: boolean) => {
      seeded(119);
      const { events, context } = collector();
      const grown = growthPhase(structuredClone(original), record ? context : undefined);
      const teams = cpuAutoTradeBetweenTeams(
        grown.teams,
        'giants',
        12,
        record ? context : undefined,
      );
      return { teams, events, nextRandom: random() };
    };
    const plain = run(false),
      recorded = run(true);
    assert.deepEqual(recorded.teams, plain.teams);
    assert.equal(recorded.nextRandom, plain.nextRandom);
    assert.ok(
      recorded.events.some((e) => e.type === 'development' && e.developmentKind === 'growth'),
    );
    assert.ok(
      recorded.events.some((e) => e.type === 'transaction' && e.transactionKind === 'trade'),
    );
    assert.ok(recorded.events.every((e) => !('detail' in e) && !('terms' in e)));
    appendNarrativeEvents({}, recorded.events);
  } finally {
    resetRandom();
  }
});

test('CPU-only and skipped games retain injuries, awakenings and eligibility recovery independently of box retention', () => {
  seeded();
  try {
    const teams = initTeams();
    const injured = teams.tigers.fielders[0];
    injured.injuryDays = 1;
    injured.injurySeverity = 'light';
    const recovered = applyPostGamePlayerEvents(teams.tigers, new Set());
    const facts = narrativeEventsFromPostGame('recovery', '2034-04-01', recovered.events);
    assert.ok(facts.some((e) => e.type === 'career' && e.playerId === injured.id));
    assert.ok(
      articleFromFutureEvent(facts.find((e) => e.type === 'career')!).segments[0].text.includes(
        '出場可能',
      ),
    );
    const game = simulateGame('giants', 'tigers', teams);
    const first = narrativeEventsFromPostGame('game-a', '2034-04-02', game.postGameEvents);
    assert.equal(
      first.length,
      game.postGameEvents.injuries.length +
        game.postGameEvents.awakenings.length +
        (game.postGameEvents.recoveries?.length ?? 0),
    );
    const schedule = generateSchedule(2034, { rainoutRate: 0, maxRainouts: 0 });
    const skipped = skipGames(schedule, teams, createEmptyRotations(), 'giants', 'month');
    assert.ok(skipped.narrativeEvents.some((e) => 'teamKey' in e && e.teamKey !== 'giants'));
    assert.ok(skipped.narrativeEvents.some((e) => e.type === 'injury'));
    const cpuSchedule = schedule
      .filter((g) => g.homeKey !== 'giants' && g.awayKey !== 'giants')
      .slice(0, 20);
    const cpu = simCpuUntilNext(cpuSchedule, teams, createEmptyRotations(), 'giants');
    assert.ok(cpu.narrativeEvents.length);
    appendNarrativeEvents({}, [...first, ...skipped.narrativeEvents]);
  } finally {
    resetRandom();
  }
});

test('feed preserves canonical ids, paging, all event categories and point-in-time filters', () => {
  const events: NarrativeEvent[] = [
    {
      type: 'injury',
      id: 'injury:2034:g:p',
      year: 2034,
      date: '2034-05-01',
      teamKey: 'giants',
      playerId: 'p',
      playerName: '当時の名前',
      days: 8,
      severity: 'light',
    },
    {
      type: 'career',
      id: 'career:2034:g2:p:recovery',
      year: 2034,
      date: '2034-05-09',
      teamKey: 'giants',
      playerId: 'p',
      playerName: '当時の名前',
      careerKind: 'returnFromInjury',
      injuryDaysBefore: 1,
    },
    ...seasonReviewEvents(2034, calcStandings([]), 'tigers'),
  ];
  const ledger = appendNarrativeEvents({}, events);
  const source = { ...emptySource, narrativeEvents: ledger };
  const past = buildNarrativeFeed(source, { asOfDate: '2034-05-01' });
  assert.deepEqual(
    past.articles.map((a) => a.id),
    [events[0].id],
  );
  assert.equal(buildNarrativeFeed(source, { kinds: ['seasonReview'] }).total, 12);
  assert.equal(buildNarrativeFeed(source, { limit: 2, offset: 2 }).articles.length, 2);
  const repeated = buildNarrativeFeed({
    ...source,
    narrativeEvents: { '2034': [...events, ...events] },
  });
  assert.equal(repeated.total, events.length);
  for (const article of repeated.articles)
    for (const segment of article.segments) {
      if (segment.class === 'COLOR') assert.equal(segment.factRefs.length, 0);
      else {
        assert.ok(segment.factRefs.length);
        assert.ok(segment.factRefs.every((ref) => events.some((e) => e.id === ref.key)));
      }
    }
});
