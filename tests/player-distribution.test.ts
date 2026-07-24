import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calcOVR,
  configureRandom,
  genForeignMarket,
  genFreeAgentMarket,
  initTeams,
  resetRandom,
  type Player,
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

const overall = (player: Player): number =>
  player.isP ? calcOVR(player) : calcOVR(player, player.pos);

function standardDeviation(values: number[]): number {
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  return Math.sqrt(
    values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length,
  );
}

test('initial rosters contain multiple stars while retaining a broad distribution', () => {
  configureRandom(mulberry32(20260724), () => 1_700_000_000_000);
  const teams = initTeams();
  for (const team of Object.values(teams)) {
    const starCount = [...team.pitchers, ...team.fielders].filter(
      (player) => overall(player) >= 85,
    ).length;
    assert.ok(starCount >= 2, `${team.ab} should start with at least two OVR85 players`);
  }
  const batterOvrs = Object.values(teams).flatMap((team) => team.fielders.map(overall));
  const pitcherOvrs = Object.values(teams).flatMap((team) => team.pitchers.map(overall));
  assert.ok(standardDeviation(batterOvrs) >= 15);
  assert.ok(standardDeviation(pitcherOvrs) >= 13);
  resetRandom();
});

test('FA and foreign markets occasionally produce marquee players', () => {
  configureRandom(mulberry32(20260725), () => 1_700_000_000_000);
  const candidates = Array.from({ length: 40 }, () => [
    ...genFreeAgentMarket(),
    ...genForeignMarket(),
  ]).flat();
  assert.ok(candidates.some((player) => overall(player) >= 90));
  resetRandom();
});
