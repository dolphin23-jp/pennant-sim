import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bestLineup,
  calcOVR,
  configureRandom,
  countForeignPlayers,
  genForeignMarket,
  initTeams,
  resetRandom,
  reviewForeignPlayers,
  signPlayerToTeam,
  type AccumulatedStats,
  type ForeignPlayerProfile,
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

const profile = (overrides: Partial<ForeignPlayerProfile> = {}): ForeignPlayerProfile => ({
  origin: 'アメリカ',
  arrivalYear: 2026,
  contractYearsRemaining: 1,
  npbSeasons: 0,
  adaptationFactor: 1,
  ...overrides,
});

test('foreign market candidates have origins, contracts, and rare adaptation tails', () => {
  configureRandom(mulberry32(20260801), () => 1_700_000_000_000);
  try {
    const candidates = Array.from({ length: 40 }, () => genForeignMarket(2027)).flat();
    assert.equal(candidates.length, 800);
    assert.ok(
      candidates.every(
        (player) =>
          player.foreignProfile &&
          player.foreignProfile.arrivalYear === 2027 &&
          player.foreignProfile.contractYearsRemaining >= 1 &&
          player.foreignProfile.contractYearsRemaining <= 3,
      ),
    );
    assert.ok(new Set(candidates.map((player) => player.foreignProfile?.origin)).size >= 6);
    assert.ok(candidates.some((player) => (player.foreignProfile?.adaptationFactor ?? 1) < 0.93));
    assert.ok(candidates.some((player) => (player.foreignProfile?.adaptationFactor ?? 1) > 1.1));
  } finally {
    resetRandom();
  }
});

test('foreign registration and simultaneous hitter limits are enforced', () => {
  configureRandom(mulberry32(20260802), () => 1_700_000_000_000);
  try {
    let teams = initTeams();
    const candidates = genForeignMarket(2027);
    for (const player of candidates.slice(0, 6)) teams = signPlayerToTeam(teams, 'giants', player);
    assert.equal(countForeignPlayers(teams.giants), 5);

    const boostedIds = new Set(teams.giants.fielders.slice(0, 4).map((player) => player.id));
    const fielders = teams.giants.fielders.map((player) =>
      boostedIds.has(player.id)
        ? {
            ...player,
            p: {
              ...player.p,
              cf: 120,
              cb: 120,
              pw: 120,
              dc: 120,
              sp: 120,
              df: 120,
              arm: 120,
            },
            foreignProfile: profile({ adaptationFactor: 1.1 }),
          }
        : player,
    );
    const lineup = bestLineup({ ...teams.giants, fielders });
    assert.equal(lineup.filter((player) => player.foreignProfile).length, 3);
  } finally {
    resetRandom();
  }
});

test('contract review can release a disappointment and send a dominant player to MLB', () => {
  configureRandom(
    () => 0.01,
    () => 1_700_000_000_000,
  );
  try {
    const teams = initTeams();
    const weakBase = teams.giants.fielders[0] as Player;
    const starBase = teams.giants.fielders[1] as Player;
    const weak: Player = {
      ...weakBase,
      id: 'foreign-disappointment',
      name: 'Low Example',
      age: 30,
      p: {
        ...weakBase.p,
        cf: 20,
        cb: 20,
        pw: 20,
        dc: 20,
        sp: 20,
        df: 20,
        arm: 20,
        stam: 20,
      },
      foreignProfile: profile({ npbSeasons: 1, adaptationFactor: 0.86 }),
      signedVia: '外国人候補',
    };
    const star: Player = {
      ...starBase,
      id: 'foreign-mlb-star',
      name: 'Star Example',
      age: 28,
      p: {
        ...starBase.p,
        cf: 125,
        cb: 125,
        pw: 135,
        dc: 120,
        sp: 100,
        df: 100,
        arm: 110,
        stam: 110,
      },
      foreignProfile: profile({ npbSeasons: 2, adaptationFactor: 1.12 }),
      signedVia: '外国人候補',
    };
    teams.giants = {
      ...teams.giants,
      fielders: [weak, star, ...teams.giants.fielders.slice(2)],
    };
    const stats: AccumulatedStats = {
      [weak.id]: {
        type: 'bat',
        name: weak.name,
        g: 90,
        pa: 260,
        ab: 240,
        h: 35,
        s: 25,
        d: 7,
        t: 0,
        hr: 3,
        bb: 20,
        k: 100,
        rbi: 18,
        sb: 0,
        cs: 1,
        bnt: 0,
        sf: 0,
      },
      [star.id]: {
        type: 'bat',
        name: star.name,
        g: 143,
        pa: 620,
        ab: 550,
        h: 190,
        s: 100,
        d: 32,
        t: 2,
        hr: 56,
        bb: 70,
        k: 90,
        rbi: 130,
        sb: 8,
        cs: 2,
        bnt: 0,
        sf: 5,
      },
    };

    const reviewed = reviewForeignPlayers(teams, stats, 2026);
    assert.ok(
      reviewed.events.some((event) => event.playerId === weak.id && event.type === 'released'),
    );
    assert.ok(
      reviewed.events.some((event) => event.playerId === star.id && event.type === 'mlbTransfer'),
    );
    assert.ok(!reviewed.teams.giants.fielders.some((player) => player.id === weak.id));
    assert.ok(!reviewed.teams.giants.fielders.some((player) => player.id === star.id));
    assert.ok(calcOVR(star, star.pos) > 120, 'record-class ratings must not be hard-capped');
  } finally {
    resetRandom();
  }
});
