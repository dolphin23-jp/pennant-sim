import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calcOVR,
  configureRandom,
  developPitchRepertoire,
  initSettledTeams,
  initTeams,
  prepareCpuRostersForDraft,
  resetRandom,
  simulateGame,
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

const ovr = (player: Player) => calcOVR(player, player.isP ? undefined : player.pos);

test('breaking balls develop and fade with command and movement; the fastball mirrors velocity', () => {
  const pitches = [
    { type: '直球', shr: 60, brk: 0, ctl: 50 },
    { type: 'スライダー', shr: 40, brk: 45, ctl: 45 },
  ];
  const before = { vel: 60, ctrl: 40, nobi: 40, pitches };
  const grown = developPitchRepertoire(before, { ...before, vel: 64, ctrl: 46, nobi: 48 });
  assert.equal(grown[0]!.shr, 64);
  assert.equal(grown[1]!.shr, 47);
  assert.equal(grown[1]!.brk, 52);
  const declined = developPitchRepertoire(before, { ...before, ctrl: 38, nobi: 34 });
  assert.equal(declined[1]!.shr, 36);
});

test('a settled league opens at its long-run talent level with full, age-capped rosters', () => {
  configureRandom(mulberry32(31), () => Date.UTC(2026, 0, 1));
  try {
    const generated = Object.values(initTeams()).flatMap((team) => [
      ...team.pitchers,
      ...team.fielders,
    ]);
    const settledTeams = initSettledTeams(2026, 12);
    const settled = Object.values(settledTeams).flatMap((team) => [
      ...team.pitchers,
      ...team.fielders,
    ]);
    const mean = (players: Player[]) =>
      players.reduce((total, player) => total + ovr(player), 0) / players.length;
    assert.ok(mean(settled) > mean(generated) + 5, `${mean(generated)} -> ${mean(settled)}`);
    for (const team of Object.values(settledTeams)) {
      assert.equal(team.pitchers.length, 28);
      assert.equal(team.fielders.length, 35);
    }
    assert.ok(settled.every((player) => player.age < 42));
    assert.equal(new Set(settled.map((player) => player.id)).size, settled.length);
  } finally {
    resetRandom();
  }
});

test('veterans retire voluntarily within the winter release budget, before young players are cut', () => {
  configureRandom(mulberry32(32), () => Date.UTC(2026, 0, 1));
  try {
    const teams = initTeams();
    // A club carrying many ordinary 39-year-olds: some of them decide to retire.
    teams.tigers = {
      ...teams.tigers,
      fielders: teams.tigers.fielders.map((player, index) =>
        index < 10 ? { ...player, age: 39 } : player,
      ),
    };
    const prepared = prepareCpuRostersForDraft(teams, { excludedTeam: 'giants' });
    const exits = prepared.exits.filter((exit) => exit.teamKey === 'tigers' && !exit.isPitcher);
    assert.ok(exits.some((exit) => exit.reason === 'voluntaryRetirement'));
    // Retirements use release slots; they do not shrink the roster further.
    assert.equal(
      prepared.teams.tigers.fielders.length,
      teams.tigers.fielders.length - exits.length,
    );
    assert.ok(exits.length <= 6);
  } finally {
    resetRandom();
  }
});

test('the closer is brought in to protect a lead or hold a tie, never to pitch from behind', () => {
  configureRandom(mulberry32(33), () => Date.UTC(2026, 0, 1));
  try {
    const teams = initTeams();
    let closerEntries = 0;
    for (let game = 0; game < 120; game += 1) {
      const result = simulateGame('giants', 'tigers', teams, null, null, game, game, {});
      for (const decision of result.managementLog ?? []) {
        if (decision.type !== 'pitchingChange' || !decision.reason.includes('クローザー')) continue;
        closerEntries += 1;
        assert.ok(decision.scoreDifference >= 0 && decision.scoreDifference <= 3);
        assert.ok(decision.inning >= 9);
      }
    }
    assert.ok(closerEntries > 10);
  } finally {
    resetRandom();
  }
});
