import assert from 'node:assert/strict';
import test from 'node:test';

import { PS } from '../src/data';
import { configureRandom, initTeams, resetRandom } from '../src/engine';
import {
  SAVE_KEY,
  loadGame,
  migrateSaveData,
  saveGame,
} from '../src/state/storage';

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

test('legacy save data keeps the existing key and migrates special levels', () => {
  configureRandom(mulberry32(7), () => Date.UTC(2026, 0, 1));
  try {
    const teams = initTeams();
    const legacyPlayer = {
      ...teams.giants.fielders[0],
      specialLevels: undefined,
      specials: [PS[0]],
    };
    teams.giants = {
      ...teams.giants,
      fielders: [legacyPlayer, ...teams.giants.fielders.slice(1)],
    };

    const migrated = migrateSaveData({
      teams,
      playerTeam: 'giants',
      season: { year: 2026, schedule: [] },
      lineup: [],
    });
    assert.ok(migrated);
    assert.equal(SAVE_KEY, 'npb_sim_v3_restored');
    assert.equal(migrated.teams.giants.fielders[0].specialLevels?.[PS[0].id], 1);
    assert.equal(migrated.viewTeam, 'giants');
    assert.deepEqual(migrated.accumulated, {});
    assert.equal(migrated.uiVersion, 1);
  } finally {
    resetRandom();
  }
});

test('saveGame and loadGame round-trip through a compatible backend', async () => {
  configureRandom(mulberry32(9), () => Date.UTC(2026, 0, 1));
  try {
    const teams = initTeams();
    const migrated = migrateSaveData({
      teams,
      playerTeam: 'tigers',
      viewTeam: 'tigers',
      season: { year: 2026, schedule: [] },
      lineup: [],
    });
    assert.ok(migrated);

    const values = new Map<string, string>();
    const backend = {
      async get(key: string) {
        return values.get(key) ?? null;
      },
      async set(key: string, value: string) {
        values.set(key, value);
      },
    };

    assert.equal(await saveGame(migrated, backend), true);
    assert.ok(values.has(SAVE_KEY));
    const loaded = await loadGame(backend);
    assert.ok(loaded);
    assert.equal(loaded.playerTeam, 'tigers');
    assert.equal(loaded.teams.tigers.pitchers.length, 28);
  } finally {
    resetRandom();
  }
});
