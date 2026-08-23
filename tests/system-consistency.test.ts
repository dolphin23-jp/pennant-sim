import assert from 'node:assert/strict';
import test from 'node:test';

import { CENTRAL, PACIFIC, PLAYER_DEVELOPMENT_BALANCE } from '../src/data';
import {
  bestLineup,
  calcInterleagueStandings,
  calcStandings,
  configureRandom,
  cpuAutoTradeBetweenTeams,
  draftOrderFromStandings,
  generateDraftProspects,
  generateSchedule,
  initTeams,
  progressiveScoringEvents,
  resetRandom,
  resolveFirstRoundWave,
  type TeamKey,
} from '../src/engine';

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

test('every generated lineup has eight unique fielders plus exactly one DH', () => {
  configureRandom(mulberry32(20260823), () => 1_700_000_000_000);
  try {
    const teams = initTeams();
    for (const teamKey of [...CENTRAL, ...PACIFIC]) {
      const lineup = bestLineup(teams[teamKey]);
      assert.equal(lineup.length, 9);
      assert.equal(lineup.filter((player) => player._isDH).length, 1);
      const defenders = lineup.filter((player) => !player._isDH);
      assert.equal(defenders.length, 8);
      assert.equal(new Set(defenders.map((player) => player._assignedPos)).size, 8);
      assert.equal(lineup.find((player) => player._isDH)?._assignedPos, undefined);
    }
  } finally {
    resetRandom();
  }
});

test('multi-run scoring advances the score one runner at a time', () => {
  const events = progressiveScoringEvents(
    { home: 2, away: 2 },
    'home',
    0,
    [
      { runnerId: 'r1', chargedPitcherId: 'p1', earned: true },
      { runnerId: 'r2', chargedPitcherId: 'p2', earned: true },
    ],
  );
  assert.deepEqual(
    events.map((event) => [event.homeScore, event.awayScore, event.chargedPitcherId]),
    [
      [3, 2, 'p1'],
      [4, 2, 'p2'],
    ],
  );
});

test('first-round bidding resolves one winner and keeps lottery losers alive', () => {
  configureRandom(mulberry32(1), () => 1_700_000_000_000);
  try {
    const teams = initTeams();
    const prospect = generateDraftProspects()[0]!;
    const wave = resolveFirstRoundWave(teams, [prospect], ['giants', 'tigers']);
    assert.equal(wave.picks.length, 1);
    assert.equal(wave.unresolvedTeams.length, 1);
    assert.equal(wave.picks[0]?.id, prospect.id);
  } finally {
    resetRandom();
  }
});

test('draft order is frozen from standings rather than current roster strength', () => {
  const standings = calcStandings([]);
  CENTRAL.forEach((teamKey, index) => {
    standings[teamKey].rank = index + 1;
    standings[teamKey].pct = 0.6 - index * 0.04;
  });
  PACIFIC.forEach((teamKey, index) => {
    standings[teamKey].rank = index + 1;
    standings[teamKey].pct = 0.59 - index * 0.04;
  });
  const interleague = calcInterleagueStandings([]);
  for (const teamKey of CENTRAL) interleague[teamKey].w = 2;
  for (const teamKey of PACIFIC) interleague[teamKey].w = 1;
  const order = draftOrderFromStandings(standings, interleague);
  assert.equal(order[0], CENTRAL[5]);
  assert.equal(order[1], PACIFIC[5]);
  assert.equal(order[10], CENTRAL[0]);
  assert.equal(order[11], PACIFIC[0]);
});

test('interleague games occupy one exclusive calendar block', () => {
  configureRandom(mulberry32(2026), () => 1_700_000_000_000);
  try {
    const schedule = generateSchedule(2026, { rainoutRate: 0, maxRainouts: 0 });
    const interleague = schedule.filter((game) => game.isInterleague);
    assert.ok(interleague.length > 0);
    const first = interleague.map((game) => game.date).sort()[0]!;
    const last = interleague.map((game) => game.date).sort().at(-1)!;
    assert.equal(
      schedule.filter((game) => game.date >= first && game.date <= last && !game.isInterleague)
        .length,
      0,
    );
    for (const teamKey of [...CENTRAL, ...PACIFIC]) {
      const teamGames = schedule.filter(
        (game) => game.homeKey === teamKey || game.awayKey === teamKey,
      );
      assert.equal(teamGames.length, 143);
      assert.equal(teamGames.filter((game) => game.isInterleague).length, 18);
    }
  } finally {
    resetRandom();
  }
});

test('draft contact calibration respects shared rating and potential ceilings', () => {
  configureRandom(mulberry32(77), () => 1_700_000_000_000);
  try {
    for (const player of generateDraftProspects().filter((candidate) => !candidate.isP)) {
      assert.ok((player.p.cf ?? 0) <= PLAYER_DEVELOPMENT_BALANCE.annualRandomVariation.maximumRating);
      assert.ok((player.p.cb ?? 0) <= PLAYER_DEVELOPMENT_BALANCE.annualRandomVariation.maximumRating);
      const ceiling =
        player.potentialClass === 'elite'
          ? PLAYER_DEVELOPMENT_BALANCE.potentialCeiling.elite
          : PLAYER_DEVELOPMENT_BALANCE.potentialCeiling.standard;
      assert.ok((player.pot.cf ?? 0) <= ceiling);
      assert.ok((player.pot.cb ?? 0) <= ceiling);
    }
  } finally {
    resetRandom();
  }
});

test('CPU trades never duplicate a player across rosters', () => {
  configureRandom(mulberry32(998), () => 1_700_000_000_000);
  try {
    const after = cpuAutoTradeBetweenTeams(initTeams(), 'giants', 12);
    const ids = (Object.keys(after) as TeamKey[]).flatMap((teamKey) => [
      ...after[teamKey].pitchers.map((player) => player.id),
      ...after[teamKey].fielders.map((player) => player.id),
    ]);
    assert.equal(new Set(ids).size, ids.length);
  } finally {
    resetRandom();
  }
});
