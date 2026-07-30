import assert from 'node:assert/strict';
import test from 'node:test';

import { configureRandom, initTeams, resetRandom, type TeamKey } from '../src/engine';
import { applyTrade, generateTradeOffers, type TradeOffer } from '../src/state/offseason';

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
