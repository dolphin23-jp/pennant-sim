import assert from 'node:assert/strict';
import test from 'node:test';

import { configureRandom, initTeams, resetRandom } from '../src/engine';
import type { PostGameEvents } from '../src/engine';
import {
  createInSeasonDevelopmentNotices,
  createOffseasonDevelopmentNotices,
  createSkippedInSeasonDevelopmentNotices,
  mergeNotices,
} from '../src/state/notices';
import { migrateSaveData } from '../src/state/storage';

function seededRandom(initialSeed: number): () => number {
  let seed = initialSeed >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

function initializedTeams(seed = 1) {
  configureRandom(seededRandom(seed), () => 1_000);
  const teams = initTeams();
  resetRandom();
  return teams;
}

test('in-season awakening notices include localized boosts, breakthrough, and a new special', () => {
  const events: PostGameEvents = {
    awakenings: [
      {
        teamKey: 'giants',
        playerId: 'player-1',
        name: 'テスト選手',
        isP: false,
        isBreakthrough: true,
        newSpecial: '勝負強さ',
        changes: [
          { param: 'pw', boost: 12 },
          { param: 'dc', boost: 8 },
        ],
      },
    ],
    injuries: [],
  };

  const notices = createInSeasonDevelopmentNotices(events, 'giants', '2026-05-01');
  assert.equal(notices.length, 1);
  assert.equal(notices[0]?.title, '限界突破！ テスト選手');
  assert.match(notices[0]?.body ?? '', /長打力 \+12/);
  assert.match(notices[0]?.body ?? '', /選球眼 \+8/);
  assert.match(notices[0]?.body ?? '', /勝負強さ/);
  assert.equal(notices[0]?.playerId, 'player-1');
});

test('skipped-game notices detect only awakening logs added after the skip', () => {
  const teams = initializedTeams(2);
  const beforeTeam = structuredClone(teams.giants);
  const afterTeam = structuredClone(teams.giants);
  const player = afterTeam.fielders[0];
  assert.ok(player);
  player.growthLog = [
    ...(player.growthLog ?? []),
    {
      year: player.age,
      type: 'awakening',
      isBreakthrough: false,
      events: [{ param: 'sp', boost: 9 }],
      newSpecial: null,
    },
  ];

  const notices = createSkippedInSeasonDevelopmentNotices(
    beforeTeam,
    afterTeam,
    'giants',
    '2026-06-15',
  );
  assert.equal(notices.length, 1);
  assert.equal(notices[0]?.title, `覚醒！ ${player.name}`);
  assert.match(notices[0]?.body ?? '', /走力 \+9/);

  const duplicateCheck = createSkippedInSeasonDevelopmentNotices(
    afterTeam,
    afterTeam,
    'giants',
    '2026-06-15',
  );
  assert.deepEqual(duplicateCheck, []);
});

test('offseason notices include major OVR changes and awakening details', () => {
  const teams = initializedTeams(3);
  const originalTeam = structuredClone(teams.tigers);
  const grownTeam = structuredClone(teams.tigers);
  const player = grownTeam.fielders[0];
  assert.ok(player);

  const changes = [
    { param: 'cf' as const, before: player.p.cf ?? 50, after: (player.p.cf ?? 50) + 12, diff: 12 },
    { param: 'cb' as const, before: player.p.cb ?? 50, after: (player.p.cb ?? 50) + 12, diff: 12 },
    { param: 'pw' as const, before: player.p.pw ?? 50, after: (player.p.pw ?? 50) + 12, diff: 12 },
    { param: 'dc' as const, before: player.p.dc ?? 50, after: (player.p.dc ?? 50) + 12, diff: 12 },
  ];
  player.p = {
    ...player.p,
    cf: changes[0].after,
    cb: changes[1].after,
    pw: changes[2].after,
    dc: changes[3].after,
  };
  player.growthLog = [
    ...(player.growthLog ?? []),
    { year: 2026, changes, ovrBefore: 50, ovrAfter: 60, delta: 10 },
  ];

  const notices = createOffseasonDevelopmentNotices(
    originalTeam,
    grownTeam,
    [
      {
        tk: 'tigers',
        name: player.name,
        player,
        events: [{ param: 'arm', boost: 10 }],
        isBreakthrough: true,
        newSpecial: { id: 'test', n: '鉄砲肩', c: '#fff', p: 1, tierMax: 1, rarity: 'normal' },
      },
    ],
    'tigers',
    2026,
  );

  assert.ok(notices.some((notice) => notice.kind === 'growth' && notice.playerId === player.id));
  assert.ok(
    notices.some(
      (notice) =>
        notice.kind === 'awakening' &&
        notice.body.includes('肩力 +10') &&
        notice.body.includes('鉄砲肩'),
    ),
  );
});

test('legacy notices receive stable ids and structured defaults during save migration', () => {
  const teams = initializedTeams(4);
  const migrated = migrateSaveData({
    teams,
    notices: [{ title: '旧通知', body: '本文', tone: 'good', date: '2025年' }],
  });
  assert.ok(migrated);
  assert.equal(migrated.notices.length, 1);
  assert.match(migrated.notices[0]?.id ?? '', /^legacy:0:/);
  assert.equal(migrated.notices[0]?.kind, 'system');
});

test('mergeNotices removes duplicate ids and caps history', () => {
  const current = [
    { id: 'same', title: 'old', body: 'old' },
    { id: 'second', title: 'second', body: 'second' },
  ];
  const incoming = [{ id: 'same', title: 'new', body: 'new' }];
  const merged = mergeNotices(current, incoming, 2);
  assert.deepEqual(
    merged.map((notice) => notice.title),
    ['new', 'second'],
  );
});
