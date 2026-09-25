import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assignAllActiveRosters,
  basePopularity,
  configureRandom,
  createBatterStats,
  gameAttendance,
  initTeams,
  nextPopularity,
  popularityOf,
  popularityRevenueFactor,
  resetRandom,
  updateSeasonPopularity,
  type AccumulatedStats,
  type Player,
} from '../src/engine';

function world() {
  configureRandom(
    () => 0.37,
    () => 1_700_000_000_000,
  );
  try {
    return assignAllActiveRosters(initTeams());
  } finally {
    resetRandom();
  }
}

const season = (stats: AccumulatedStats = {}) => ({
  year: 2026,
  stats,
  titles: [],
  honors: [],
  achievements: [],
  champion: null,
});

const bigSeason = (player: Player): AccumulatedStats => ({
  [player.id]: {
    ...createBatterStats(player.name),
    pa: 600,
    ab: 520,
    h: 170,
    s: 100,
    d: 30,
    t: 2,
    hr: 38,
    bb: 70,
    rbi: 110,
  },
});

test('popularity starts from ability until a season is scored', () => {
  const teams = world();
  const [first, second] = [...teams.giants.fielders].sort(
    (a, b) => basePopularity(b) - basePopularity(a),
  );
  assert.ok(basePopularity(first!) >= basePopularity(second!));
  assert.equal(popularityOf({ ...first!, popularity: 77 }), 77);
  assert.equal(popularityOf(first!), basePopularity(first!));
});

test('a big season and an MVP raise popularity; a season on the bench lets it fade', () => {
  const teams = world();
  const player = { ...teams.giants.fielders[0]!, popularity: 50 };
  const big = nextPopularity(player, 'giants', season(bigSeason(player)));
  assert.ok(big > 50, `a 38-homer season lifts him (${big})`);
  const mvp = nextPopularity(player, 'giants', {
    ...season(bigSeason(player)),
    honors: [
      {
        year: 2026,
        league: 'central',
        honorId: 'mvp',
        playerId: player.id,
        playerName: player.name,
        teamKey: 'giants',
        summary: '',
      },
    ],
  });
  assert.ok(mvp >= big + 10, 'the MVP adds on top');
  const star = { ...player, popularity: 90 };
  assert.ok(nextPopularity(star, 'giants', season()) < 90, 'a year out of the lineup fades');
});

test('the season update scores every rostered player and reports the changes', () => {
  const teams = world();
  const player = teams.giants.fielders[0]!;
  const result = updateSeasonPopularity(teams, season(bigSeason(player)));
  const updated = result.teams.giants.fielders[0]!;
  assert.equal(typeof updated.popularity, 'number');
  assert.ok(result.changes.some((change) => change.playerId === player.id));
  assert.ok(
    Object.values(result.teams).every((team) =>
      [...team.fielders, ...team.pitchers].every((p) => typeof p.popularity === 'number'),
    ),
  );
});

test('fan following moves revenue at most 5% either way, around the league average', () => {
  const teams = world();
  const factors = Object.values(teams).map((team) => popularityRevenueFactor(team, teams));
  assert.ok(factors.every((factor) => factor >= 0.95 && factor <= 1.05));
  const average = factors.reduce((sum, factor) => sum + factor, 0) / factors.length;
  assert.ok(Math.abs(average - 1) < 0.02, `centered on the league (${average})`);
});

test('a game draws the same crowd every time, more on weekends, within the park', () => {
  const teams = world();
  const friday = gameAttendance(teams.giants, 'g1', '2026-05-01', 1);
  assert.equal(friday, gameAttendance(teams.giants, 'g1', '2026-05-01', 1));
  const tuesday = gameAttendance(teams.giants, 'g2', '2026-05-05', 1);
  const saturday = gameAttendance(teams.giants, 'g2', '2026-05-02', 1);
  assert.ok(saturday > tuesday);
  assert.ok(saturday <= 46_000 && tuesday >= 10_000);
});
