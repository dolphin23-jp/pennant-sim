import assert from 'node:assert/strict';
import test from 'node:test';

import {
  accumulateStatsAll,
  configureRandom,
  generateSchedule,
  initTeams,
  orderBattingLineup,
  resetRandom,
  simAB,
  simulateGame,
  type AccumulatedStats,
  type BatterStats,
  type Player,
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

test('automatic batting order places the strongest cleanup profile fourth', () => {
  configureRandom(mulberry32(20260749), () => 1_700_000_000_000);
  const players = initTeams()
    .giants.fielders.slice(0, 9)
    .map((player, index) => ({
      ...player,
      p: {
        ...player.p,
        cf: 50 + index,
        cb: 50 + index,
        pw: index === 7 ? 140 : 40 + index,
        dc: 50 + index,
        sp: 50 + index,
      },
    }));
  const ordered = orderBattingLineup(players);
  assert.equal(ordered[3]?.id, players[7]?.id);
  resetRandom();
});

test('elite adapted power supports record pace without an annual home run cap', () => {
  configureRandom(mulberry32(20260750), () => 1_700_000_000_000);
  const teams = initTeams(),
    sourcePitcher = teams.giants.pitchers[0] as Player,
    pitcher: Player = {
      ...sourcePitcher,
      p: { ...sourcePitcher.p, vel: 50, nobi: 50, ctrl: 50, pitches: [] },
      specialLevels: {},
    },
    ordinary = teams.tigers.fielders[0] as Player,
    elite: Player = {
      ...ordinary,
      p: { ...ordinary.p, pw: 120 },
      foreignProfile: {
        origin: 'ドミニカ共和国',
        arrivalYear: 2026,
        contractYearsRemaining: 2,
        npbSeasons: 2,
        adaptationFactor: 1.18,
      },
      specialLevels: { ...ordinary.specialLevels, slugger_gold: 1, pull: 4 },
    };
  resetRandom();
  const countHomeRuns = (batter: Player, seed: number): number => {
    configureRandom(mulberry32(seed), () => 1_700_000_000_000);
    let homeRuns = 0;
    for (let plateAppearance = 0; plateAppearance < 10_000; plateAppearance += 1) {
      const outcome = simAB(
        pitcher,
        batter,
        {
          pStam: 100,
          isPinch: false,
          isLead: false,
          outs: 0,
          bases: [false, false, false],
        },
        50,
        1,
        1,
        { homeRun: 1, hit: 1 },
        0,
      );
      if (outcome.result === 'HR') homeRuns += 1;
    }
    resetRandom();
    return homeRuns;
  };
  const ordinaryHomeRuns = countHomeRuns({ ...ordinary, p: { ...ordinary.p, pw: 60 } }, 20260750),
    eliteHomeRuns = countHomeRuns(elite, 20260751);
  assert.ok(
    eliteHomeRuns > ordinaryHomeRuns * 5,
    `expected an elite/ordinary ratio above five, got ${eliteHomeRuns}/${ordinaryHomeRuns}`,
  );
  assert.ok(
    eliteHomeRuns >= 700 && eliteHomeRuns <= 1_250,
    `expected record-capable contact quality, got ${eliteHomeRuns} HR in 10,000 simulated PA`,
  );
});

test('a fixed full season produces NPB-like home run and RBI tails', () => {
  configureRandom(mulberry32(20260724), () => 1_700_000_000_000);
  try {
    const teams = initTeams();
    const schedule = generateSchedule(2025, { rainoutRate: 0, maxRainouts: 0 });
    const rotations = Object.fromEntries(
      Object.keys(teams).map((teamKey) => [teamKey, 0]),
    ) as Record<TeamKey, number>;
    let accumulated: AccumulatedStats = {};
    for (const game of schedule) {
      const result = simulateGame(
        game.homeKey,
        game.awayKey,
        teams,
        null,
        null,
        rotations[game.homeKey],
        rotations[game.awayKey],
        accumulated,
        null,
        null,
        game.date,
      );
      accumulated = accumulateStatsAll(result, accumulated);
      rotations[game.homeKey] += 1;
      rotations[game.awayKey] += 1;
    }
    const batting = Object.values(accumulated).filter(
      (line): line is BatterStats => line.type === 'bat',
    );
    const homeRunLeader = Math.max(...batting.map((line) => line.hr)),
      runsBattedInLeader = Math.max(...batting.map((line) => line.rbi));
    assert.ok(
      homeRunLeader >= 25 && homeRunLeader <= 65,
      `home run leader fell outside the plausible single-season range: ${homeRunLeader}`,
    );
    assert.ok(batting.filter((line) => line.hr >= 30).length <= 10);
    assert.ok(
      runsBattedInLeader >= 85 && runsBattedInLeader <= 155,
      `RBI leader fell outside the plausible single-season range: ${runsBattedInLeader}`,
    );
    assert.ok(batting.filter((line) => line.rbi >= 100).length <= 10);
  } finally {
    resetRandom();
  }
});
