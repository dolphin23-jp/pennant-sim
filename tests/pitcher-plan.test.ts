import assert from 'node:assert/strict';
import test from 'node:test';

import {
  configureRandom,
  generateSchedule,
  initTeams,
  resetRandom,
  resolveStarterRotation,
  selectCloserByPriority,
  skipGames,
  skipGamesWithPitcherPlan,
  topStarters,
} from '../src/engine';
import { migrateSaveData } from '../src/state/storage';

function seededRandom(initialSeed: number): () => number {
  let seed = initialSeed >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

test('legacy saves migrate with an empty pitcher plan', () => {
  configureRandom(seededRandom(10), () => 1_000);
  const teams = initTeams();
  const migrated = migrateSaveData({ teams });
  resetRandom();
  assert.deepEqual(migrated?.pitcherPlan, { rotationOrder: [], closerPriority: [] });
});

test('pitcher plan migration preserves valid string ids and removes invalid entries', () => {
  configureRandom(seededRandom(11), () => 1_000);
  const teams = initTeams();
  const migrated = migrateSaveData({
    teams,
    pitcherPlan: {
      rotationOrder: ['starter-1', 42, 'starter-2'],
      closerPriority: ['closer-1', null],
    },
  });
  resetRandom();
  assert.deepEqual(migrated?.pitcherPlan, {
    rotationOrder: ['starter-1', 'starter-2'],
    closerPriority: ['closer-1'],
  });
});

test('empty rotation order exactly preserves automatic starter ordering', () => {
  configureRandom(seededRandom(20), () => 2_000);
  const team = initTeams().giants;
  resetRandom();
  assert.deepEqual(
    resolveStarterRotation(team, []).map((pitcher) => pitcher.id),
    topStarters(team).map((pitcher) => pitcher.id),
  );
});

test('specified starters are prioritized and invalid ids fall back to automatic ordering', () => {
  configureRandom(seededRandom(21), () => 2_000);
  const team = initTeams().tigers;
  resetRandom();
  const automatic = topStarters(team);
  const lastAutomatic = automatic.at(-1);
  assert.ok(lastAutomatic);
  const resolved = resolveStarterRotation(team, ['missing-id', lastAutomatic.id]);
  assert.equal(resolved[0]?.id, lastAutomatic.id);
  assert.equal(new Set(resolved.map((pitcher) => pitcher.id)).size, resolved.length);
  assert.ok(resolved.some((pitcher) => pitcher.id === automatic[0]?.id));
});

test('closer priority uses the highest available configured closer and otherwise preserves array order', () => {
  configureRandom(seededRandom(22), () => 2_000);
  const team = initTeams().hawks;
  resetRandom();
  const closers = team.pitchers.filter((pitcher) => pitcher.role === 'クローザー');
  assert.ok(closers.length > 0);
  assert.equal(selectCloserByPriority(closers, [])?.id, closers[0]?.id);
  if (closers.length > 1) {
    assert.equal(selectCloserByPriority(closers, [closers[1]!.id])?.id, closers[1]?.id);
  }
  assert.equal(selectCloserByPriority(closers, ['missing-id'])?.id, closers[0]?.id);
});

test('empty pitcher plans keep skip simulation byte-for-byte equivalent to the legacy path', () => {
  configureRandom(seededRandom(30), () => 3_000);
  const originalTeams = initTeams();
  const schedule = generateSchedule(2026, { rainoutRate: 0, maxRainouts: 0 });
  resetRandom();
  const firstGame = schedule[0];
  assert.ok(firstGame);
  const legacyTeams = structuredClone(originalTeams);
  const plannedTeams = structuredClone(originalTeams);
  const rotations = Object.fromEntries(
    Object.keys(originalTeams).map((teamKey) => [teamKey, 0]),
  ) as Parameters<typeof skipGames>[2];

  configureRandom(seededRandom(31), () => 3_100);
  const legacy = skipGames(
    structuredClone(schedule),
    legacyTeams,
    { ...rotations },
    firstGame.homeKey,
    'next',
    {},
  );
  configureRandom(seededRandom(31), () => 3_100);
  const planned = skipGamesWithPitcherPlan(
    structuredClone(schedule),
    plannedTeams,
    { ...rotations },
    firstGame.homeKey,
    'next',
    {},
    { rotationOrder: [], closerPriority: [] },
  );
  resetRandom();

  assert.deepEqual(planned, legacy);
  assert.deepEqual(plannedTeams, legacyTeams);
});
