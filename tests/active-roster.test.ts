import assert from 'node:assert/strict';
import test from 'node:test';

import { bestLineup, configureRandom, initTeams, resetRandom, topStarters } from '../src/engine';
import type { Player, Team } from '../src/engine';

function seededRandom(initialSeed: number): () => number {
  let seed = initialSeed >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

function buildTeam(seed: number): Team {
  configureRandom(seededRandom(seed), () => 1_000);
  const teams = initTeams();
  resetRandom();
  return teams.giants as Team;
}

function withActiveRoster(players: Player[], activeIds: Set<string>): Player[] {
  return players.map((player) => ({ ...player, activeRoster: activeIds.has(player.id) }));
}

test('bestLineup treats undefined activeRoster as 一軍 (existing saves are unaffected)', () => {
  const team = buildTeam(101);
  const lineup = bestLineup(team);
  assert.equal(lineup.length, 9);
  assert.ok(lineup.every((player) => player.activeRoster !== false));
});

test('bestLineup excludes 二軍 fielders once enough 一軍 fielders remain', () => {
  const team = buildTeam(102);
  assert.ok(team.fielders.length >= 12, 'fixture needs a roster larger than 9');
  const activeIds = new Set(team.fielders.slice(0, 12).map((player) => player.id));
  const fielders = withActiveRoster(team.fielders, activeIds);
  const lineup = bestLineup({ ...team, fielders });

  assert.equal(lineup.length, 9);
  for (const player of lineup) {
    assert.ok(activeIds.has(player.id), `${player.name} should only be drawn from 一軍`);
  }
});

test('bestLineup falls back to 二軍 fielders when nobody is on 一軍 (never returns fewer than the original pool would)', () => {
  const team = buildTeam(103);
  const fielders = withActiveRoster(team.fielders, new Set());
  const lineup = bestLineup({ ...team, fielders });
  assert.equal(lineup.length, 9, 'an all-二軍 team should still field 9 players, not zero');
});

test('topStarters treats undefined activeRoster as 一軍 (existing saves are unaffected)', () => {
  const team = buildTeam(104);
  const starters = topStarters(team);
  assert.equal(starters.length, team.rotSize || 6);
  assert.ok(starters.every((player) => player.activeRoster !== false));
});

test('topStarters excludes 二軍 starters once enough 一軍 starters remain', () => {
  const team = buildTeam(105);
  const allStarters = team.pitchers.filter((pitcher) => pitcher.role === '先発');
  const slotCount = team.rotSize || 6;
  assert.ok(allStarters.length > slotCount, 'fixture needs more starters than rotation slots');
  const activeIds = new Set(allStarters.slice(0, slotCount).map((pitcher) => pitcher.id));
  const pitchers = withActiveRoster(team.pitchers, activeIds);
  const rotation = topStarters({ ...team, pitchers });

  assert.equal(rotation.length, slotCount);
  for (const pitcher of rotation) {
    assert.ok(activeIds.has(pitcher.id), `${pitcher.name} should only be drawn from 一軍`);
  }
});

test('topStarters falls back to 二軍 starters when the whole staff is sent down', () => {
  const team = buildTeam(106);
  const pitchers = withActiveRoster(team.pitchers, new Set());
  const rotation = topStarters({ ...team, pitchers });
  assert.ok(rotation.length > 0, 'an all-二軍 staff should still yield a fallback rotation');
});
