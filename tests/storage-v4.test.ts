import assert from 'node:assert/strict';
import test from 'node:test';

import { TINFO } from '../src/data';
import { calcOVR, createBatterStats, generateSchedule, initTeams } from '../src/engine';
import {
  SAVE_KEY,
  SAVE_STORAGE_VERSION,
  clearSaveSlot,
  loadGameFromSlot,
  migrateSaveData,
  saveGameToSlot,
  type GameSaveData,
  type StorageBackend,
} from '../src/state/storage';

interface WriteRecord {
  key: string;
  value: string;
}

function createBackend() {
  const values = new Map<string, string>();
  const writes: WriteRecord[] = [];
  const backend: StorageBackend = {
    async get(key) {
      return values.get(key) ?? null;
    },
    async set(key, value) {
      values.set(key, value);
      writes.push({ key, value });
    },
  };
  return { values, writes, backend };
}

function createSave(year = 2028): GameSaveData {
  const migrated = migrateSaveData({
    teams: initTeams(),
    playerTeam: 'giants',
    viewTeam: 'giants',
    season: { year, schedule: generateSchedule(year, { rainoutRate: 0, maxRainouts: 0 }) },
    lineup: [],
  });
  assert.ok(migrated);
  return migrated;
}

function addArchivedYear(save: GameSaveData, year: number, suffix: string): void {
  const player = save.teams.giants.fielders[0];
  const stats = createBatterStats(`ARCHIVED_ONLY_${suffix}`);
  stats.g = 100;
  stats.pa = 400;
  stats.ab = 360;
  stats.h = 108;
  save.yearlyStats[String(year)] = [
    {
      playerId: `archive-${suffix}`,
      playerName: `ARCHIVED_ONLY_${suffix}`,
      year,
      age: 27,
      teamKey: 'giants',
      teamName: TINFO.giants.n,
      teamAbbreviation: TINFO.giants.ab,
      isPitcher: false,
      ovr: calcOVR(player),
      params: { ...player.p },
      stats,
    },
  ];
  save.achievementHistory.push({
    id: `achievement-${suffix}`,
    kind: 'milestone',
    playerId: player.id,
    playerName: player.name,
    teamKey: 'giants',
    metricLabel: '安打',
    value: year,
    previousValue: null,
    previousHolderName: null,
    year,
    date: `${year}-09-01`,
  });
}

test('Save Architecture v4 keeps historical seasons out of the current-state blob and rehydrates them', async () => {
  const save = createSave(2028);
  addArchivedYear(save, 2025, '2025');
  const retired = save.teams.giants.fielders[1];
  const career = createBatterStats(retired.name);
  career.g = 900;
  career.h = 1_234;
  save.retiredPlayers = [retired];
  save.careerAccumulated[retired.id] = career;
  save.leagueCareerAccumulated[retired.id] = career;

  const { values, backend } = createBackend();
  assert.equal(await saveGameToSlot(save, 1, backend), true);

  const rootRaw = values.get(SAVE_KEY(1));
  assert.ok(rootRaw);
  const root = JSON.parse(rootRaw) as {
    storageVersion: number;
    current: GameSaveData;
    archive: {
      seasons: Record<string, { key: string; revision: string }>;
      retiredPlayerBuckets: Record<string, { key: string; revision: string }>;
    };
  };
  assert.equal(root.storageVersion, SAVE_STORAGE_VERSION);
  assert.deepEqual(root.current.yearlyStats, {});
  assert.deepEqual(root.current.retiredPlayers, []);
  assert.deepEqual(root.current.achievementHistory, []);
  assert.equal(root.current.careerAccumulated[retired.id], undefined);
  assert.ok(root.archive.seasons['2025']);
  assert.equal(Object.keys(root.archive.retiredPlayerBuckets).length, 1);
  assert.equal(rootRaw.includes('ARCHIVED_ONLY_2025'), false, 'historical payload is not duplicated in current state');

  const seasonRaw = values.get(root.archive.seasons['2025'].key);
  assert.ok(seasonRaw?.includes('ARCHIVED_ONLY_2025'));

  const loaded = await loadGameFromSlot(1, backend);
  assert.ok(loaded);
  assert.equal(loaded.yearlyStats['2025']?.[0]?.playerName, 'ARCHIVED_ONLY_2025');
  assert.equal(loaded.achievementHistory[0]?.id, 'achievement-2025');
  assert.equal(loaded.retiredPlayers[0]?.id, retired.id);
  assert.equal(loaded.careerAccumulated[retired.id]?.g, 900);
});

