import assert from 'node:assert/strict';
import test from 'node:test';

import {
  auditLineupCandidate,
  strategicBestLineup,
  strategicPitcherOrder,
  teamStrategyFor,
} from '../src/engine/aiStrategy';
import { initTeams } from '../src/engine/players';
import type { FieldPosition, Player, TeamKey } from '../src/engine/types';

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

test('rotation and closer candidates are ranked with auditable scores', () => {
  const team = Object.values(initTeams())[0];
  const starters = strategicPitcherOrder(team, 'starter');
  const closers = strategicPitcherOrder(team, 'closer');
  assert.ok(starters.length > 0);
  assert.ok(closers.length > 0);
  assert.ok(starters.every((entry, index) => index === 0 || starters[index - 1]!.score >= entry.score));
  assert.ok(starters[0]!.components.some((entry) => entry.id === 'fixed'));
});
