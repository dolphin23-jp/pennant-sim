import assert from 'node:assert/strict';
import test from 'node:test';

import {
  IN_SEASON_POPULARITY_CAP,
  SPOTLIGHT_EFFECT,
  amateurFame,
  applyInSeasonPopularity,
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
  spotlightMultiplier,
  temperamentOf,
  updateSeasonPopularity,
  type AccumulatedStats,
  type GameBoxScore,
  type Player,
} from '../src/engine';

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

function world() {
  configureRandom(mulberry32(37), () => 1_700_000_000_000);
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

const koshienRunnerUp = (player: Player): Player => ({
  ...player,
  age: 18,
  preProHistory: {
    schemaVersion: 1,
    source: 'generated-v1',
    origin: '高卒',
    entryYear: 2027,
    entryAge: 18,
    profileTier: 'national-elite',
    highlights: [{ kind: 'national-tournament', text: '夏の全国大会準優勝', result: '準優勝' }],
  },
});

test('a high-school star arrives famous, and the name fades into his pro record', () => {
  const teams = world();
  const player = { ...teams.giants.fielders[0]!, age: 18, preProHistory: undefined };
  const unknown = basePopularity(player);
  const star = koshienRunnerUp(player);
  assert.equal(amateurFame(star), 30, 'elite tier (22) and a Koshien runner-up (8)');
  assert.ok(basePopularity(star) > unknown, 'the name counts before a pro pitch is thrown');
  assert.ok(
    basePopularity({ ...star, draftRound: 1 }) > basePopularity(star),
    'a first-round pick is hyped',
  );
  assert.equal(amateurFame({ ...star, age: 22 }), 0, 'gone after four pro years');
  assert.ok(amateurFame({ ...star, age: 20 }) < amateurFame(star));
});

test('walk-offs and milestones raise popularity in season, up to a season cap', () => {
  const teams = world();
  const hero = teams.giants.fielders[0]!;
  const before = popularityOf(hero);
  const walkoff = {
    notableEvents: [{ type: 'walkoffHr' as const, playerId: hero.id, description: '' }],
  } as unknown as GameBoxScore;
  const once = applyInSeasonPopularity(teams, 2026, [walkoff], []);
  assert.equal(popularityOf(once.giants.fielders[0]!), Math.min(100, before + 3));
  let many = teams;
  for (let game = 0; game < 20; game += 1)
    many = applyInSeasonPopularity(many, 2026, [walkoff], []);
  const gained = popularityOf(many.giants.fielders[0]!) - before;
  assert.ok(gained <= IN_SEASON_POPULARITY_CAP, `capped (${gained})`);
  const nextYear = applyInSeasonPopularity(many, 2027, [walkoff], []);
  assert.ok(
    popularityOf(nextYear.giants.fielders[0]!) >= popularityOf(many.giants.fielders[0]!),
    'the cap resets each season',
  );
});

test('temperament is fixed per player, and only a popular player feels the spotlight', () => {
  const teams = world();
  const players = [...teams.giants.fielders, ...teams.tigers.fielders, ...teams.carp.pitchers];
  for (const player of players) assert.equal(temperamentOf(player), temperamentOf({ ...player }));
  const counts = { bigStage: 0, steady: 0, pressure: 0 };
  for (const team of Object.values(teams))
    for (const player of [...team.fielders, ...team.pitchers]) counts[temperamentOf(player)] += 1;
  assert.ok(counts.steady > counts.bigStage && counts.bigStage > 0 && counts.pressure > 0);

  const base = players[0]!;
  const star = (temperament: Player['temperament']) => ({ ...base, popularity: 100, temperament });
  assert.equal(spotlightMultiplier(star('steady'), true), 1);
  assert.equal(spotlightMultiplier(star('bigStage')), 1 + SPOTLIGHT_EFFECT);
  assert.equal(spotlightMultiplier(star('bigStage'), true), 1 + 2 * SPOTLIGHT_EFFECT);
  assert.equal(spotlightMultiplier(star('pressure'), true), 1 - 2 * SPOTLIGHT_EFFECT);
  assert.equal(
    spotlightMultiplier({ ...base, popularity: 40, temperament: 'bigStage' }, true),
    1,
    'no spotlight on an unknown',
  );
});