test('unchanged historical chunks are reused while only a changed year receives a new revision', async () => {
  const save = createSave(2028);
  addArchivedYear(save, 2025, '2025');
  addArchivedYear(save, 2026, '2026');
  const { values, writes, backend } = createBackend();

  assert.equal(await saveGameToSlot(save, 1, backend), true);
  const firstRoot = JSON.parse(values.get(SAVE_KEY(1)) ?? '{}') as {
    archive: { seasons: Record<string, { key: string; revision: string }> };
  };
  const first2025 = firstRoot.archive.seasons['2025'];
  const first2026 = firstRoot.archive.seasons['2026'];
  assert.ok(first2025 && first2026);

  writes.length = 0;
  save.achievementHistory.push({
    ...save.achievementHistory.find((event) => event.year === 2026)!,
    id: 'achievement-2026-extra',
    value: 2_026_001,
  });
  assert.equal(await saveGameToSlot(save, 1, backend), true);

  const secondRoot = JSON.parse(values.get(SAVE_KEY(1)) ?? '{}') as {
    archive: { seasons: Record<string, { key: string; revision: string }> };
  };
  const second2025 = secondRoot.archive.seasons['2025'];
  const second2026 = secondRoot.archive.seasons['2026'];
  assert.equal(second2025.key, first2025.key, 'unchanged years keep their immutable chunk');
  assert.notEqual(second2026.key, first2026.key, 'changed years get a new content-addressed revision');
  assert.equal(
    writes.some((write) => write.key === first2025.key),
    false,
    'old historical years are not rewritten during an ordinary save',
  );
  assert.ok(writes.some((write) => write.key === second2026.key && write.value.length > 0));
  assert.ok(
    writes.some((write) => write.key === first2026.key && write.value === ''),
    'the superseded revision is tombstoned only after the new root commits',
  );
});

test('a v3 monolithic slot remains readable and converts to v4 on the next save', async () => {
  const save = createSave(2030);
  addArchivedYear(save, 2029, 'legacy');
  const { values, backend } = createBackend();
  values.set(SAVE_KEY(2), JSON.stringify({ ...save, uiVersion: 2, ts: 123 }));

  const loadedLegacy = await loadGameFromSlot(2, backend);
  assert.equal(loadedLegacy?.yearlyStats['2029']?.[0]?.playerName, 'ARCHIVED_ONLY_legacy');
  assert.equal(await saveGameToSlot(loadedLegacy!, 2, backend), true);

  const converted = JSON.parse(values.get(SAVE_KEY(2)) ?? '{}') as { storageVersion?: number };
  assert.equal(converted.storageVersion, SAVE_STORAGE_VERSION);
  const roundTrip = await loadGameFromSlot(2, backend);
  assert.equal(roundTrip?.yearlyStats['2029']?.[0]?.playerName, 'ARCHIVED_ONLY_legacy');
});

test('missing or modified archive chunks are reported as corruption instead of silently losing history', async () => {
  const save = createSave(2028);
  addArchivedYear(save, 2025, 'corrupt');
  const { values, backend } = createBackend();
  assert.equal(await saveGameToSlot(save, 1, backend), true);

  const root = JSON.parse(values.get(SAVE_KEY(1)) ?? '{}') as {
    archive: { seasons: Record<string, { key: string }> };
  };
  values.set(root.archive.seasons['2025'].key, JSON.stringify({ schemaVersion: 1, year: 2025 }));

  await assert.rejects(() => loadGameFromSlot(1, backend), /revision|archive/i);
});

test('clearing a v4 slot tombstones all archive chunks referenced by its committed root', async () => {
  const save = createSave(2028);
  addArchivedYear(save, 2025, 'clear');
  save.retiredPlayers = [save.teams.giants.fielders[2]];
  const { values, backend } = createBackend();
  assert.equal(await saveGameToSlot(save, 3, backend), true);

  const root = JSON.parse(values.get(SAVE_KEY(3)) ?? '{}') as {
    archive: {
      seasons: Record<string, { key: string }>;
      retiredPlayerBuckets: Record<string, { key: string }>;
    };
  };
  const archiveKeys = [
    ...Object.values(root.archive.seasons).map((ref) => ref.key),
    ...Object.values(root.archive.retiredPlayerBuckets).map((ref) => ref.key),
  ];
  assert.ok(archiveKeys.length >= 2);

  assert.equal(await clearSaveSlot(3, backend), true);
  assert.equal(values.get(SAVE_KEY(3)), '');
  for (const key of archiveKeys) assert.equal(values.get(key), '');
  assert.equal(await loadGameFromSlot(3, backend), null);
});
