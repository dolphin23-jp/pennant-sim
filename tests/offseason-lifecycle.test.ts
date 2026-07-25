import assert from 'node:assert/strict';
import test from 'node:test';

import {
  configureRandom,
  countForeignPlayers,
  genFreeAgentMarket,
  initTeams,
  prepareCpuRostersForDraft,
  resetRandom,
  runAutomatedOffseason,
  cpuAutoSignMarketRounds,
  type TeamKey,
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

const rosterIds = (team: ReturnType<typeof initTeams>[TeamKey]): string[] =>
  [...team.pitchers, ...team.fielders].map((player) => player.id);

test('CPU roster preparation creates draft space without changing the user team', () => {
  configureRandom(mulberry32(20260728), () => 1_700_000_000_000);
  try {
    const teams = initTeams();
    const userTeam: TeamKey = 'giants';
    const originalUserIds = rosterIds(teams[userTeam]);
    const prepared = prepareCpuRostersForDraft(teams, { excludedTeam: userTeam });

    assert.deepEqual(rosterIds(prepared.teams[userTeam]), originalUserIds);
    assert.equal(prepared.exits.length, 11 * 6);
    for (const [teamKey, team] of Object.entries(prepared.teams)) {
      if (teamKey === userTeam) {
        assert.equal(team.pitchers.length, 28);
        assert.equal(team.fielders.length, 35);
      } else {
        assert.equal(team.pitchers.length, 25);
        assert.equal(team.fielders.length, 32);
      }
    }
  } finally {
    resetRandom();
  }
});

test('CPU market bidding never signs players for the excluded user team', () => {
  configureRandom(mulberry32(20260729), () => 1_700_000_000_000);
  try {
    const teams = initTeams();
    const userTeam: TeamKey = 'tigers';
    const originalUserIds = rosterIds(teams[userTeam]);
    const market = genFreeAgentMarket();
    const result = cpuAutoSignMarketRounds(teams, market, 'fa', 4, userTeam);

    assert.deepEqual(rosterIds(result.teams[userTeam]), originalUserIds);
    assert.ok(result.remaining.length < market.length);
  } finally {
    resetRandom();
  }
});

test('shared automated offseason keeps stable rosters through generational turnover', () => {
  configureRandom(mulberry32(20260730), () => 1_700_000_000_000);
  try {
    let teams = initTeams();
    const originalPlayerIds = new Set(Object.values(teams).flatMap(rosterIds));
    let sawMandatoryRetirement = false;
    let sawForeignSigning = false;
    let sawFreeAgentSigning = false;
    let sawForeignRenewal = false;
    let sawForeignRelease = false;

    for (let season = 0; season < 25; season += 1) {
      const result = runAutomatedOffseason(teams, { year: 2026 + season });
      teams = result.teams;
      assert.equal(result.draftPicks.length, 12 * 6);
      sawMandatoryRetirement ||= result.exits.some(
        (player) => player.reason === 'mandatoryRetirement',
      );
      sawForeignSigning ||= result.foreignSignings > 0;
      sawFreeAgentSigning ||= result.freeAgentSignings > 0;
      sawForeignRenewal ||= result.foreignRenewals > 0;
      sawForeignRelease ||= result.foreignReleases > 0;

      for (const team of Object.values(teams)) {
        assert.equal(team.pitchers.length, 28);
        assert.equal(team.fielders.length, 35);
        assert.ok(
          [...team.pitchers, ...team.fielders].every((player) => player.age < 42),
          'players at the mandatory retirement age must leave the active roster',
        );
        assert.ok(countForeignPlayers(team) <= 5);
      }
    }

    const finalPlayers = Object.values(teams).flatMap((team) => [
      ...team.pitchers,
      ...team.fielders,
    ]);
    assert.ok(finalPlayers.some((player) => !originalPlayerIds.has(player.id)));
    assert.ok(sawMandatoryRetirement);
    assert.ok(sawForeignSigning);
    assert.ok(sawFreeAgentSigning);
    assert.ok(sawForeignRenewal);
    assert.ok(sawForeignRelease);
  } finally {
    resetRandom();
  }
});
