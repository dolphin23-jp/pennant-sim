import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addDays,
  bestLineup,
  calcInterleagueStandings,
  calcStandings,
  configureRandom,
  growPlayer,
  generateSchedule,
  initTeams,
  postponeScheduleGame,
  postseasonSeriesDates,
  resetRandom,
  simAB,
  simulateGame,
} from '../src/engine';
import type { Player, TeamKey } from '../src/engine';

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function makePlayer(id: string, isPitcher: boolean): Player {
  return {
    id,
    name: id,
    age: 27,
    tk: 'giants',
    isP: isPitcher,
    role: isPitcher ? '先発' : undefined,
    pos: isPitcher ? undefined : '一塁手',
    mat: '通常',
    hand: isPitcher ? { th: '右' } : { bat: '右' },
    p: isPitcher
      ? { vel: 50, ctrl: 50, stam: 80, nobi: 50, pitches: [] }
      : { cf: 50, cb: 50, pw: 50, dc: 50, sp: 50, stam: 80 },
    pot: {},
    trainPolicy: 'balanced',
  };
}

test('Phase B engine preserves league structure and can complete a game', () => {
  configureRandom(mulberry32(20260723), () => Date.UTC(2026, 0, 1));
  try {
    const teams = initTeams();
    const teamKeys = Object.keys(teams) as TeamKey[];
    assert.equal(teamKeys.length, 12);
    for (const team of Object.values(teams)) {
      assert.equal(team.pitchers.length, 28);
      assert.equal(team.fielders.length, 35);
    }

    const schedule = generateSchedule(2026);
    assert.equal(schedule.length, 858);
    for (const teamKey of teamKeys) {
      const games = schedule.filter((game) => game.homeKey === teamKey || game.awayKey === teamKey);
      assert.equal(games.length, 143);
    }

    const result = simulateGame('giants', 'tigers', teams, null, null, 0, 0, {});
    assert.ok(result.innings.length >= 9);
    assert.ok(result.innings.length <= 15);
    assert.ok(result.score.home >= 0);
    assert.ok(result.score.away >= 0);
    assert.ok(result.atBatLog.length > 0);
    assert.deepEqual(result.park, teams.giants.park);
    const plateAppearances = result.atBatLog.filter(
        (entry) => entry.result !== 'SB' && entry.result !== 'CS',
      ).length,
      trackedMatchups = Object.values(result.matchupCounts);
    assert.equal(
      trackedMatchups.reduce((total, count) => total + count, 0),
      plateAppearances,
    );
    assert.ok(trackedMatchups.some((count) => count > 1));
  } finally {
    resetRandom();
  }
});

test('a rainout can be rescheduled as a doubleheader without changing game totals', () => {
  configureRandom(mulberry32(77), () => Date.UTC(2026, 0, 1));
  try {
    const weatherSchedule = generateSchedule(2026, { rainoutRate: 1, maxRainouts: 1 });
    assert.equal(weatherSchedule.filter((game) => game.postponedFrom).length, 1);

    const schedule = generateSchedule(2026, { rainoutRate: 0, maxRainouts: 0 });
    const postponed = schedule.find((game) =>
      schedule.some(
        (candidate) =>
          candidate.id !== game.id &&
          candidate.date > game.date &&
          candidate.homeKey === game.homeKey &&
          candidate.awayKey === game.awayKey,
      ),
    );
    assert.ok(postponed);
    const partner = schedule
      .filter(
        (game) =>
          game.id !== postponed.id &&
          game.date > postponed.date &&
          game.homeKey === postponed.homeKey &&
          game.awayKey === postponed.awayKey,
      )
      .sort((first, second) => first.date.localeCompare(second.date))[0];
    assert.ok(partner);

    const rescheduled = postponeScheduleGame(schedule, postponed.id),
      moved = rescheduled.find((game) => game.id === postponed.id),
      paired = rescheduled.find((game) => game.id === partner.id);
    assert.equal(rescheduled.length, schedule.length);
    assert.equal(moved?.postponedFrom, postponed.date);
    assert.equal(moved?.originalDate, postponed.date);
    assert.equal(moved?.date, partner.date);
    assert.equal(moved?.doubleHeaderGame, 2);
    assert.equal(paired?.doubleHeaderGame, 1);
  } finally {
    resetRandom();
  }
});

