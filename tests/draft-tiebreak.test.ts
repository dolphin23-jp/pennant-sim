import assert from 'node:assert/strict';
import test from 'node:test';

import { CENTRAL, PACIFIC } from '../src/data';
import {
  calcInterleagueStandings,
  calcStandings,
  configureRandom,
  draftOrderFromStandings,
  resetRandom,
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

test('draft league priority uses interleague run differential when wins are tied', () => {
  configureRandom(mulberry32(314), () => 1_700_000_000_000);
  try {
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
    for (const teamKey of [...CENTRAL, ...PACIFIC]) interleague[teamKey].w = 1;
    interleague[CENTRAL[0]!].rs = 5;
    interleague[PACIFIC[0]!].rs = 2;

    const order = draftOrderFromStandings(standings, interleague);
    assert.equal(order[0], CENTRAL[5]);
    assert.equal(order[1], PACIFIC[5]);
  } finally {
    resetRandom();
  }
});
