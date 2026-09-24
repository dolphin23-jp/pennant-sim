import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bestLineup,
  configureRandom,
  countForeignPlayers,
  cpuAutoTradeBetweenTeams,
  createForeignPlayerProfile,
  initTeams,
  resetRandom,
  type Player,
  type Team,
  type TeamKey,
  type Teams,
} from '../src/engine';
import { FOREIGN_PLAYER_BALANCE } from '../src/data';
import { applyTrade, generateTradeOffers, type TradeOffer } from '../src/state/offseason';

const FOREIGN_LIMIT = FOREIGN_PLAYER_BALANCE.registeredLimit;

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

test('applyTrade swaps players once but is a no-op if the same offer is applied again', () => {
  configureRandom(mulberry32(20260726), () => 1_700_000_000_000);
  try {
    const teams = initTeams();
    const playerTeam: TeamKey = 'giants';
    const fromTeam: TeamKey = 'tigers';
    const give = teams[fromTeam].fielders[0]!;
    const receive = teams[playerTeam].fielders[0]!;
    const offer: TradeOffer = {
      id: 'test-offer',
      fromTeam,
      give: [give],
      receive: [receive],
      cash: 0,
      summary: 'test trade',
    };

    const originalUserCount = teams[playerTeam].fielders.length + teams[playerTeam].pitchers.length;
    const originalOpponentCount = teams[fromTeam].fielders.length + teams[fromTeam].pitchers.length;

    const afterFirst = applyTrade(teams, playerTeam, offer);

    assert.ok(afterFirst[playerTeam].fielders.some((player) => player.id === give.id));
    assert.ok(!afterFirst[playerTeam].fielders.some((player) => player.id === receive.id));
    assert.ok(afterFirst[fromTeam].fielders.some((player) => player.id === receive.id));
    assert.ok(!afterFirst[fromTeam].fielders.some((player) => player.id === give.id));
    assert.equal(
      afterFirst[playerTeam].fielders.length + afterFirst[playerTeam].pitchers.length,
      originalUserCount,
    );
    assert.equal(
      afterFirst[fromTeam].fielders.length + afterFirst[fromTeam].pitchers.length,
      originalOpponentCount,
    );

    // Re-applying the same (now stale) offer must not duplicate players across rosters.
    const afterSecond = applyTrade(afterFirst, playerTeam, offer);
    assert.deepEqual(afterSecond, afterFirst);
  } finally {
    resetRandom();
  }
});

test('applyTrade moves every player in a multi-player package to the correct roster', () => {
  configureRandom(mulberry32(20260727), () => 1_700_000_000_000);
  try {
    const teams = initTeams();
    const playerTeam: TeamKey = 'giants';
    const fromTeam: TeamKey = 'tigers';
    const giveOne = teams[fromTeam].fielders[0]!;
    const giveTwo = teams[fromTeam].pitchers[0]!;
    const receiveOne = teams[playerTeam].fielders[0]!;
    const receiveTwo = teams[playerTeam].fielders[1]!;
    const offer: TradeOffer = {
      id: 'multi-offer',
      fromTeam,
      give: [giveOne, giveTwo],
      receive: [receiveOne, receiveTwo],
      cash: 300,
      summary: 'multi-player test trade',
    };

    const after = applyTrade(teams, playerTeam, offer);

    for (const player of [giveOne, giveTwo]) {
      const roster = player.isP ? after[playerTeam].pitchers : after[playerTeam].fielders;
      assert.ok(roster.some((candidate) => candidate.id === player.id));
    }
    for (const player of [receiveOne, receiveTwo]) {
      const roster = after[fromTeam].fielders;
      assert.ok(roster.some((candidate) => candidate.id === player.id));
      assert.ok(!after[playerTeam].fielders.some((candidate) => candidate.id === player.id));
    }
  } finally {
    resetRandom();
  }
});

test('generateTradeOffers produces offers where every player is unique on each side', () => {
  configureRandom(mulberry32(20260728), () => 1_700_000_000_000);
  try {
    const teams = initTeams();
    const offers = generateTradeOffers(teams, 'giants');
    for (const offer of offers) {
      assert.ok(offer.give.length >= 1);
      assert.ok(offer.receive.length >= 1);
      assert.ok(offer.cash >= 0);
      const giveIds = offer.give.map((player) => player.id);
      const receiveIds = offer.receive.map((player) => player.id);
      assert.equal(new Set(giveIds).size, giveIds.length);
      assert.equal(new Set(receiveIds).size, receiveIds.length);
    }
  } finally {
    resetRandom();
  }
});

