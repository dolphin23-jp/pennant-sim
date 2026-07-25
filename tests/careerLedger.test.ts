import assert from 'node:assert/strict';
import test from 'node:test';

import { createPlayerSeasonRecords, initTeams } from '../src/engine/index.ts';
import type { BatterStats } from '../src/engine/index.ts';
import { migrateSaveData } from '../src/state/storage.ts';

const batterLine = (name: string): BatterStats => ({
  type: 'bat', name, g: 143, pa: 600, ab: 540, h: 162, s: 120, d: 30, t: 2,
  hr: 10, bb: 52, k: 80, rbi: 70, sb: 12, cs: 4, bnt: 3, sf: 5,
});

test('年度台帳は所属・年齢・能力・成績を独立したスナップショットとして保存する', () => {
  const teams = initTeams();
  const player = teams.giants.fielders[0];
  const originalContact = player.p.cf;
  const records = createPlayerSeasonRecords(2026, teams, { [player.id]: batterLine(player.name) });
  const record = records.find((entry) => entry.playerId === player.id);

  assert.ok(record);
  assert.equal(record.year, 2026);
  assert.equal(record.age, player.age);
  assert.equal(record.teamKey, 'giants');
  assert.equal(record.teamName, teams.giants.n);
  assert.equal(record.stats.type, 'bat');
  assert.equal(record.stats.hr, 10);
  assert.equal(record.params.cf, originalContact);

  player.age += 1;
  player.p.cf = Number(player.p.cf ?? 0) + 10;
  teams.giants.n = '変更後球団名';

  assert.notEqual(record.age, player.age);
  assert.equal(record.params.cf, originalContact);
  assert.notEqual(record.teamName, teams.giants.n);
});

test('出場のない選手もゼロ成績で年度台帳へ残る', () => {
  const teams = initTeams();
  const player = teams.tigers.pitchers[0];
  const record = createPlayerSeasonRecords(2026, teams, {}).find((entry) => entry.playerId === player.id);

  assert.ok(record);
  assert.equal(record.stats.type, 'pit');
  assert.equal(record.stats.g, 0);
  assert.equal(record.stats.ip3, 0);
});

test('旧セーブの不定形yearlyStatsは安全に除外し、正式台帳は保持する', () => {
  const teams = initTeams();
  const player = teams.carp.fielders[0];
  const [record] = createPlayerSeasonRecords(2026, teams, { [player.id]: batterLine(player.name) })
    .filter((entry) => entry.playerId === player.id);

  const migrated = migrateSaveData({
    teams,
    playerTeam: 'carp',
    season: { year: 2027, schedule: [] },
    yearlyStats: { '2025': [{ legacy: true }], '2026': [record] },
  });

  assert.ok(migrated);
  assert.deepEqual(migrated.yearlyStats['2025'], []);
  assert.equal(migrated.yearlyStats['2026'][0]?.playerId, player.id);
});
