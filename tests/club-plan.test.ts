import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clubPlanFor,
  configureRandom,
  initTeams,
  planBidAdjustment,
  planRetentionAdjustment,
  planTradeAdjustment,
  resetRandom,
  withTeamContractDefaults,
  type Player,
  type StandingRecord,
  type Team,
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

const standingsWith = (teamKey: TeamKey, w: number, l: number) => {
  const standings = Object.fromEntries(
    Object.keys(initTeams()).map((key) => [
      key,
      { w: 71, l: 72, d: 0, rs: 0, ra: 0, g: 143 } satisfies StandingRecord,
    ]),
  ) as Record<TeamKey, StandingRecord>;
  standings[teamKey] = { w, l, d: 0, rs: 0, ra: 0, g: 143 };
  return { standings };
};

const withAges = (team: Team, age: number): Team => ({
  ...team,
  pitchers: team.pitchers.map((player) => ({ ...player, age })),
  fielders: team.fielders.map((player) => ({ ...player, age })),
});

test('an old losing club rebuilds and a winning one contends', () => {
  configureRandom(mulberry32(3), () => 1_700_000_000_000);
  try {
    const teams = withTeamContractDefaults(initTeams());
    const old = withAges(teams.carp, 32);
    assert.equal(clubPlanFor(old, standingsWith('carp', 65, 78)).mode, 'rebuild');
    assert.equal(
      clubPlanFor(withAges(teams.carp, 25), standingsWith('carp', 65, 78)).mode,
      'balanced',
    );
    assert.equal(clubPlanFor(teams.carp, standingsWith('carp', 55, 88)).mode, 'rebuild');
    assert.equal(clubPlanFor(teams.giants, standingsWith('giants', 85, 58)).mode, 'contend');
    assert.equal(clubPlanFor(teams.giants).mode, 'balanced', 'no season, no plan');
  } finally {
    resetRandom();
  }
});

test('a rebuilding club bids for youth, sells veterans and keeps its young players', () => {
  const player = initTeams().giants.fielders[0]!;
  const young: Player = { ...player, age: 23 };
  const veteran: Player = { ...player, age: 33 };
  const rebuild = { mode: 'rebuild', winPct: 0.4, coreAge: 31 } as const;
  const contend = { mode: 'contend', winPct: 0.6, coreAge: 28 } as const;
  assert.ok(planBidAdjustment(rebuild, young) > 0);
  assert.ok(planBidAdjustment(rebuild, veteran) < 0);
  assert.ok(planBidAdjustment(contend, veteran) > 0);
  assert.ok(planTradeAdjustment(rebuild, veteran, young) > 0, 'trading age for youth helps');
  assert.ok(planTradeAdjustment(rebuild, young, veteran) < 0);
  assert.ok(planRetentionAdjustment(rebuild, young) > planRetentionAdjustment(rebuild, veteran));
  assert.equal(planRetentionAdjustment(contend, young), 0);
});