/** Make exactly `count` of a club's tradeable players (relievers and bench bats) foreign. */
function withForeignPlayers(team: Team, count: number): Team {
  const domestic = (player: Player): Player => ({
    ...player,
    foreignProfile: undefined,
    signedVia: undefined,
    note: player.note?.replaceAll('外国人', ''),
  });
  let remaining = count;
  const foreign = (player: Player): Player =>
    remaining-- > 0 ? { ...player, foreignProfile: createForeignPlayerProfile(2026) } : player;
  return {
    ...team,
    pitchers: team.pitchers
      .map(domestic)
      .map((player) => (player.role === '先発' ? player : foreign(player))),
    fielders: team.fielders.map(domestic).reverse().map(foreign).reverse(),
  };
}

function everyClubAtForeignLimit(): Teams {
  const teams = initTeams();
  for (const key of Object.keys(teams) as TeamKey[])
    teams[key] = withForeignPlayers(teams[key], FOREIGN_LIMIT);
  return teams;
}

/**
 * Complementary positional shortages (every fielder a first baseman on half the clubs, a
 * left fielder on the other half) make CPU trades attractive; five bench bats per club are
 * foreign, so a foreign-for-domestic swap would push the receiving club past the limit.
 */
function clubsReadyToTradeForeignBats(): Teams {
  const teams = initTeams();
  (Object.keys(teams) as TeamKey[]).forEach((key, index) => {
    const pos = index % 2 ? '一塁手' : '左翼手';
    const team = teams[key];
    const fielders = team.fielders.map((player) => ({
      ...player,
      foreignProfile: undefined,
      pos,
      positions: [{ pos, apt: 100 }],
    })) as Player[];
    const pitchers = team.pitchers.map((player) => ({ ...player, foreignProfile: undefined }));
    const starters = new Set(
      bestLineup({ ...team, fielders, pitchers }).map((player) => player.id),
    );
    let marked = 0;
    teams[key] = {
      ...team,
      pitchers,
      fielders: fielders.map((player) =>
        !starters.has(player.id) && marked++ < FOREIGN_LIMIT
          ? { ...player, foreignProfile: createForeignPlayerProfile(2026) }
          : player,
      ),
    };
  });
  return teams;
}

test('CPU trades never take a club over the foreign-player limit', () => {
  let trades = 0;
  for (let seed = 1; seed <= 12; seed += 1) {
    configureRandom(mulberry32(seed), () => 1_700_000_000_000);
    try {
      const events: unknown[] = [];
      const traded = cpuAutoTradeBetweenTeams(clubsReadyToTradeForeignBats(), 'giants', 11, {
        year: 2026,
        date: '2026年オフ',
        emit: (event) => events.push(event),
      });
      trades += events.length;
      for (const team of Object.values(traded))
        assert.ok(
          countForeignPlayers(team) <= FOREIGN_LIMIT,
          `${team.key} has ${countForeignPlayers(team)} foreign players after seed ${seed}`,
        );
    } finally {
      resetRandom();
    }
  }
  assert.ok(trades > 0, 'the setup produces CPU trades to check');
});

test('trade offers and applyTrade respect a full foreign-player list', () => {
  configureRandom(mulberry32(20260801), () => 1_700_000_000_000);
  try {
    const teams = everyClubAtForeignLimit();
    const playerTeam: TeamKey = 'giants';
    for (const offer of generateTradeOffers(teams, playerTeam)) {
      const after = applyTrade(teams, playerTeam, offer);
      assert.ok(countForeignPlayers(after[playerTeam]) <= FOREIGN_LIMIT);
      assert.ok(countForeignPlayers(after[offer.fromTeam]) <= FOREIGN_LIMIT);
    }
    // A hand-built domestic-for-foreign offer is refused rather than applied.
    const foreignTarget = [...teams.tigers.pitchers, ...teams.tigers.fielders].find(
      (player) => player.foreignProfile,
    )!;
    const domesticChip = teams.giants.fielders.find((player) => !player.foreignProfile)!;
    const offer: TradeOffer = {
      id: 'over-limit',
      fromTeam: 'tigers',
      give: [foreignTarget],
      receive: [domesticChip],
      cash: 0,
      summary: 'over the limit',
    };
    assert.equal(applyTrade(teams, playerTeam, offer), teams);
  } finally {
    resetRandom();
  }
});
