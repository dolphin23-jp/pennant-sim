import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calcStandings,
  configureRandom,
  generateSchedule,
  initTeams,
  resetRandom,
  simAB,
  simulateGame,
} from '../src/engine';
import type { Player, TeamKey } from '../src/engine';

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

function makePlayer(id: string, isPitcher: boolean): Player {
  return {
    id,
    name: id,
    age: 27,
    tk: 'giants',
    isP: isPitcher,
    role: isPitcher ? '先発' : undefined,
    pos: isPitcher ? undefined : '一塁手',
    mat: '通常',
    hand: isPitcher ? { th: '右' } : { bat: '右' },
    p: isPitcher
      ? { vel: 50, ctrl: 50, stam: 80, nobi: 50, pitches: [] }
      : { cf: 50, cb: 50, pw: 50, dc: 50, sp: 50, stam: 80 },
    pot: {},
    trainPolicy: 'balanced',
  };
}

test('Phase B engine preserves league structure and can complete a game', () => {
  configureRandom(mulberry32(20260723), () => Date.UTC(2026, 0, 1));
  try {
    const teams = initTeams();
    const teamKeys = Object.keys(teams) as TeamKey[];
    assert.equal(teamKeys.length, 12);
    for (const team of Object.values(teams)) {
      assert.equal(team.pitchers.length, 28);
      assert.equal(team.fielders.length, 35);
    }

    const schedule = generateSchedule(2026);
    assert.equal(schedule.length, 858);
    for (const teamKey of teamKeys) {
      const games = schedule.filter(
        (game) => game.homeKey === teamKey || game.awayKey === teamKey,
      );
      assert.equal(games.length, 143);
    }

    const result = simulateGame('giants', 'tigers', teams, null, null, 0, 0, {});
    assert.ok(result.innings.length >= 9);
    assert.ok(result.innings.length <= 15);
    assert.ok(result.score.home >= 0);
    assert.ok(result.score.away >= 0);
    assert.ok(result.atBatLog.length > 0);
    assert.deepEqual(result.park, teams.giants.park);
    const plateAppearances = result.atBatLog.filter(
        (entry) => entry.result !== 'SB' && entry.result !== 'CS',
      ).length,
      trackedMatchups = Object.values(result.matchupCounts);
    assert.equal(
      trackedMatchups.reduce((total, count) => total + count, 0),
      plateAppearances,
    );
    assert.ok(trackedMatchups.some((count) => count > 1));
  } finally {
    resetRandom();
  }
});

test('platoon, park and prior-matchup context can benefit the batter', () => {
  const pitcher = makePlayer('pitcher', true),
    batter = makePlayer('batter', false),
    situation = { pStam: 100, isPinch: false, isLead: false, outs: 0, bases: [false, false, false] } as const;
  configureRandom(() => 0.313, () => Date.UTC(2026, 0, 1));
  try {
    const pitcherFriendly = simAB(
      pitcher,
      batter,
      situation,
      100,
      1,
      1,
      { homeRun: 0.7, hit: 0.9 },
      0,
    );
    const batterFriendly = simAB(
      pitcher,
      { ...batter, hand: { bat: '左' } },
      situation,
      100,
      1,
      1,
      { homeRun: 1.5, hit: 1.1 },
      4,
    );
    assert.notEqual(pitcherFriendly.result, 'HR');
    assert.equal(batterFriendly.result, 'HR');
  } finally {
    resetRandom();
  }
});

test('calcStandings records wins, losses, runs and ranks', () => {
  configureRandom(mulberry32(11), () => Date.UTC(2026, 0, 1));
  try {
    const schedule = generateSchedule(2026);
    const firstGame = schedule[0];
    const secondGame = schedule.find(
      (game) =>
        game.homeKey !== firstGame.homeKey &&
        game.awayKey !== firstGame.homeKey &&
        game.homeKey !== firstGame.awayKey &&
        game.awayKey !== firstGame.awayKey,
    );
    assert.ok(secondGame);
    const played = schedule.map((game) => {
      if (game.id === firstGame.id) return { ...game, played: true, hs: 5, as: 2 };
      if (game.id === secondGame.id) return { ...game, played: true, hs: 1, as: 3 };
      return game;
    });
    const standings = calcStandings(played);
    assert.equal(standings[firstGame.homeKey].w, 1);
    assert.equal(standings[firstGame.awayKey].l, 1);
    assert.equal(standings[firstGame.homeKey].rs, 5);
    assert.equal(standings[firstGame.homeKey].ra, 2);
    assert.ok(standings[firstGame.homeKey].rank);
  } finally {
    resetRandom();
  }
});
