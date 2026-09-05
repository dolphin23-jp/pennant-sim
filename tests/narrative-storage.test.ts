import assert from 'node:assert/strict';
import test from 'node:test';
import { initTeams } from '../src/engine';
import {
  appendNarrativeEvents,
  articleFromFutureEvent,
  migrateNarrativeEvents,
  type NarrativeEvent,
} from '../src/narrative';
import {
  SAVE_KEY,
  exportSaveData,
  importSaveData,
  loadGameFromSlot,
  migrateSaveData,
  saveGameToSlot,
  type StorageBackend,
} from '../src/state/storage';
import { contentRevision, seasonArchiveKey } from '../src/state/worldArchive';

const event = (year = 2034): NarrativeEvent => ({
  type: 'draft',
  id: `draft:${year}:giants:1:p`,
  year,
  date: `${year}年オフ`,
  teamKey: 'giants',
  round: 1,
  playerId: 'p',
  playerName: `入団時の名前${year}`,
  origin: '高卒',
});
function memory() {
  const values = new Map<string, string>();
  const writes: string[] = [];
  const backend: StorageBackend = {
    async get(k) {
      return values.get(k) ?? null;
    },
    async set(k, v) {
      values.set(k, v);
      writes.push(k);
    },
  };
  return { values, writes, backend };
}
function save() {
  return migrateSaveData({
    teams: initTeams(),
    playerTeam: 'giants',
    season: { year: 2035, schedule: [] },
  })!;
}

test('ledger migration accepts absent v3/v4 fields, dedupes exact events, rejects malformed or conflicting facts', () => {
  assert.deepEqual(migrateNarrativeEvents(undefined), {});
  assert.deepEqual(migrateNarrativeEvents({ '2034': [event(), event()] }), { '2034': [event()] });
  for (const raw of [
    null,
    [],
    { '2033': [event()] },
    { '2034': [{ ...event(), teamKey: 'unknown' }] },
    { '2034': [{ ...event(), round: -1 }] },
    { '2034': [{ ...event(), date: '2035-01-01' }] },
  ])
    assert.throws(() => migrateNarrativeEvents(raw), /corrupt/);
  assert.throws(
    () =>
      migrateNarrativeEvents({ '2034': [event(), { ...event(), playerName: 'conflicting name' }] }),
    /Conflicting/,
  );
  assert.equal(
    importSaveData(JSON.stringify({ ...save(), narrativeEvents: { '2034': [{}] } })),
    null,
  );
});

test('events live in year chunks, rehydrate/export with identical canonical articles, and old years are not rewritten', async () => {
  const { values, writes, backend } = memory();
  const data = save();
  data.narrativeEvents = appendNarrativeEvents({}, [event(2033), event(2034)]);
  assert.equal(await saveGameToSlot(data, 1, backend), true);
  const root = JSON.parse(values.get(SAVE_KEY(1))!);
  assert.deepEqual(root.current.narrativeEvents, {});
  assert.ok(!values.get(SAVE_KEY(1))!.includes('入団時の名前'));
  assert.deepEqual(JSON.parse(values.get(root.archive.seasons['2034'].key)!).narrativeEvents, [
    event(2034),
  ]);
  const loaded = (await loadGameFromSlot(1, backend))!;
  assert.deepEqual(loaded.narrativeEvents, data.narrativeEvents);
  assert.deepEqual(
    articleFromFutureEvent(loaded.narrativeEvents!['2034'][0]),
    articleFromFutureEvent(event()),
  );
  assert.deepEqual(importSaveData(exportSaveData(loaded))!.narrativeEvents, data.narrativeEvents);
  writes.length = 0;
  loaded.narrativeEvents = appendNarrativeEvents(loaded.narrativeEvents!, [event(2035)]);
  assert.equal(await saveGameToSlot(loaded, 1, backend), true);
  const next = JSON.parse(values.get(SAVE_KEY(1))!);
  assert.deepEqual(next.archive.seasons['2034'], root.archive.seasons['2034']);
  assert.ok(!writes.includes(root.archive.seasons['2034'].key));
  writes.length = 0;
  assert.equal(await saveGameToSlot((await loadGameFromSlot(1, backend))!, 1, backend), true);
  assert.ok(writes.every((k) => !k.includes('_season_')));
});

test('actual pre-ledger v4 chunks and v3 monolith migrate without fabricating history or rewriting old chunks', async () => {
  const { values, writes, backend } = memory();
  const old = save();
  delete old.narrativeEvents;
  old.championHistory = [{ year: 2033, champion: 'giants' }];
  values.set(SAVE_KEY(2), JSON.stringify(old));
  const v3 = (await loadGameFromSlot(2, backend))!;
  assert.deepEqual(v3.narrativeEvents, {});
  assert.equal(await saveGameToSlot(v3, 2, backend), true);
  const root = JSON.parse(values.get(SAVE_KEY(2))!);
  delete root.current.narrativeEvents;
  values.set(SAVE_KEY(2), JSON.stringify(root));
  const oldChunk = values.get(root.archive.seasons['2033'].key)!;
  assert.ok(!oldChunk.includes('narrativeEvents'));
  const v4 = (await loadGameFromSlot(2, backend))!;
  assert.deepEqual(v4.narrativeEvents, {});
  writes.length = 0;
  assert.equal(await saveGameToSlot(v4, 2, backend), true);
  assert.ok(!writes.includes(root.archive.seasons['2033'].key));
});

test('invalid but revision-consistent event chunks are corruption, and interrupted root writes retain the previous ledger', async () => {
  const { values, backend } = memory();
  const data = save();
  data.narrativeEvents = appendNarrativeEvents({}, [event()]);
  assert.equal(await saveGameToSlot(data, 1, backend), true);
  const rootRaw = values.get(SAVE_KEY(1))!;
  data.narrativeEvents = appendNarrativeEvents(data.narrativeEvents, [event(2035)]);
  const failing: StorageBackend = {
    get: backend.get,
    async set(k, v) {
      if (k === SAVE_KEY(1)) throw new Error('commit interrupted');
      await backend.set(k, v);
    },
  };
  assert.equal(await saveGameToSlot(data, 1, failing), false);
  assert.equal(values.get(SAVE_KEY(1)), rootRaw);
  assert.deepEqual((await loadGameFromSlot(1, backend))!.narrativeEvents, { '2034': [event()] });
  const root = JSON.parse(rootRaw);
  const chunk = JSON.parse(values.get(root.archive.seasons['2034'].key)!);
  chunk.narrativeEvents[0].year = 2035;
  const raw = JSON.stringify(chunk),
    revision = contentRevision(raw);
  const key = seasonArchiveKey(1, root.worldId, 2034, revision);
  values.set(key, raw);
  root.archive.seasons['2034'] = { key, revision };
  values.set(SAVE_KEY(1), JSON.stringify(root));
  await assert.rejects(() => loadGameFromSlot(1, backend), /corrupt/);
});

test('reload resumes an already committed postseason at the offseason instead of rerolling events', async () => {
  const { resumeSeasonScreen } = await import('../src/state/seasonProgress');
  const { generateSchedule } = await import('../src/engine');
  const data = save();
  data.season.schedule = generateSchedule(data.season.year).map((g) => ({
    ...g,
    played: true,
    hs: 1,
    as: 0,
  }));
  assert.equal(resumeSeasonScreen(data), 'postseason');
  data.championHistory.push({ year: data.season.year, champion: 'giants' });
  assert.equal(resumeSeasonScreen(data), 'offseason');
  data.season.year += 1;
  data.season.schedule = generateSchedule(data.season.year);
  assert.equal(resumeSeasonScreen(data), 'season');
});
