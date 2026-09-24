import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bestLineup,
  calcStandings,
  configureRandom,
  generateSchedule,
  initTeams,
  resetRandom,
} from '../src/engine';
import { advanceOneYear, initialState } from '../src/state/runtime';
import { availableReviewYears, buildYearReview } from '../src/state/yearReview';

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

test('a year advanced automatically reads back as one complete review', () => {
  configureRandom(mulberry32(20260927), () => Date.UTC(2026, 0, 1));
  try {
    const teams = initTeams();
    const schedule = generateSchedule(2026, { rainoutRate: 0, maxRainouts: 0 });
    const state = advanceOneYear({
      ...initialState,
      worldId: 'year-review-test',
      loading: false,
      screen: 'season',
      teams,
      playerTeam: 'giants',
      viewTeam: 'giants',
      lineup: bestLineup(teams.giants),
      season: { year: 2026, schedule },
      standings: calcStandings(schedule),
    });
    const review = buildYearReview(state, 2026);

    for (const league of ['central', 'pacific'] as const) {
      assert.deepEqual(
        review.standings[league].map((row) => row.rank),
        [1, 2, 3, 4, 5, 6],
      );
    }
    assert.equal(review.champion?.champion, state.championHistory[0]?.champion);
    assert.ok(
      review.standings.central.concat(review.standings.pacific).filter((row) => row.champion)
        .length === 1,
    );
    assert.ok(review.titles.central.length > 0 && review.titles.pacific.length > 0);
    assert.equal(review.firstRoundPicks.length, 12);
    assert.ok(review.leaders.some((section) => section.label === '本塁打'));

    const retirements = (state.narrativeEvents['2026'] ?? []).filter(
      (event) => event.type === 'transaction' && event.transactionKind === 'retirement',
    );
    assert.equal(review.retirements.length, Math.min(15, retirements.length));
    assert.ok(
      review.retirements.every((row) => row.career !== null),
      'careers are archived',
    );

    // 2027 is in progress, so the newest reviewable year is the one just completed.
    const years = availableReviewYears(state, state.season.year - 1);
    assert.equal(years[0], 2026);
    assert.deepEqual(
      years,
      [...new Set(years)].sort((a, b) => b - a),
    );
  } finally {
    resetRandom();
  }
});

test('a generated-history year with only champions and season records still builds', () => {
  const review = buildYearReview(
    {
      championHistory: [{ year: 2010, champion: 'hawks', runnerUp: 'giants' }],
      awardHistory: [],
      achievementHistory: [],
      narrativeEvents: {},
      yearlyStats: {},
      leagueCareerAccumulated: {},
    },
    2010,
  );
  assert.equal(review.champion?.champion, 'hawks');
  assert.deepEqual(review.standings, { central: [], pacific: [] });
  assert.deepEqual(review.leaders, []);
  assert.deepEqual(review.retirements, []);
});