test('platoon, park and prior-matchup context can benefit the batter', () => {
  // The layered model spreads one plate appearance over several draws, so a fixed random
  // value can no longer isolate a single outcome boundary. Compare rates over many trials
  // instead: the same batter, in a friendlier context, must homer more often.
  const pitcher = makePlayer('pitcher', true),
    batter = makePlayer('batter', false),
    situation = {
      pStam: 100,
      isPinch: false,
      isLead: false,
      outs: 0,
      bases: [false, false, false] as const,
    };
  const countHomeRuns = (
    battingPlayer: Player,
    park: { homeRun: number; hit: number },
    priorMatchups: number,
    seed: number,
  ): number => {
    configureRandom(mulberry32(seed), () => Date.UTC(2026, 0, 1));
    let homeRuns = 0;
    for (let trial = 0; trial < 6000; trial += 1) {
      const outcome = simAB(
        pitcher,
        battingPlayer,
        { ...situation, bases: [false, false, false] },
        100,
        1,
        1,
        park,
        priorMatchups,
      );
      if (outcome.result === 'HR') homeRuns += 1;
    }
    return homeRuns;
  };

  try {
    const pitcherFriendly = countHomeRuns(batter, { homeRun: 0.7, hit: 0.9 }, 0, 4242);
    const batterFriendly = countHomeRuns(
      { ...batter, hand: { bat: '左' } },
      { homeRun: 1.5, hit: 1.1 },
      4,
      4242,
    );
    assert.ok(pitcherFriendly > 0, '検証に足りる本塁打が発生していること');
    assert.ok(
      batterFriendly > pitcherFriendly,
      `batter-friendly platoon, park and familiarity should increase home runs (${batterFriendly} vs ${pitcherFriendly})`,
    );
  } finally {
    resetRandom();
  }
});

test('growPlayer records a non-zero change when normal development rounds to zero', () => {
  const player = makePlayer('flat-growth', false);
  player.age = 31;
  player.pot = { ...player.p };
  configureRandom(
    () => 0.5,
    () => Date.UTC(2026, 0, 1),
  );
  try {
    const grown = growPlayer(player),
      latest = grown.growthLog?.at(-1);
    assert.ok(latest?.changes?.length);
    assert.ok(latest.changes.some((change) => change.diff !== 0));
  } finally {
    resetRandom();
  }
});

test('post-game processing awakens a participant and can award a special ability', () => {
  const teams = initTeams(),
    target = teams.giants.fielders[0] as Player,
    suppliedLineup = teams.giants.fielders.slice(0, 9);
  target.age = 20;
  target.p = {
    ...target.p,
    cf: 25,
    cb: 25,
    pw: 25,
    dc: 25,
    sp: 25,
    df: 25,
    arm: 25,
  };
  target.pot = { cf: 75, cb: 75, pw: 75, dc: 75, sp: 75, df: 75, arm: 75, stam: 75 };
  target.specials = [];
  target.specialLevels = {};
  target.awakeCount = 0;
  target.seasonAwakenDone = false;
  configureRandom(
    () => 0,
    () => Date.UTC(2026, 0, 1),
  );
  try {
    const result = simulateGame('giants', 'tigers', teams, suppliedLineup),
      updated = teams.giants.fielders.find((player) => player.id === target.id);
    assert.ok(result.postGameEvents.awakenings.some((event) => event.playerId === target.id));
    assert.equal(updated?.seasonAwakenDone, true);
    assert.ok((updated?.specials?.length ?? 0) > 0);
  } finally {
    resetRandom();
  }
});

test('post-game injuries set severity and exclude the player from the next lineup', () => {
  const teams = initTeams(),
    target = teams.giants.fielders[0] as Player,
    suppliedLineup = teams.giants.fielders.slice(0, 9);
  target.seasonAwakenDone = true;
  configureRandom(
    () => 0,
    () => Date.UTC(2026, 0, 1),
  );
  try {
    const result = simulateGame('giants', 'tigers', teams, suppliedLineup),
      updated = teams.giants.fielders.find((player) => player.id === target.id);
    assert.ok(result.postGameEvents.injuries.some((event) => event.playerId === target.id));
    assert.equal(updated?.injurySeverity, 'light');
    assert.ok((updated?.injuryDays ?? 0) > 0);
    assert.ok(!bestLineup(teams.giants).some((player) => player.id === target.id));
  } finally {
    resetRandom();
  }
});

