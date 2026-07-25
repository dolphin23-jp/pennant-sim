from pathlib import Path

# Export strategy APIs.
path = Path('src/engine/index.ts')
text = path.read_text()
if "export * from './aiStrategy';" not in text:
    text = text.replace("export * from './atBat';", "export * from './aiStrategy';\nexport * from './atBat';")
path.write_text(text)

# Add strategic lineup constructor to aiStrategy.ts.
path = Path('src/engine/aiStrategy.ts')
text = path.read_text()
append = r'''

function approximatePositionScore(player: Player, position: FieldPosition): number {
  const contact = ((player.p.cf ?? 50) + (player.p.cb ?? 50)) / 2;
  const offense = contact * 0.42 + (player.p.pw ?? 50) * 0.28 + (player.p.dc ?? 50) * 0.18 + (player.p.sp ?? 50) * 0.12;
  const defense = (player.p.df ?? 50) * 0.62 + (player.p.arm ?? 50) * 0.28 + (position === '捕手' ? (player.p.ld ?? 0) * 0.1 : 0);
  const aptitude = player.pos === position
    ? 100
    : player.positions?.find((entry) => entry.pos === position)?.apt ?? 35;
  return (offense * 0.58 + defense * 0.42) * (0.72 + aptitude * 0.0028);
}

function strategicBattingOrder(players: Player[], strategy: TeamStrategy): Player[] {
  const contact = (player: Player) => ((player.p.cf ?? 50) + (player.p.cb ?? 50)) / 2;
  const onBase = (player: Player) => contact(player) * 0.68 + (player.p.dc ?? 50) * 0.32;
  const power = (player: Player) => player.p.pw ?? 50;
  const speed = (player: Player) => player.p.sp ?? 50;
  const runCreation = (player: Player) => onBase(player) * 0.58 + power(player) * 0.42;
  const used = new Set<string>();
  const slots: Array<Player | undefined> = Array.from({ length: players.length });
  const take = (score: (player: Player) => number): Player | undefined => {
    const selected = players.filter((player) => !used.has(player.id)).sort((a, b) => score(b) - score(a))[0];
    if (selected) used.add(selected.id);
    return selected;
  };
  if (strategy.lineupPhilosophy === 'powerFirst') {
    slots[3] = take((player) => power(player) * 0.75 + contact(player) * 0.25);
    slots[2] = take(runCreation);
    slots[0] = take((player) => onBase(player) * 0.8 + power(player) * 0.2);
  } else if (strategy.lineupPhilosophy === 'onBaseFirst') {
    slots[0] = take(onBase);
    slots[1] = take(onBase);
    slots[2] = take(runCreation);
    slots[3] = take((player) => power(player) * 0.68 + contact(player) * 0.32);
  } else if (strategy.lineupPhilosophy === 'speedFirst') {
    slots[0] = take((player) => onBase(player) * 0.55 + speed(player) * 0.45);
    slots[1] = take((player) => contact(player) * 0.52 + speed(player) * 0.48);
    slots[2] = take(runCreation);
    slots[3] = take((player) => power(player) * 0.7 + contact(player) * 0.3);
  } else {
    slots[3] = take((player) => power(player) * 0.65 + contact(player) * 0.35);
    slots[2] = take(runCreation);
    slots[0] = take((player) => onBase(player) * 0.72 + speed(player) * 0.28);
    slots[1] = take((player) => contact(player) * 0.6 + onBase(player) * 0.4);
  }
  const remaining = players.filter((player) => !used.has(player.id)).sort((a, b) => runCreation(b) - runCreation(a));
  let remainingIndex = 0;
  for (let index = 0; index < slots.length; index += 1) if (!slots[index]) slots[index] = remaining[remainingIndex++];
  return slots.filter((player): player is Player => Boolean(player));
}

export function strategicBestLineup(team: Team): { lineup: Player[]; audit: Record<FieldPosition, CandidateAudit[]> } {
  const strategy = teamStrategyFor(team.key);
  const healthy = team.fielders.filter((player) => (player.injuryDays ?? 0) <= 0);
  const rested = healthy.filter((player) => (player.fatigue ?? 0) < 90);
  const pool = rested.length >= 9 ? rested : healthy;
  const positions: FieldPosition[] = ['捕手', '遊撃手', '中堅手', '二塁手', '三塁手', '左翼手', '右翼手', '一塁手'];
  const audit = auditTeamLineup({ ...team, fielders: pool }, approximatePositionScore);
  const used = new Set<string>();
  const selected: Player[] = [];
  for (const position of positions) {
    const choice = audit[position].find((entry) => !used.has(entry.playerId));
    const player = choice ? pool.find((candidate) => candidate.id === choice.playerId) : undefined;
    if (!player) continue;
    used.add(player.id);
    selected.push({ ...player, _assignedPos: position });
  }
  for (const player of pool) {
    if (selected.length >= 9) break;
    if (!used.has(player.id)) selected.push({ ...player, _assignedPos: player.pos });
  }
  return { lineup: strategicBattingOrder(selected.slice(0, 9), strategy), audit };
}

export function strategicPitcherOrder(team: Team, usage: 'starter' | 'bullpen' | 'closer'): CandidateAudit[] {
  const strategy = teamStrategyFor(team.key);
  const role = usage === 'starter' ? '先発' : usage === 'closer' ? 'クローザー' : 'リリーフ';
  return team.pitchers
    .filter((player) => player.role === role && (player.injuryDays ?? 0) <= 0)
    .map((player) => {
      const base = (player.p.vel ?? 50) * 0.28 + (player.p.ctrl ?? 50) * 0.3 + (player.p.stam ?? 50) * 0.22 + (player.p.nobi ?? 50) * 0.2;
      return auditPitcherCandidate(player, strategy, usage, base);
    })
    .sort((first, second) => second.score - first.score);
}
'''
if 'export function strategicBestLineup' not in text:
    text += append
