import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyDraftPicks,
  buildDraftProspectSnapshot,
  buildDraftProspectSnapshotMap,
  configureRandom,
  generateDraftProspects,
  initTeams,
  random,
  resetRandom,
  runCpuDraft,
  type Player,
} from '../src/engine';
import {
  appendNarrativeEvents,
  migrateNarrativeEvents,
  type NarrativeEvent,
  type NarrativeEventContext,
} from '../src/narrative';

function seeded(seed = 73) {
  let value = seed;
  configureRandom(
    () => {
      value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
      return value / 2 ** 32;
    },
    () => 1700000000000,
  );
}

function prospect(id: string, name: string, power: number): Player {
  return {
    id,
    name,
    age: 18,
    tk: 'giants',
    isP: false,
    pos: '右翼手',
    positions: [{ pos: '右翼手', apt: 100 }],
    mat: '通常',
    hand: { th: '右', bat: '右' },
    p: {
      stam: 45,
      cf: 50,
      cb: 48,
      pw: power,
      dc: 51,
      sp: 47,
      df: 46,
      arm: 49,
      bnt: 30,
    },
    pot: { pw: power + 15, cf: 62 },
    trainPolicy: 'balanced',
    draftOrigin: '高卒',
  };
}

test('draft prospect snapshot freezes full-pool evaluation without mutation', () => {
  const selected = prospect('draft-b', '候補 二郎', 64);
  const pool = [prospect('draft-a', '候補 一郎', 82), selected, prospect('draft-c', '候補 三郎', 50)];
  const before = structuredClone(pool);

  const snapshot = buildDraftProspectSnapshot(selected, pool);

  assert.ok(snapshot);
  assert.equal(snapshot.playerId, selected.id);
  assert.equal(snapshot.poolSize, 3);
  assert.equal(snapshot.poolRank, 2);
  assert.equal(snapshot.currentOverall > 0, true);
  assert.equal(snapshot.strongestSkill.label, '長打力');
  assert.equal(snapshot.materialPotentialGap.threshold, 12);
  assert.deepEqual(pool, before);
  assert.deepEqual(buildDraftProspectSnapshotMap(pool).get(selected.id), snapshot);
});

test('interactive draft events persist the exact original-pool prospect snapshot', () => {
  const teams = initTeams();
  const selected = prospect('draft-selected', '候補 選手', 72);
  const pool = [prospect('draft-top', '候補 首位', 88), selected, prospect('draft-low', '候補 下位', 45)];
  const events: NarrativeEvent[] = [];
  const context: NarrativeEventContext = {
    year: 2034,
    date: '2034年オフ',
    emit: (event) => events.push(event),
  };

  applyDraftPicks(teams, [{ ...selected, teamKey: 'giants', round: 2 }], context, pool);

  assert.equal(events.length, 1);
  const event = events[0];
  assert.equal(event.type, 'draft');
  if (event.type !== 'draft') return;
  assert.deepEqual(event.prospectSnapshot, buildDraftProspectSnapshot(selected, pool));

  const ledger = appendNarrativeEvents({}, events);
  assert.deepEqual(migrateNarrativeEvents(ledger), ledger);

  const legacy = structuredClone(ledger);
  if (legacy['2034'][0].type === 'draft') delete legacy['2034'][0].prospectSnapshot;
  assert.deepEqual(migrateNarrativeEvents(legacy), legacy);

  const broken = structuredClone(ledger);
  if (broken['2034'][0].type === 'draft' && broken['2034'][0].prospectSnapshot)
    broken['2034'][0].prospectSnapshot.playerId = 'different-player';
  assert.throws(() => migrateNarrativeEvents(broken), /corrupted/);
});

test('CPU draft emits snapshots for every selected player', () => {
  seeded(91);
  try {
    const events: NarrativeEvent[] = [];
    const context: NarrativeEventContext = {
      year: 2034,
      date: '2034年オフ',
      emit: (event) => events.push(event),
    };
    runCpuDraft(initTeams(), 6, context);
    const drafts = events.filter((event) => event.type === 'draft');
    assert.equal(drafts.length, 72);
    assert.ok(drafts.every((event) => event.prospectSnapshot?.playerId === event.playerId));
    assert.ok(drafts.every((event) => event.prospectSnapshot?.poolSize === 96));
  } finally {
    resetRandom();
  }
});

test('building draft snapshots consumes no simulation RNG draws', () => {
  const run = (withSnapshot: boolean) => {
    seeded(119);
    const pool = generateDraftProspects();
    if (withSnapshot) buildDraftProspectSnapshotMap(pool);
    const next = random();
    resetRandom();
    return next;
  };
  assert.equal(run(true), run(false));
});
