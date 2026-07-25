import assert from 'node:assert/strict';
import test from 'node:test';

import { buildHistoricalRanking } from '../src/engine/historicalRankings';
import type { BatterStats, PlayerSeasonRecord, PitcherStats, TeamKey, YearlyPlayerRecords } from '../src/engine/types';

const batter = (name: string, hr: number, h = 100, ab = 400): BatterStats => ({
  type: 'bat', name, g: 100, pa: ab + 40, ab, h, s: Math.max(0, h - hr), d: 0, t: 0,
  hr, bb: 40, k: 80, rbi: hr * 3, sb: 5, cs: 2, bnt: 0, sf: 0,
});

const pitcher = (name: string, w: number, er: number, ip3 = 450): PitcherStats => ({
  type: 'pit', name, g: 25, gs: 25, w, l: 5, sv: 0, hld: 0, bs: 0,
  ip3, h: 120, bb: 30, k: 140, er, pc: 2200,
});

function record(
  playerId: string,
  year: number,
  age: number,
  teamKey: TeamKey,
  stats: BatterStats | PitcherStats,
): PlayerSeasonRecord {
  return {
    playerId,
    playerName: stats.name,
    year,
    age,
    teamKey,
    teamName: teamKey,
    teamAbbreviation: teamKey.slice(0, 2),
    isPitcher: stats.type === 'pit',
    ovr: 80,
    params: { stam: 70 },
    stats,
  };
}

const yearly: YearlyPlayerRecords = {
  '2026': [
    record('slugger', 2026, 25, 'giants', batter('強打者', 30)),
    record('rival', 2026, 27, 'tigers', batter('好敵手', 35)),
    record('ace', 2026, 26, 'giants', pitcher('エース', 12, 35)),
  ],
  '2027': [
    record('slugger', 2027, 26, 'tigers', batter('強打者', 40)),
    record('rival', 2027, 28, 'tigers', batter('好敵手', 20)),
    record('ace', 2027, 27, 'giants', pitcher('エース', 15, 25)),
  ],
};

test('season rankings preserve the achieved year and team', () => {
  const ranking = buildHistoricalRanking(yearly, {
    scope: 'season',
    metric: 'homeRuns',
    activePlayerIds: new Set(['slugger']),
  });
  assert.equal(ranking[0]?.playerId, 'slugger');
  assert.equal(ranking[0]?.value, 40);
  assert.equal(ranking[0]?.year, 2027);
  assert.equal(ranking[0]?.teamKey, 'tigers');
  assert.equal(ranking[0]?.isActive, true);
  assert.equal(ranking[1]?.isActive, false);
});

test('career rankings aggregate seasons by stable player id', () => {
  const ranking = buildHistoricalRanking(yearly, { scope: 'career', metric: 'homeRuns' });
  assert.equal(ranking[0]?.playerId, 'slugger');
  assert.equal(ranking[0]?.value, 70);
  assert.equal(ranking[0]?.seasons, 2);
  assert.equal(ranking[0]?.year, 2027);
  assert.equal(ranking[1]?.value, 55);
});

test('team career rankings count only records accumulated for that team', () => {
  const ranking = buildHistoricalRanking(yearly, {
    scope: 'career',
    metric: 'homeRuns',
    teamKey: 'tigers',
  });
  assert.equal(ranking[0]?.playerId, 'rival');
  assert.equal(ranking[0]?.value, 55);
  assert.equal(ranking[1]?.playerId, 'slugger');
  assert.equal(ranking[1]?.value, 40);
  assert.equal(ranking[1]?.seasons, 1);
});

test('lower ERA ranks first without imposing a record cap', () => {
  const ranking = buildHistoricalRanking(yearly, { scope: 'season', metric: 'era' });
  assert.equal(ranking[0]?.playerId, 'ace');
  assert.equal(ranking[0]?.year, 2027);
  assert.ok((ranking[0]?.value ?? 99) < (ranking[1]?.value ?? 0));
});