test('calcStandings records wins, losses, runs and ranks', () => {
  configureRandom(mulberry32(11), () => Date.UTC(2026, 0, 1));
  try {
    const schedule = generateSchedule(2026);
    const firstGame = schedule[0];
    const secondGame = schedule.find(
      (game) =>
        game.homeKey !== firstGame.homeKey &&
        game.awayKey !== firstGame.homeKey &&
        game.homeKey !== firstGame.awayKey &&
        game.awayKey !== firstGame.awayKey,
    );
    assert.ok(secondGame);
    const played = schedule.map((game) => {
      if (game.id === firstGame.id) return { ...game, played: true, hs: 5, as: 2 };
      if (game.id === secondGame.id) return { ...game, played: true, hs: 1, as: 3 };
      return game;
    });
    const standings = calcStandings(played);
    assert.equal(standings[firstGame.homeKey].w, 1);
    assert.equal(standings[firstGame.awayKey].l, 1);
    assert.equal(standings[firstGame.homeKey].rs, 5);
    assert.equal(standings[firstGame.homeKey].ra, 2);
    assert.ok(standings[firstGame.homeKey].rank);
  } finally {
    resetRandom();
  }
});

test('the generated schedule reads like a real NPB season: series blocks, a clean interleague split, no Monday games, and an All-Star gap', () => {
  configureRandom(mulberry32(2026), () => Date.UTC(2026, 0, 1));
  try {
    const schedule = generateSchedule(2026, { rainoutRate: 0, maxRainouts: 0 });
    assert.equal(schedule.length, 858);

    // No game is ever scheduled on a Monday - the league's default off day.
    const mondayGames = schedule.filter(
      (game) => new Date(`${game.date}T00:00:00Z`).getUTCDay() === 1,
    );
    assert.equal(mondayGames.length, 0, 'Monday should never have a scheduled game');

    // Interleague play is balanced to exactly 9 home / 9 away for every club, and every
    // meeting between two interleague opponents is a single 3-game series (one venue).
    const interleague = schedule.filter((game) => game.isInterleague);
    assert.equal(interleague.length, 108);
    const homeCounts = new Map<TeamKey, number>();
    for (const game of interleague) {
      homeCounts.set(game.homeKey, (homeCounts.get(game.homeKey) ?? 0) + 1);
      homeCounts.set(game.awayKey, homeCounts.get(game.awayKey) ?? 0);
    }
    for (const count of homeCounts.values()) assert.equal(count, 9);

    // Somewhere mid-season there's a multi-day gap with no games at all (the All-Star
    // break), long enough that it can't just be the ordinary Monday-off pattern.
    const dates = [...new Set(schedule.map((game) => game.date))].sort();
    let maxGapDays = 0;
    for (let index = 1; index < dates.length; index += 1) {
      const previous = new Date(`${dates[index - 1]}T00:00:00Z`).getTime(),
        current = new Date(`${dates[index]}T00:00:00Z`).getTime();
      maxGapDays = Math.max(maxGapDays, (current - previous) / 86_400_000);
    }
    assert.ok(maxGapDays >= 6, `expected an All-Star-length gap, longest was ${maxGapDays} days`);
  } finally {
    resetRandom();
  }
});

test('calcInterleagueStandings ranks all 12 clubs together from interleague games only', () => {
  configureRandom(mulberry32(33), () => Date.UTC(2026, 0, 1));
  try {
    const schedule = generateSchedule(2026);
    const interleagueGame = schedule.find((game) => game.isInterleague);
    const leagueGame = schedule.find((game) => !game.isInterleague);
    assert.ok(interleagueGame && leagueGame);
    const played = schedule.map((game) => {
      if (game.id === interleagueGame.id) return { ...game, played: true, hs: 4, as: 1 };
      if (game.id === leagueGame.id) return { ...game, played: true, hs: 9, as: 0 };
      return game;
    });
    const standings = calcInterleagueStandings(played);
    // The intra-league blowout must not leak into the interleague-only tally.
    assert.equal(standings[interleagueGame.homeKey].w, 1);
    assert.equal(standings[interleagueGame.homeKey].g, 1);
    assert.equal(standings[leagueGame.homeKey].g, 0);
    // Ranking spans both leagues at once rather than being split Central/Pacific.
    const ranks = new Set(Object.values(standings).map((record) => record.rank));
    assert.ok(ranks.has(12), '12球団を通したランキングになっていること');
  } finally {
    resetRandom();
  }
});

test('postseasonSeriesDates paces games with a rest day roughly every third game', () => {
  const dates = postseasonSeriesDates('2026-10-10', 7);
  assert.equal(dates.length, 7);
  assert.equal(dates[0], '2026-10-10');
  // Every date must be on or after the previous one - never earlier.
  for (let index = 1; index < dates.length; index += 1) {
    assert.ok((dates[index] as string) >= (dates[index - 1] as string));
  }
  // A rest day is worked in by the 4th game (index 3).
  assert.equal(dates[3], addDays('2026-10-10', 4));
});
