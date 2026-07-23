import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calcStandings,
  configureRandom,
  generateSchedule,
  initTeams,
  resetRandom,
  simulateGame,
} from '../src/engine';
import type { TeamKey } from '../src/engine';

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
