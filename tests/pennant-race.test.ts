import assert from 'node:assert/strict';
import test from 'node:test';

import { CENTRAL } from '../src/data';
import {
  magicLit,
  pennantRace,
  raceTimeline,
  type ScheduleGame,
  type TeamKey,
} from '../src/engine';

let serial = 0;
const game = (
  home: TeamKey,
  away: TeamKey,
  result: 'home' | 'away' | 'draw' | null,
  date = '2026-09-01',
): ScheduleGame => ({
  id: `g${(serial += 1)}`,
  date,
  homeKey: home,
  awayKey: away,
  played: result !== null,
  hs: result === null ? null : result === 'home' ? 3 : result === 'away' ? 1 : 2,
  as: result === null ? null : result === 'home' ? 1 : result === 'away' ? 3 : 2,
  seriesType: 'league',
  isInterleague: false,
});

/** `wins` wins and `losses` losses for `team`, against a club outside the league. */
const record = (team: TeamKey, wins: number, losses: number): ScheduleGame[] => [
  ...Array.from({ length: wins }, () => game(team, 'hawks', 'home')),
  ...Array.from({ length: losses }, () => game(team, 'hawks', 'away')),
];
const upcoming = (team: TeamKey, count: number): ScheduleGame[] =>
  Array.from({ length: count }, () => game(team, 'hawks', null));

const [giants, tigers, baystars, dragons, carp, swallows] = CENTRAL as [
  TeamKey,
  TeamKey,
  TeamKey,
  TeamKey,
  TeamKey,
  TeamKey,
];

test('the magic number counts the leader wins that settle the pennant', () => {
  // Giants 80-50 with 13 left; Tigers 75-55 with 13 left, none between them.
  // Tigers at best finish 88-55 (.615). Giants with x more wins: (80 + x) / (143) must beat
  // it: x = 9 gives 89-54 (.622); x = 8 gives 88-55, level on percentage and wins, not
  // enough. So the magic number is 9.
  const schedule = [
    ...record(giants, 80, 50),
    ...upcoming(giants, 13),
    ...record(tigers, 75, 55),
    ...upcoming(tigers, 13),
    ...record(baystars, 60, 70),
    ...upcoming(baystars, 13),
    ...record(dragons, 60, 70),
    ...upcoming(dragons, 13),
    ...record(carp, 55, 75),
    ...upcoming(carp, 13),
    ...record(swallows, 50, 80),
    ...upcoming(swallows, 13),
  ];
  const race = pennantRace(schedule, CENTRAL);
  assert.equal(race[giants].magic, 9);
  assert.equal(race[tigers].magic, null);
  assert.equal(magicLit(race[giants]), true);
  assert.equal(race[giants].clinchedPennant, false);
  assert.equal(race[swallows].eliminatedPennant, true, '63-80 at best cannot catch 80-63');
  assert.equal(race[tigers].eliminatedPennant, false);
});

test('head-to-head games count twice: each leader win there is also a rival loss', () => {
  // Same records, but all 13 of each club's remaining games are against each other.
  const schedule = [
    ...record(giants, 80, 50),
    ...record(tigers, 75, 55),
    ...Array.from({ length: 13 }, () => game(giants, tigers, null)),
    ...record(baystars, 60, 83),
    ...record(dragons, 60, 83),
    ...record(carp, 55, 88),
    ...record(swallows, 50, 93),
  ];
  const race = pennantRace(schedule, CENTRAL);
  // x wins over the Tigers: Giants (80 + x)-(63 - x); Tigers (88 - x)-(55 + x).
  // x = 5: 85-58 (.594) vs 83-60 (.580). x = 4: 84-59 (.587) vs 84-59, level. So 5.
  assert.equal(race[giants].magic, 5);
});

test('a club is clinched once no rival can catch it, and out once it cannot catch them', () => {
  const schedule = [
    ...record(giants, 90, 50),
    ...upcoming(giants, 3),
    ...record(tigers, 80, 60),
    ...upcoming(tigers, 3),
    ...record(baystars, 78, 62),
    ...upcoming(baystars, 3),
    ...record(dragons, 60, 80),
    ...upcoming(dragons, 3),
    ...record(carp, 55, 85),
    ...upcoming(carp, 3),
    ...record(swallows, 50, 90),
    ...upcoming(swallows, 3),
  ];
  const race = pennantRace(schedule, CENTRAL);
  assert.equal(race[giants].magic, 0);
  assert.equal(race[giants].clinchedPennant, true);
  assert.equal(race[giants].clinchedClimax, true);
  assert.equal(race[tigers].clinchedClimax, true, '83-60 at worst is out of reach for 4th');
  assert.equal(race[baystars].clinchedClimax, true);
  assert.equal(race[dragons].eliminatedClimax, true);
  assert.equal(race[dragons].eliminatedPennant, true);
});

test('the magic number stays dark early in the season', () => {
  const schedule = [
    ...record(giants, 5, 0),
    ...upcoming(giants, 138),
    ...CENTRAL.slice(1).flatMap((team) => [...record(team, 2, 3), ...upcoming(team, 138)]),
  ];
  const race = pennantRace(schedule, CENTRAL);
  assert.equal(magicLit(race[giants]), false);
});

test('the race timeline has the games behind the leader after each day', () => {
  const schedule = [
    game(giants, tigers, 'home', '2026-04-01'),
    game(baystars, dragons, 'home', '2026-04-01'),
    game(carp, swallows, 'draw', '2026-04-01'),
    game(tigers, giants, 'home', '2026-04-02'),
    game(tigers, giants, 'home', '2026-04-03'),
  ];
  const timeline = raceTimeline(schedule, CENTRAL);
  assert.deepEqual(
    timeline.map((point) => point.date),
    ['2026-04-01', '2026-04-02', '2026-04-03'],
  );
  assert.equal(timeline[0]!.gamesBehind[giants], 0);
  assert.equal(timeline[0]!.gamesBehind[tigers], 1);
  // Day three: DeNA lead at 1-0; the Tigers (2-1) are level, the Giants (1-2) one back.
  assert.equal(timeline[2]!.gamesBehind[baystars], 0);
  assert.equal(timeline[2]!.gamesBehind[tigers], 0);
  assert.equal(timeline[2]!.gamesBehind[giants], 1);
});
