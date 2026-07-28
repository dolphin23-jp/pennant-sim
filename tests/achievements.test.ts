import assert from 'node:assert/strict';
import test from 'node:test';

import { detectAchievements, initTeams } from '../src/engine/index.ts';
import type { AccumulatedStats, BatterStats, PitcherStats, YearlyPlayerRecords } from '../src/engine/index.ts';

const batterLine = (name: string, overrides: Partial<BatterStats> = {}): BatterStats => ({
  type: 'bat', name, g: 143, pa: 600, ab: 540, h: 0, s: 0, d: 0, t: 0,
  hr: 0, bb: 52, k: 80, rbi: 0, sb: 0, cs: 4, bnt: 3, sf: 5, ...overrides,
});

const pitcherLine = (name: string, overrides: Partial<PitcherStats> = {}): PitcherStats => ({
  type: 'pit', name, g: 25, gs: 25, w: 0, l: 5, sv: 0, hld: 0, bs: 0,
  ip3: 450, h: 120, bb: 30, k: 0, er: 40, pc: 2200, ...overrides,
});

test('career milestone: crossing 2000 hits fires once per 1000-hit threshold crossed', () => {
  const teams = initTeams();
  const player = teams.giants.fielders[0];
  const before: AccumulatedStats = { [player.id]: batterLine(player.name, { h: 1950 }) };
  const after: AccumulatedStats = { [player.id]: batterLine(player.name, { h: 3200 }) };

  const events = detectAchievements({
    year: 2030,
    date: '2030-06-01',
    teams,
    beforeSeasonStats: {},
    afterSeasonStats: {},
    beforeCareerStats: before,
    afterCareerStats: after,
    yearlyStats: {},
  });

  const milestones = events.filter((event) => event.kind === 'milestone' && event.playerId === player.id);
  assert.equal(milestones.length, 2, '2000本と3000本の2つの節目を跨いだはず');
  assert.deepEqual(
    milestones.map((event) => event.value).sort((a, b) => a - b),
    [2000, 3000],
  );
});

test('career milestone: does not fire below the starting threshold', () => {
  const teams = initTeams();
  const player = teams.giants.fielders[0];
  const before: AccumulatedStats = { [player.id]: batterLine(player.name, { h: 1000 }) };
  const after: AccumulatedStats = { [player.id]: batterLine(player.name, { h: 1500 }) };

  const events = detectAchievements({
    year: 2030,
    date: '2030-06-01',
    teams,
    beforeSeasonStats: {},
    afterSeasonStats: {},
    beforeCareerStats: before,
    afterCareerStats: after,
    yearlyStats: {},
  });

  assert.equal(events.filter((event) => event.kind === 'milestone').length, 0);
});

test('season record: fires once when a player breaks the all-time single-season mark, and never again after', () => {
  const teams = initTeams();
  const legend = teams.giants.fielders[0];
  const challenger = teams.tigers.fielders[0];

  // A single-season record is only meaningful measured against real history - the best
  // any player has ever done in one completed season - never against a same-season
  // contemporary. Comparing against contemporaries instead meant that on a brand-new
  // save, where nobody has a season on record yet, nearly every regular player would
  // trivially "break the record" just by clearing the floor (caught live: ~270 false
  // positives in a single fresh season). See bestSingleSeasonValue in achievements.ts.
  const yearlyStats: YearlyPlayerRecords = {
    '2029': [
      {
        playerId: legend.id,
        playerName: legend.name,
        year: 2029,
        age: legend.age,
        teamKey: 'giants',
        teamName: teams.giants.n,
        teamAbbreviation: teams.giants.ab,
        isPitcher: false,
        ovr: 80,
        params: {},
        stats: batterLine(legend.name, { hr: 22 }),
      },
    ],
  };

  const beforeSeason: AccumulatedStats = { [challenger.id]: batterLine(challenger.name, { hr: 18 }) };
  const afterSeason: AccumulatedStats = { [challenger.id]: batterLine(challenger.name, { hr: 25 }) };

  const firstPass = detectAchievements({
    year: 2030,
    date: '2030-08-01',
    teams,
    beforeSeasonStats: beforeSeason,
    afterSeasonStats: afterSeason,
    beforeCareerStats: {},
    afterCareerStats: {},
    yearlyStats,
  });
  const seasonRecords = firstPass.filter(
    (event) => event.kind === 'seasonRecord' && event.playerId === challenger.id && event.metricLabel === '本塁打',
  );
  assert.equal(seasonRecords.length, 1, '史上最多を上回った瞬間に一度だけ発生するはず');
  assert.equal(seasonRecords[0]?.previousValue, 22);
  assert.equal(seasonRecords[0]?.previousHolderName, legend.name);

  // Simulate the next game: the challenger pulls further ahead, but the record was
  // already broken, so it must not fire a second time for the same metric.
  const secondPass = detectAchievements({
    year: 2030,
    date: '2030-08-02',
    teams,
    beforeSeasonStats: afterSeason,
    afterSeasonStats: { [challenger.id]: batterLine(challenger.name, { hr: 26 }) },
    beforeCareerStats: {},
    afterCareerStats: {},
    yearlyStats,
  });
  assert.equal(
    secondPass.filter((event) => event.kind === 'seasonRecord' && event.playerId === challenger.id).length,
    0,
    '同じ記録更新が毎試合再通知されてはいけない',
  );
});

