import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calcOVR,
  configureRandom,
  generateBatter,
  growPlayer,
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

const average = (values: number[]): number =>
  values.reduce((total, value) => total + value, 0) / values.length;

function growForYears(player: Player, years: number): Player {
  let current = player;
  for (let year = 0; year < years; year += 1) current = growPlayer(current);
  return current;
}

test('elite potential is rare and creates clearly larger multi-year growth', () => {
  configureRandom(mulberry32(20260727), () => 1_700_000_000_000);
  const players = Array.from({ length: 1600 }, () =>
    generateBatter('draft', 18, '中堅手', 72),
  );
  const elite = players.filter((player) => player.potentialClass === 'elite'),
    standard = players.filter((player) => player.potentialClass === 'standard'),
    eliteRate = elite.length / players.length;

  assert.ok(eliteRate >= 0.035 && eliteRate <= 0.065, `elite rate was ${eliteRate}`);
  assert.equal(elite.length + standard.length, players.length);

  const growth = (player: Player): number => {
    const before = calcOVR(player, player.pos),
      after = calcOVR(growForYears(player, 5), player.pos);
    return after - before;
  };
  const eliteGrowth = average(elite.map(growth)),
    standardGrowth = average(standard.slice(0, 500).map(growth));

  assert.ok(
    eliteGrowth >= standardGrowth + 3,
    `elite growth ${eliteGrowth.toFixed(2)} should exceed standard growth ${standardGrowth.toFixed(2)}`,
  );
  assert.ok(
    elite.some((player) => {
      const grown = growForYears(player, 5);
      return (grown.growthLog ?? []).some((entry) => (entry.delta ?? 0) >= 2);
    }),
    'at least one elite prospect should record a major growth season',
  );
  resetRandom();
});
