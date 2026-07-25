import assert from 'node:assert/strict';
import test from 'node:test';

import { PS, TINFO } from '../src/data';
import { configureRandom, generateSchedule, initTeams, resetRandom } from '../src/engine';
import {
  ACTIVE_SAVE_SLOT_KEY,
  LEGACY_SAVE_KEY,
  SAVE_KEY,
  createResilientStorageBackend,
  exportSaveData,
  importSaveData,
  listSaveSlots,
  loadGame,
  loadGameFromSlot,
  migrateSaveData,
  saveGame,
  saveGameToSlot,
  setActiveSaveSlot,
  type GameSaveData,
  type StorageBackend,
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

const createBackend = () => {
  const values = new Map<string, string>();
  const backend: StorageBackend = {
    async get(key) {
      return values.get(key) ?? null;
    },
    async set(key, value) {
      values.set(key, value);
    },
  };
  return { values, backend };
};

function createSave(playerTeam: 'giants' | 'tigers', year: number): GameSaveData {
  const teams = initTeams(),
    migrated = migrateSaveData({
      teams,
      playerTeam,
      viewTeam: playerTeam,
      season: { year, schedule: generateSchedule(year, { rainoutRate: 0, maxRainouts: 0 }) },
      lineup: [],
    });
  assert.ok(migrated);
  return migrated;
}

test('legacy single save is copied to slot 1 without deleting the old key', async () => {
  configureRandom(mulberry32(7), () => Date.UTC(2026, 0, 1));
  try {
    const teams = initTeams();
    const legacyPlayer = {
      ...teams.giants.fielders[0],
      specialLevels: undefined,
      specials: [PS[0]],
    };
    const legacyGiants = { ...teams.giants };
    delete (legacyGiants as Partial<typeof teams.giants>).park;
    teams.giants = {
      ...legacyGiants,
      fielders: [legacyPlayer, ...teams.giants.fielders.slice(1)],
    } as typeof teams.giants;

    const legacyRaw = JSON.stringify({
      teams,
      playerTeam: 'giants',
      season: { year: 2026, schedule: [] },
      lineup: [],
    });
    const { values, backend } = createBackend();
    values.set(LEGACY_SAVE_KEY, legacyRaw);

    const loaded = await loadGame(backend);
    assert.ok(loaded);
    assert.equal(SAVE_KEY(1), 'npb_sim_v3_slot_1');
    assert.equal(values.get(LEGACY_SAVE_KEY), legacyRaw);
    assert.ok(values.has(SAVE_KEY(1)));
    assert.equal(loaded.teams.giants.fielders[0].specialLevels?.[PS[0].id], 1);
    assert.deepEqual(loaded.teams.giants.park, TINFO.giants.park);
    assert.equal(loaded.viewTeam, 'giants');
    assert.equal(loaded.uiVersion, 2);
    assert.deepEqual(loaded.gameSummaries, {});
    assert.deepEqual(loaded.gameBoxScores, {});
    assert.deepEqual(loaded.awardHistory, []);
  } finally {
    resetRandom();
  }
});

test('save slots are independent and active-slot save/load uses the selected key', async () => {
  configureRandom(mulberry32(9), () => Date.UTC(2026, 0, 1));
  try {
    const giantsSave = createSave('giants', 2026),
      tigersSave = createSave('tigers', 2031),
      { values, backend } = createBackend();

    assert.equal(await saveGameToSlot(giantsSave, 1, backend), true);
    assert.equal(await saveGameToSlot(tigersSave, 2, backend), true);
    assert.ok(values.has(SAVE_KEY(1)));
    assert.ok(values.has(SAVE_KEY(2)));

    const slotOne = await loadGameFromSlot(1, backend),
      slotTwo = await loadGameFromSlot(2, backend);
    assert.equal(slotOne?.playerTeam, 'giants');
    assert.equal(slotOne?.season.year, 2026);
    assert.equal(slotTwo?.playerTeam, 'tigers');
    assert.equal(slotTwo?.season.year, 2031);

    await setActiveSaveSlot(2, backend);
    assert.equal(values.get(ACTIVE_SAVE_SLOT_KEY), '2');
    const active = await loadGame(backend);
    assert.equal(active?.playerTeam, 'tigers');

    const updated = { ...tigersSave, season: { ...tigersSave.season, year: 2032 } };
    assert.equal(await saveGame(updated, backend), true);
    assert.equal((await loadGameFromSlot(2, backend))?.season.year, 2032);
    assert.equal((await loadGameFromSlot(1, backend))?.season.year, 2026);

    const summaries = await listSaveSlots(backend);
    assert.deepEqual(
      summaries.map(({ slot, exists, playerTeam, year }) => ({ slot, exists, playerTeam, year })),
      [
        { slot: 1, exists: true, playerTeam: 'giants', year: 2026 },
        { slot: 2, exists: true, playerTeam: 'tigers', year: 2032 },
        { slot: 3, exists: false, playerTeam: null, year: null },
      ],
    );
  } finally {
    resetRandom();
  }
});

test('large-save quota failures fall through to the next durable backend', async () => {
  const fallbackValues = new Map<string, string>();
  const quotaLimited: StorageBackend = {
    async get() {
      return null;
    },
    async set() {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    },
  };
  const fallback: StorageBackend = {
    async get(key) {
      return fallbackValues.get(key) ?? null;
    },
    async set(key, value) {
      fallbackValues.set(key, value);
    },
  };
  const backend = createResilientStorageBackend([quotaLimited, fallback]);

  await backend.set('large-save', 'x'.repeat(6_000_000));

  assert.equal((await backend.get('large-save'))?.length, 6_000_000);
});

test('export and import preserve save data including schedule metadata', async () => {
  configureRandom(mulberry32(13), () => Date.UTC(2026, 0, 1));
  try {
    const original = createSave('giants', 2028),
      firstGame = original.season.schedule[0];
    original.season.schedule[0] = {
      ...firstGame,
      date: '2028-04-03',
      originalDate: firstGame.date,
      postponedFrom: firstGame.date,
      doubleHeaderGame: 2,
    };

    const serialized = exportSaveData(original),
      imported = importSaveData(serialized);
    assert.ok(imported);
    assert.equal(imported.playerTeam, 'giants');
    assert.equal(imported.season.year, 2028);
    assert.equal(imported.season.schedule[0].postponedFrom, firstGame.date);
    assert.equal(imported.season.schedule[0].doubleHeaderGame, 2);

    const { backend } = createBackend();
    assert.equal(await saveGameToSlot(imported, 3, backend), true);
    const roundTripped = await loadGameFromSlot(3, backend);
    assert.equal(roundTripped?.season.year, 2028);
    assert.equal(roundTripped?.season.schedule[0].doubleHeaderGame, 2);
  } finally {
    resetRandom();
  }
});

test('新しい成績フィールドを持たない旧セーブが0で補完され、NaNを生まない', () => {
  configureRandom(mulberry32(9182), () => Date.UTC(2026, 0, 1));
  try {
    const teams = initTeams();
    // A stat line written before 失点/死球/併殺打/失策 existed on BatterStats.
    const legacyBatter = {
      type: 'bat',
      name: '旧打者',
      g: 100,
      pa: 400,
      ab: 360,
      h: 108,
      s: 70,
      d: 25,
      t: 3,
      hr: 10,
      bb: 32,
      k: 60,
      rbi: 55,
      sb: 8,
      cs: 3,
      bnt: 4,
      sf: 4,
    };
    const legacyPitcher = {
      type: 'pit',
      name: '旧投手',
      g: 25,
      gs: 25,
      w: 12,
      l: 8,
      sv: 0,
      hld: 0,
      bs: 0,
      ip3: 480,
      h: 150,
      bb: 40,
      k: 130,
      er: 55,
      pc: 2400,
    };
    const migrated = migrateSaveData({
      teams,
      playerTeam: 'giants',
      viewTeam: 'giants',
      season: { year: 2026, schedule: generateSchedule(2026, { rainoutRate: 0, maxRainouts: 0 }) },
      lineup: [],
      accumulated: { b1: legacyBatter, p1: legacyPitcher },
      leagueAccumulated: { b1: legacyBatter },
      careerAccumulated: { b1: legacyBatter },
      leagueCareerAccumulated: { b1: legacyBatter },
      yearlyStats: {
        '2025': [
          {
            playerId: 'b1',
            playerName: '旧打者',
            year: 2025,
            age: 28,
            teamKey: 'giants',
            teamName: '読売ジャイアンツ',
            teamAbbreviation: 'G',
            isPitcher: false,
            ovr: 70,
            params: {},
            stats: legacyBatter,
          },
        ],
      },
    });
    assert.ok(migrated);

    const batter = migrated.accumulated.b1;
    assert.equal(batter?.type, 'bat');
    if (batter?.type !== 'bat') return;
    assert.equal(batter.h, 108, '既存の値は保持される');
    assert.equal(batter.r, 0, '得点が0で補完される');
    assert.equal(batter.hbp, 0, '死球が0で補完される');
    assert.equal(batter.gdp, 0, '併殺打が0で補完される');
    assert.equal(batter.e, 0, '失策が0で補完される');

    const pitcher = migrated.accumulated.p1;
    assert.equal(pitcher?.type, 'pit');
    if (pitcher?.type !== 'pit') return;
    assert.equal(pitcher.er, 55, '既存の値は保持される');
    assert.equal(pitcher.r, 0);
    assert.equal(pitcher.hbp, 0);
    assert.equal(pitcher.hr, 0);
    assert.equal(pitcher.bf, 0);

    // Year-by-year records embed a frozen copy and need the same normalization.
    const yearly = migrated.yearlyStats['2025']?.[0]?.stats;
    assert.equal(yearly?.type, 'bat');
    if (yearly?.type !== 'bat') return;
    assert.equal(yearly.r, 0, '年度別成績の新フィールドも補完される');

    // Every numeric field must be finite, or arithmetic downstream turns into NaN.
    for (const map of [
      migrated.accumulated,
      migrated.leagueAccumulated,
      migrated.careerAccumulated,
      migrated.leagueCareerAccumulated,
    ]) {
      for (const line of Object.values(map)) {
        for (const [key, value] of Object.entries(line)) {
          if (typeof value === 'number') {
            assert.ok(Number.isFinite(value), `${line.name}.${key} が有限値である`);
          }
        }
      }
    }
  } finally {
    resetRandom();
  }
});
