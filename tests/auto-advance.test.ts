import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bestLineup,
  calcStandings,
  configureRandom,
  generateSchedule,
  initTeams,
  resetRandom,
  type TeamKey,
} from '../src/engine';
import {
  advanceOneYear,
  applyChampionship,
  applySkip,
  initialState,
  type RuntimeState,
} from '../src/state/runtime';

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

function newGame(playerTeam: TeamKey): RuntimeState {
  const teams = initTeams();
  const schedule = generateSchedule(2026, { rainoutRate: 0, maxRainouts: 0 });
  return {
    ...initialState,
    worldId: 'auto-advance-test',
    loading: false,
    screen: 'season',
    teams,
    playerTeam,
    viewTeam: playerTeam,
    lineup: bestLineup(teams[playerTeam]),
    season: { year: 2026, schedule },
    standings: calcStandings(schedule),
  };
}

test('advancing whole years plays every phase and keeps rosters and records consistent', () => {
  configureRandom(mulberry32(20260925), () => Date.UTC(2026, 0, 1));
  try {
    const start = newGame('giants');
    const startingIds = new Set(
      Object.values(start.teams!).flatMap((team) =>
        [...team.pitchers, ...team.fielders].map((player) => player.id),
      ),
    );
    const afterOne = advanceOneYear(start);
    const afterTwo = advanceOneYear(afterOne);

    assert.equal(afterTwo.season.year, 2028);
    assert.equal(afterTwo.screen, 'season');
    assert.ok(
      afterTwo.season.schedule.some((game) => !game.played),
      'the new season is open',
    );
    assert.deepEqual(
      afterTwo.championHistory.map((record) => record.year),
      [2026, 2027],
    );
    assert.ok(afterTwo.yearlyStats['2026']?.length && afterTwo.yearlyStats['2027']?.length);
    assert.ok(afterTwo.awardHistory.some((title) => title.year === 2027));
    assert.ok(afterTwo.narrativeEvents['2027']?.length, 'the year produced ledger facts');

    const rostered = Object.values(afterTwo.teams!).flatMap((team) => [
      ...team.pitchers,
      ...team.fielders,
    ]);
    const rosteredIds = new Set(rostered.map((player) => player.id));
    assert.equal(rosteredIds.size, rostered.length, 'no player is on two rosters');
    for (const team of Object.values(afterTwo.teams!)) {
      // The user's club is managed like the others: it does not grow without bound.
      assert.ok(team.pitchers.length <= 28, `${team.key} pitchers ${team.pitchers.length}`);
      assert.ok(team.fielders.length <= 35, `${team.key} fielders ${team.fielders.length}`);
      assert.ok([...team.pitchers, ...team.fielders].every((player) => player.age < 42));
    }

    // Every original player who left a roster is kept in the record books.
    const retiredIds = new Set(afterTwo.retiredPlayers.map((player) => player.id));
    for (const id of startingIds)
      assert.ok(rosteredIds.has(id) || retiredIds.has(id), `player ${id} vanished`);
    assert.ok([...retiredIds].every((id) => !rosteredIds.has(id)));
  } finally {
    resetRandom();
  }
});

test('advancing resumes mid-year without replaying the season or the postseason', () => {
  configureRandom(mulberry32(20260926), () => Date.UTC(2026, 0, 1));
  try {
    // The user played the season and the Japan Series by hand, then chose to hand over.
    const played = applySkip(newGame('tigers'), 'season');
    const crowned = applyChampionship(played, 'hawks', 'tigers');
    const next = advanceOneYear(crowned);
    assert.equal(next.season.year, 2027);
    assert.deepEqual(
      next.championHistory.map((record) => [record.year, record.champion]),
      [[2026, 'hawks']],
    );
    assert.equal(
      Object.keys(next.gameSummaries).filter((id) => next.gameSummaries[id]!.date < '2027').length,
      Object.keys(played.gameSummaries).length,
      'the regular season is not simulated a second time',
    );
  } finally {
    resetRandom();
  }
});
