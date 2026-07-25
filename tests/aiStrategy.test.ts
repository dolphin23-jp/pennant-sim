import assert from 'node:assert/strict';
import test from 'node:test';

import {
  auditGameManagement,
  auditLineupCandidate,
  sacrificeBuntAttemptRate,
  stealAttemptRate,
  strategicBestLineup,
  strategicPitcherPlan,
  strategicPitcherOrder,
  teamStrategyFor,
} from '../src/engine/aiStrategy';
import { configureRandom, resetRandom } from '../src/engine/random';
import { simulateGame } from '../src/engine/game';
import { initTeams } from '../src/engine/players';
import type {
  FieldPosition,
  GameState,
  ManagementDecision,
  Player,
  TeamKey,
  TeamStrategy,
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

function strategyWith(teamKey: TeamKey, changes: Partial<TeamStrategy>): TeamStrategy {
  return { ...teamStrategyFor(teamKey), ...changes };
}

test('team strategies are stable and diverse across clubs', () => {
  const keys = Object.keys(initTeams()) as TeamKey[];
  const first = keys.map(teamStrategyFor);
  const second = keys.map(teamStrategyFor);
  assert.deepEqual(first, second);
  assert.ok(new Set(first.map((strategy) => strategy.philosophy)).size >= 4);
  assert.ok(new Set(first.map((strategy) => strategy.lineupPhilosophy)).size >= 3);
});

test('candidate audits expose score components and reasons', () => {
  const team = Object.values(initTeams())[0];
  const player = team.fielders[0] as Player;
  const position = player.pos as FieldPosition;
  const audit = auditLineupCandidate(player, position, teamStrategyFor(team.key), 80);
  assert.equal(audit.playerId, player.id);
  assert.ok(audit.components.some((entry) => entry.id === 'fatigue'));
  assert.ok(audit.components.some((entry) => entry.id === 'defense'));
  assert.ok(Number.isFinite(audit.score));
  assert.ok(audit.reasons.length > 0);
});

test('strategic lineup fills nine unique healthy players with audit trails', () => {
  const team = Object.values(initTeams())[0];
  const result = strategicBestLineup(team);
  assert.equal(result.lineup.length, 9);
  assert.equal(new Set(result.lineup.map((player) => player.id)).size, 9);
  assert.ok(Object.values(result.audit).some((entries) => entries.length > 0));
  assert.ok(result.lineup.every((player) => (player.injuryDays ?? 0) <= 0));
});

test('strategic lineup respects the active roster when nine first-team fielders remain', () => {
  const team = initTeams().giants;
  const demoted = team.fielders[0] as Player;
  const result = strategicBestLineup({
    ...team,
    fielders: team.fielders.map((player) =>
      player.id === demoted.id ? { ...player, activeRoster: false } : player,
    ),
  });
  assert.equal(result.lineup.length, 9);
  assert.ok(!result.lineup.some((player) => player.id === demoted.id));
});

test('rotation and closer candidates are ranked with auditable scores', () => {
  const team = Object.values(initTeams())[0];
  const starters = strategicPitcherOrder(team, 'starter');
  const closers = strategicPitcherOrder(team, 'closer');
  assert.ok(starters.length > 0);
  assert.ok(closers.length > 0);
  assert.ok(
    starters.every((entry, index) => index === 0 || starters[index - 1]!.score >= entry.score),
  );
  assert.ok(starters[0]!.components.some((entry) => entry.id === 'fixed'));
});

test('speed strategy attempts steals and late close-game bunts more often', () => {
  const teams = initTeams();
  const runner = {
    ...teams.dragons.fielders[0],
    p: { ...teams.dragons.fielders[0]!.p, sp: 88, bnt: 80, pw: 35 },
    specials: [],
    specialLevels: {},
  } as Player;
  const pitcher = teams.giants.pitchers[0] as Player;
  const catcher = teams.giants.fielders.find((player) => player.pos === '捕手');
  const speed = strategyWith('dragons', {
    philosophy: 'speed',
    lineupPhilosophy: 'speedFirst',
    stealAggression: 1.5,
    buntAggression: 1.3,
  });
  const power = strategyWith('dragons', {
    philosophy: 'power',
    lineupPhilosophy: 'powerFirst',
    stealAggression: 0.7,
    buntAggression: 0.65,
  });

  assert.ok(
    stealAttemptRate(runner, catcher, pitcher, speed, {
      inning: 8,
      outs: 0,
      scoreDifference: 0,
    }) >
      stealAttemptRate(runner, catcher, pitcher, power, {
        inning: 8,
        outs: 0,
        scoreDifference: 0,
      }) *
        1.4,
  );
  assert.ok(
    sacrificeBuntAttemptRate(runner, speed, {
      inning: 8,
      outs: 0,
      bases: [true, false, false],
      scoreDifference: 0,
    }) >
      sacrificeBuntAttemptRate(runner, power, {
        inning: 8,
        outs: 0,
        bases: [true, false, false],
        scoreDifference: 0,
      }) *
        1.8,
  );
  assert.ok(
    sacrificeBuntAttemptRate(runner, speed, {
      inning: 8,
      outs: 0,
      bases: [true, false, false],
      scoreDifference: 0,
    }) >
      sacrificeBuntAttemptRate(runner, speed, {
        inning: 8,
        outs: 0,
        bases: [true, false, false],
        scoreDifference: -3,
      }),
  );
});

test('ordinary CPU games use strategic batting orders and pitcher plans', () => {
  configureRandom(mulberry32(54), () => Date.UTC(2026, 2, 28));
  try {
    const teams = initTeams();
    const expectedHomeLineup = strategicBestLineup(teams.giants).lineup.map((player) => player.id);
    const expectedAwayLineup = strategicBestLineup(teams.tigers).lineup.map((player) => player.id);
    const expectedHomeStarter = strategicPitcherPlan(teams.giants).rotationOrder[0];
    const result = simulateGame(
      'giants',
      'tigers',
      teams,
      null,
      null,
      0,
      0,
      {},
      null,
      null,
      '2026-03-28',
    );

    assert.deepEqual(
      result.lineups.home.map((player) => player.id),
      expectedHomeLineup,
    );
    assert.deepEqual(
      result.lineups.away.map((player) => player.id),
      expectedAwayLineup,
    );
    assert.equal(result.starterH.id, expectedHomeStarter);
    assert.ok((result.managementLog ?? []).length > 0);
  } finally {
    resetRandom();
  }
});

test('management audit detects extreme tactic rates and retains outcome context', () => {
  const decision = (type: 'bunt' | 'steal', index: number): ManagementDecision => ({
    teamKey: 'giants',
    inning: 8,
    type,
    playerId: `player-${index}`,
    playerName: `選手${index}`,
    attempted: true,
    success: type === 'bunt' || index % 5 === 0,
    probability: 0.9,
    scoreDifference: 0,
    outs: 0,
    bases: [true, false, false],
    reason: 'テスト',
    runsAtDecision: 0,
    runsAfterDecision: index % 3 === 0 ? 1 : 0,
  });
  const managementLog = [
    ...Array.from({ length: 35 }, (_, index) => decision('bunt', index)),
    ...Array.from({ length: 45 }, (_, index) => decision('steal', index)),
  ];
  const audit = auditGameManagement([{ managementLog } as GameState]);

  assert.equal(audit.length, 1);
  assert.equal(audit[0]?.bunt.opportunities, 35);
  assert.equal(audit[0]?.steal.attempts, 45);
  assert.ok((audit[0]?.warnings.length ?? 0) >= 2);
  assert.ok((audit[0]?.steal.averageRunsAfterAttempt ?? 0) > 0);
});