test('season record: a brand-new save with no season history yet never fires (no false "first year" flood)', () => {
  const teams = initTeams();
  const events = detectAchievements({
    year: 2026,
    date: '2026-10-01',
    teams,
    beforeSeasonStats: {},
    afterSeasonStats: Object.fromEntries(
      [...teams.giants.fielders, ...teams.tigers.fielders].map((player) => [
        player.id,
        batterLine(player.name, { hr: 30, h: 150, rbi: 90, sb: 25 }),
      ]),
    ),
    beforeCareerStats: {},
    afterCareerStats: {},
    yearlyStats: {},
  });
  assert.equal(
    events.filter((event) => event.kind === 'seasonRecord').length,
    0,
    '過去シーズンの記録が一つもない状態では、誰の成績も「新記録」として扱われてはいけない',
  );
});

test('season record: stays silent below the celebration floor even with no rival on record', () => {
  const teams = initTeams();
  const player = teams.giants.fielders[0];
  const events = detectAchievements({
    year: 2026,
    date: '2026-04-05',
    teams,
    beforeSeasonStats: {},
    afterSeasonStats: { [player.id]: batterLine(player.name, { hr: 3 }) },
    beforeCareerStats: {},
    afterCareerStats: {},
    yearlyStats: {},
  });
  assert.equal(
    events.filter((event) => event.kind === 'seasonRecord').length,
    0,
    '開幕直後の少ない本数がリーグ新記録として通知されてはいけない',
  );
});

test('career record: compares against frozen prior-season totals and fires once', () => {
  const teams = initTeams();
  const ace = teams.hawks.pitchers[0];
  const rival = teams.lions.pitchers[0];

  const yearlyStats: YearlyPlayerRecords = {
    '2029': [
      {
        playerId: rival.id,
        playerName: rival.name,
        year: 2029,
        age: rival.age,
        teamKey: 'lions',
        teamName: teams.lions.n,
        teamAbbreviation: teams.lions.ab,
        isPitcher: true,
        ovr: 80,
        params: {},
        stats: pitcherLine(rival.name, { w: 210 }),
      },
      {
        playerId: ace.id,
        playerName: ace.name,
        year: 2029,
        age: ace.age,
        teamKey: 'hawks',
        teamName: teams.hawks.n,
        teamAbbreviation: teams.hawks.ab,
        isPitcher: true,
        ovr: 80,
        params: {},
        stats: pitcherLine(ace.name, { w: 190 }),
      },
    ],
  };

  const events = detectAchievements({
    year: 2030,
    date: '2030-09-01',
    teams,
    beforeSeasonStats: {},
    afterSeasonStats: {},
    beforeCareerStats: {},
    afterCareerStats: { [ace.id]: pitcherLine(ace.name, { w: 215 }) },
    yearlyStats,
  });

  const careerRecords = events.filter((event) => event.kind === 'careerRecord' && event.playerId === ace.id);
  assert.equal(careerRecords.length, 1);
  assert.equal(careerRecords[0]?.previousValue, 210);
  assert.equal(careerRecords[0]?.previousHolderName, rival.name);
});
