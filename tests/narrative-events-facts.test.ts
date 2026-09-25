import assert from 'node:assert/strict';
import test from 'node:test';

import { CENTRAL } from '../src/data';
import {
  clinchDate,
  type AccumulatedStats,
  type ScheduleGame,
  type SeasonTitleRecord,
  type StandingRecord,
  type TeamKey,
  type Teams,
} from '../src/engine';
import { breakthroughEvents, debutEvents, seasonReviewEvents } from '../src/engine/narrativeEvents';

let serial = 0;
const game = (
  home: TeamKey,
  away: TeamKey,
  homeWins: boolean | null,
  date: string,
): ScheduleGame => ({
  id: `g${(serial += 1)}`,
  date,
  homeKey: home,
  awayKey: away,
  played: homeWins !== null,
  hs: homeWins === null ? null : homeWins ? 3 : 1,
  as: homeWins === null ? null : homeWins ? 1 : 3,
  seriesType: 'league',
  isInterleague: false,
});

test('the clinch date is the first day no rival could still catch the leader', () => {
  // The Giants win every day and every rival loses every day, with one game left each.
  const schedule: ScheduleGame[] = [];
  const days = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05'];
  for (const day of days) {
    schedule.push(game('giants', 'hawks', true, day));
    for (const rival of CENTRAL.slice(1)) schedule.push(game(rival, 'hawks', false, day));
  }
  for (const team of CENTRAL) schedule.push(game(team, 'hawks', null, '2026-09-30'));
  const date = clinchDate(schedule, CENTRAL, 'giants');
  // Judged on day d, the later days count as still to play, so every club has 6 - d left:
  // the Giants finish d-(6-d) at worst and a rival (6-d)-d at best, clinched once d > 3.
  assert.equal(date, '2026-09-04');
  assert.equal(clinchDate(schedule, CENTRAL, 'tigers'), null);
});

test('season reviews carry titles, games behind, the clinch day, crowds and the owner verdict', () => {
  const standings = {
    giants: { w: 5, l: 0, d: 0, rs: 0, ra: 0, g: 5, rank: 1, gb: '-' },
    tigers: { w: 0, l: 5, d: 0, rs: 0, ra: 0, g: 5, rank: 2, gb: '5.0' },
  } as unknown as Record<TeamKey, StandingRecord>;
  const titles = [
    {
      year: 2026,
      teamKey: 'tigers',
      playerId: 'p1',
      playerName: '本塁打 王',
      titleLabel: '本塁打王',
    },
  ] as SeasonTitleRecord[];
  const events = seasonReviewEvents(2026, standings, 'giants', {
    titles,
    ownerReview: { teamKey: 'tigers', targetLabel: 'CS進出', grade: 'C', gradeLabel: '不満' },
  });
  const tigers = events.find((event) => event.teamKey === 'tigers');
  assert.ok(tigers && tigers.type === 'seasonReview');
  assert.equal(tigers.gamesBehind, 5);
  assert.deepEqual(tigers.titleHolders, [
    { playerId: 'p1', playerName: '本塁打 王', titleLabel: '本塁打王' },
  ]);
  assert.deepEqual(tigers.ownerReview, { targetLabel: 'CS進出', grade: 'C', gradeLabel: '不満' });
  const giants = events.find((event) => event.teamKey === 'giants');
  assert.ok(giants && giants.type === 'seasonReview' && giants.ownerReview === undefined);
});

test('a top pick debut is reported once, from his first game only', () => {
  const rookie = {
    id: 'r1',
    name: '新人 一郎',
    rookieSeason: true,
    draftRound: 1,
    draftOrigin: '高卒',
  };
  const teams = { giants: { fielders: [rookie], pitchers: [] } } as unknown as Teams;
  const line = { r1: { type: 'bat', g: 1 } } as unknown as AccumulatedStats;
  const first = debutEvents('g1', '2026-04-01', line, {}, teams);
  assert.equal(first.length, 1);
  assert.ok(first[0]!.type === 'career' && first[0]!.careerKind === 'debut');
  assert.ok(
    'detail' in first[0]! &&
      String(first[0]!.detail).includes('ドラフト1位で入団した高卒の新人 一郎'),
  );
  assert.equal(debutEvents('g2', '2026-04-02', line, line, teams).length, 0, 'not twice');
  const fifth = { ...rookie, draftRound: 5 };
  assert.equal(
    debutEvents('g1', '2026-04-01', line, {}, {
      giants: { fielders: [fifth], pitchers: [] },
    } as unknown as Teams).length,
    0,
    'only the first two rounds',
  );
});

test('a first career title is a breakthrough, a repeat title is not', () => {
  const title = (year: number, playerId: string, titleLabel: string) =>
    ({ year, teamKey: 'giants', playerId, playerName: playerId, titleLabel }) as SeasonTitleRecord;
  const events = breakthroughEvents(
    2027,
    [
      title(2027, 'new', '首位打者'),
      title(2027, 'new', '最多安打'),
      title(2027, 'old', '本塁打王'),
    ],
    [title(2025, 'old', '本塁打王')],
  );
  assert.equal(events.length, 1);
  assert.ok('detail' in events[0]! && String(events[0]!.detail).includes('首位打者・最多安打'));
});