path.write_text(text)

# Use strategic lineup for CPU fallback.
path = Path('src/engine/game.ts')
text = path.read_text()
if "from './aiStrategy'" not in text:
    text = text.replace("import { advBases, buildDesc, simAB } from './atBat';", "import { strategicBestLineup } from './aiStrategy';\nimport { advBases, buildDesc, simAB } from './atBat';")
text = text.replace("if (!supplied?.length) return bestLineup(team);", "if (!supplied?.length) return strategicBestLineup(team).lineup;")
text = text.replace(": bestLineup(team);", ": strategicBestLineup(team).lineup;")
path.write_text(text)

# Use strategy scores for automatic rotation and closer ordering.
path = Path('src/engine/pitcherPlan.ts')
text = path.read_text()
if "from './aiStrategy'" not in text:
    text = text.replace("import { calcOVR, topStarters } from './ratings';", "import { strategicPitcherOrder } from './aiStrategy';\nimport { calcOVR, topStarters } from './ratings';")
text = text.replace(
    "  const automatic = topStarters(team);\n  if (!rotationOrder.length) return automatic;",
    "  const strategicIds = strategicPitcherOrder(team, 'starter').map((entry) => entry.playerId);\n  const starterById = new Map(team.pitchers.map((pitcher) => [pitcher.id, pitcher]));\n  const automatic = strategicIds.map((id) => starterById.get(id)).filter((pitcher): pitcher is Player => Boolean(pitcher)).slice(0, team.rotSize || 6);\n  const fallback = automatic.length ? automatic : topStarters(team);\n  if (!rotationOrder.length) return fallback;",
)
text = text.replace("  for (const pitcher of automatic) append(pitcher);", "  for (const pitcher of fallback) append(pitcher);")
text = text.replace(
    "  const closers = team.pitchers.filter((pitcher) => pitcher.role === 'クローザー');\n  if (!closerPriority.length) return closers;",
    "  const closerById = new Map(team.pitchers.filter((pitcher) => pitcher.role === 'クローザー').map((pitcher) => [pitcher.id, pitcher]));\n  const strategicClosers = strategicPitcherOrder(team, 'closer').map((entry) => closerById.get(entry.playerId)).filter((pitcher): pitcher is Player => Boolean(pitcher));\n  const closers = strategicClosers.length ? strategicClosers : [...closerById.values()];\n  if (!closerPriority.length) return closers;",
)
path.write_text(text)

# Tests.
Path('tests/aiStrategy.test.ts').write_text(r'''import assert from 'node:assert/strict';
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
''')
