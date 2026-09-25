import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bestLineup,
  calcStandings,
  configureRandom,
  generateSchedule,
  initTeams,
  resetRandom,
  type BatterStats,
} from '../src/engine';
import { buildFranchiseHistory, buildHallOfFame, buildRecordWatch } from '../src/state/history';
import { advanceOneYear, initialState } from '../src/state/runtime';
import { buildYearReview } from '../src/state/yearReview';

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

function oneYear() {
  const teams = initTeams();
  const schedule = generateSchedule(2026, { rainoutRate: 0, maxRainouts: 0 });
  return advanceOneYear({
    ...initialState,
    worldId: 'history-test',
    loading: false,
    screen: 'season',
    teams,
    playerTeam: 'giants',
    viewTeam: 'giants',
    lineup: bestLineup(teams.giants),
    season: { year: 2026, schedule },
    standings: calcStandings(schedule),
  });
}

test('a finished season names MVPs, rookies, Best Nines and Golden Gloves for each league', () => {
  configureRandom(mulberry32(20260930), () => Date.UTC(2026, 0, 1));
  try {
    const state = oneYear();
    const honors = state.honorHistory.filter((honor) => honor.year === 2026);
    for (const league of ['central', 'pacific'] as const) {
      const ofLeague = honors.filter((honor) => honor.league === league);
      assert.equal(ofLeague.filter((honor) => honor.honorId === 'mvp').length, 1);
      assert.ok(ofLeague.filter((honor) => honor.honorId === 'rookieOfYear').length <= 1);
      const bestNine = ofLeague.filter((honor) => honor.honorId === 'bestNine');
      assert.equal(bestNine.filter((honor) => honor.position === '外野手').length, 3);
      assert.equal(bestNine.filter((honor) => honor.position === '投手').length, 1);
      assert.ok(bestNine.length >= 8, 'nine places, when every position has a regular');
      assert.equal(new Set(bestNine.map((honor) => honor.playerId)).size, bestNine.length);
      assert.ok(ofLeague.some((honor) => honor.honorId === 'goldenGlove'));
    }
    const review = buildYearReview(state, 2026);
    assert.equal(review.honors[0]?.honorId, 'mvp');

    const franchise = buildFranchiseHistory(state, 'giants');
    assert.equal(franchise.seasons[0]?.year, 2026);
    assert.ok(franchise.seasons[0]?.rank != null);
    assert.ok(franchise.leaders.some((leader) => leader.label === '本塁打'));
    const champion = state.championHistory.find((record) => record.year === 2026)!.champion;
    assert.equal(buildFranchiseHistory(state, champion).championships >= 1, true);
  } finally {
    resetRandom();
  }
});

test('the hall of fame admits a retired 2000-hit batter, and the watch finds one near it', () => {
  configureRandom(mulberry32(7), () => Date.UTC(2026, 0, 1));
  try {
    const teams = initTeams();
    const [legend, active] = teams.giants.fielders;
    const line = (h: number): BatterStats =>
      ({ type: 'bat', name: '', g: 2000, pa: 8000, ab: 7000, h, hr: 300 }) as BatterStats;
    const source = {
      teams: {
        ...teams,
        giants: {
          ...teams.giants,
          fielders: teams.giants.fielders.filter((player) => player.id !== legend!.id),
        },
      },
      retiredPlayers: [legend!],
      overseasPlayers: [],
      leagueCareerAccumulated: { [legend!.id]: line(2105), [active!.id]: line(1950) },
      yearlyStats: {},
      championHistory: [],
      awardHistory: [],
      honorHistory: [],
      narrativeEvents: {},
    };
    const hall = buildHallOfFame(source);
    assert.equal(hall.length, 1);
    assert.equal(hall[0]!.playerId, legend!.id);
    assert.ok(hall[0]!.reasons.includes('通算2000安打'));
    assert.equal(buildHallOfFame({ ...source, overseasPlayers: [legend!] }).length, 0);

    const watch = buildRecordWatch(source);
    const entry = watch.find((item) => item.playerId === active!.id && item.label === '通算安打');
    assert.equal(entry?.target, 2000);
    assert.equal(entry?.remaining, 50);
  } finally {
    resetRandom();
  }
});
