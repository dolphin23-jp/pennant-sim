import { AT_BAT_BALANCE, FIELDING_BALANCE, FOREIGN_PLAYER_BALANCE } from '../data';
import { isForeignPlayer } from './foreign';
import { clamp } from './random';
import { designatedHitterScore, selectRosterPool } from './ratings';
import { hasGold, hasSpecial, specialLevel } from './specials';
import type {
  AccumulatedStats,
  FieldPosition,
  GameState,
  ManagementDecision,
  Player,
  Team,
  TeamKey,
} from './types';

export type TeamPhilosophy =
  'balanced' | 'power' | 'onBase' | 'speed' | 'defense' | 'youth' | 'veteran';

export type LineupPhilosophy = 'traditional' | 'onBaseFirst' | 'powerFirst' | 'speedFirst';

export interface TeamStrategy {
  teamKey: TeamKey;
  philosophy: TeamPhilosophy;
  lineupPhilosophy: LineupPhilosophy;
  youthPreference: number;
  veteranPreference: number;
  defenseWeight: number;
  offenseWeight: number;
  onBaseWeight: number;
  powerWeight: number;
  speedWeight: number;
  formReaction: number;
  fatigueReaction: number;
  fixedStarterBias: number;
  buntAggression: number;
  stealAggression: number;
  bullpenAggression: number;
}

export interface CandidateScoreComponent {
  id: string;
  label: string;
  value: number;
}

export interface CandidateAudit {
  playerId: string;
  playerName: string;
  score: number;
  components: CandidateScoreComponent[];
  reasons: string[];
}

export interface StrategicPitcherPlan {
  rotationOrder: string[];
  closerPriority: string[];
  bullpenPriority: string[];
}

export interface TacticAuditLine {
  opportunities: number;
  attempts: number;
  successes: number;
  attemptRate: number;
  successRate: number;
  averageRunsAfterAttempt: number;
  averageRunsAfterHold: number;
}

export interface TeamManagementAudit {
  teamKey: TeamKey;
  bunt: TacticAuditLine;
  steal: TacticAuditLine;
  pitchingChanges: number;
  warnings: string[];
}

const PHILOSOPHIES: TeamPhilosophy[] = [
  'balanced',
  'power',
  'onBase',
  'speed',
  'defense',
  'youth',
  'veteran',
];

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalized(hash: number, shift: number): number {
  return (((hash >>> shift) & 255) / 255) * 2 - 1;
}

function philosophyFactor(
  philosophy: TeamPhilosophy,
  values: Partial<Record<TeamPhilosophy, number>>,
): number {
  return values[philosophy] ?? 1;
}

export function teamStrategyFor(teamKey: TeamKey): TeamStrategy {
  const hash = hashText(String(teamKey));
  const philosophy = PHILOSOPHIES[hash % PHILOSOPHIES.length] as TeamPhilosophy;
  const lineupPhilosophy: LineupPhilosophy =
    philosophy === 'power'
      ? 'powerFirst'
      : philosophy === 'onBase'
        ? 'onBaseFirst'
        : philosophy === 'speed'
          ? 'speedFirst'
          : 'traditional';
  const philosophyBonus = (target: TeamPhilosophy, amount: number): number =>
    philosophy === target ? amount : 0;
  return {
    teamKey,
    philosophy,
    lineupPhilosophy,
    youthPreference: 0.12 + philosophyBonus('youth', 0.35) + normalized(hash, 4) * 0.08,
    veteranPreference: 0.08 + philosophyBonus('veteran', 0.32) + normalized(hash, 7) * 0.07,
    defenseWeight: 0.24 + philosophyBonus('defense', 0.35) + normalized(hash, 10) * 0.06,
    offenseWeight: 0.62 + normalized(hash, 13) * 0.08,
    onBaseWeight: 0.22 + philosophyBonus('onBase', 0.34) + normalized(hash, 16) * 0.06,
    powerWeight: 0.2 + philosophyBonus('power', 0.38) + normalized(hash, 19) * 0.06,
    speedWeight: 0.1 + philosophyBonus('speed', 0.36) + normalized(hash, 22) * 0.05,
    formReaction: 0.25 + ((hash >>> 3) % 40) / 100,
    fatigueReaction: 0.55 + ((hash >>> 8) % 35) / 100,
    fixedStarterBias: 0.2 + ((hash >>> 12) % 55) / 100,
    buntAggression:
      philosophyFactor(philosophy, {
        power: 0.65,
        speed: 1.3,
        defense: 1.12,
        youth: 0.92,
        veteran: 1.18,
      }) +
      normalized(hash, 2) * 0.08,
    stealAggression:
      philosophyFactor(philosophy, {
        power: 0.72,
        onBase: 1.08,
        speed: 1.5,
        defense: 0.86,
        youth: 1.12,
        veteran: 0.78,
      }) +
      normalized(hash, 5) * 0.08,
    bullpenAggression:
      philosophyFactor(philosophy, {
        power: 1.06,
        defense: 1.18,
        youth: 0.9,
        veteran: 0.84,
      }) +
      normalized(hash, 8) * 0.07,
  };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function component(id: string, label: string, value: number): CandidateScoreComponent {
  return { id, label, value: round(value) };
}

function batterForm(player: Player): number {
  const form = Number(player.form ?? 0);
  return Number.isFinite(form) ? Math.max(-10, Math.min(10, form)) : 0;
}

export function auditLineupCandidate(
  player: Player,
  position: FieldPosition,
  strategy: TeamStrategy,
  basePositionScore: number,
): CandidateAudit {
  const contact = ((player.p.cf ?? 50) + (player.p.cb ?? 50)) / 2;
  const discipline = player.p.dc ?? 50;
  const power = player.p.pw ?? 50;
  const speed = player.p.sp ?? 50;
  const defense = ((player.p.df ?? 50) + (player.p.arm ?? 50)) / 2;
  const offense = contact * 0.55 + discipline * 0.2 + power * 0.25;
  const ageDelta = player.age <= 25 ? 26 - player.age : player.age >= 32 ? player.age - 31 : 0;
  const youth = player.age <= 25 ? ageDelta * strategy.youthPreference * 2.2 : 0;
  const veteran = player.age >= 32 ? ageDelta * strategy.veteranPreference * 1.25 : 0;
  const fatigue = -Math.max(0, Number(player.fatigue ?? 0) - 35) * strategy.fatigueReaction * 0.12;
  const injury = (player.injuryDays ?? 0) > 0 ? -1000 : 0;
  const form = batterForm(player) * strategy.formReaction;
  const components = [
    component('position', `${position}適性・総合力`, basePositionScore * 0.66),
    component('offense', '打撃', offense * strategy.offenseWeight * 0.24),
    component('onBase', '出塁志向', discipline * strategy.onBaseWeight * 0.16),
    component('power', '長打志向', power * strategy.powerWeight * 0.17),
    component('speed', '機動力志向', speed * strategy.speedWeight * 0.16),
    component('defense', '守備志向', defense * strategy.defenseWeight * 0.2),
    component('youth', '若手起用', youth),
    component('veteran', 'ベテラン信頼', veteran),
    component('form', '好不調', form),
    component('fatigue', '疲労', fatigue),
    component('injury', '怪我', injury),
  ];
  const score = round(components.reduce((sum, item) => sum + item.value, 0));
  const reasons = [...components]
    .filter((item) => Math.abs(item.value) >= 3)
    .sort((first, second) => Math.abs(second.value) - Math.abs(first.value))
    .slice(0, 4)
    .map((item) => `${item.label}${item.value >= 0 ? '+' : ''}${item.value.toFixed(1)}`);
  return { playerId: player.id, playerName: player.name, score, components, reasons };
}

export function auditPitcherCandidate(
  player: Player,
  strategy: TeamStrategy,
  usage: 'starter' | 'bullpen' | 'closer',
  baseScore: number,
  seasonAppearances = 0,
): CandidateAudit {
  const velocity = player.p.vel ?? 50;
  const control = player.p.ctrl ?? 50;
  const stamina = player.p.stam ?? 50;
  const movement = player.p.nobi ?? 50;
  const roleFit =
    usage === 'starter'
      ? stamina * 0.22
      : usage === 'closer'
        ? velocity * 0.14 + movement * 0.1
        : control * 0.11 + movement * 0.09;
  // Starter order must remain stable across the season: dynamically re-sorting the whole
  // rotation around its current index can accidentally give one ace 40-50 starts.
  // Fatigued starters are skipped by resolveStarterRotation; relief ranking remains dynamic.
  const fatigue =
    usage === 'starter' ? 0 : -Number(player.fatigue ?? 0) * strategy.fatigueReaction * 0.13;
  const consecutive =
    usage === 'starter'
      ? 0
      : -Number(player.consecutivePitchingGames ?? 0) * 3.5 * strategy.fatigueReaction;
  const fixed = usage === 'starter' && player.role === '先発' ? strategy.fixedStarterBias * 8 : 0;
  const injury = (player.injuryDays ?? 0) > 0 ? -1000 : 0;
  const youth = player.age <= 25 ? (26 - player.age) * strategy.youthPreference : 0;
  const veteran = player.age >= 32 ? (player.age - 31) * strategy.veteranPreference * 0.7 : 0;
  // Keep trusted arms in important games, but make the penalty accelerate after roughly
  // one appearance every three team games so the same reliever is not pushed toward
  // 80-90 outings while rested alternatives sit unused.
  const seasonUsage =
    usage === 'starter' ? 0 : -seasonAppearances * 0.2 - Math.max(0, seasonAppearances - 45) * 1.25;
  const components = [
    component('base', '基礎評価', baseScore * 0.75),
    component('role', '役割適性', roleFit),
    component('fixed', '固定起用', fixed),
    component('youth', '若手起用', youth),
    component('veteran', '経験値', veteran),
    component('fatigue', '疲労', fatigue),
    component('consecutive', '連投', consecutive),
    component('seasonUsage', '年間登板負荷', seasonUsage),
    component('injury', '怪我', injury),
  ];
  const score = round(components.reduce((sum, item) => sum + item.value, 0));
  const reasons = [...components]
    .filter((item) => Math.abs(item.value) >= 3)
    .sort((first, second) => Math.abs(second.value) - Math.abs(first.value))
    .slice(0, 4)
    .map((item) => `${item.label}${item.value >= 0 ? '+' : ''}${item.value.toFixed(1)}`);
  return { playerId: player.id, playerName: player.name, score, components, reasons };
}

export function auditTeamLineup(
  team: Team,
  positionScores: (player: Player, position: FieldPosition) => number,
): Record<FieldPosition, CandidateAudit[]> {
  const strategy = teamStrategyFor(team.key);
  const positions: FieldPosition[] = [
    '捕手',
    '一塁手',
    '二塁手',
    '三塁手',
    '遊撃手',
    '左翼手',
    '中堅手',
    '右翼手',
  ];
  return Object.fromEntries(
    positions.map((position) => [
      position,
      team.fielders
        .filter(
          (player) =>
            player.pos === position || player.positions?.some((entry) => entry.pos === position),
        )
        .map((player) =>
          auditLineupCandidate(player, position, strategy, positionScores(player, position)),
        )
        .sort((first, second) => second.score - first.score),
    ]),
  ) as Record<FieldPosition, CandidateAudit[]>;
}

export function strategyLabel(strategy: TeamStrategy): string {
  const labels: Record<TeamPhilosophy, string> = {
    balanced: '総合力重視',
    power: '長打力重視',
    onBase: '出塁重視',
    speed: '機動力重視',
    defense: '守備重視',
    youth: '若手育成重視',
    veteran: '経験重視',
  };
  return labels[strategy.philosophy];
}

export function sacrificeBuntAttemptRate(
  batter: Player,
  strategy: TeamStrategy,
  context: {
    inning: number;
    outs: number;
    bases: [boolean, boolean, boolean];
    scoreDifference: number;
  },
): number {
  if (context.outs !== 0 || context.bases[2] || (!context.bases[0] && !context.bases[1])) return 0;
  const sacrifice = AT_BAT_BALANCE.sacrificeBunt;
  const buntRating = batter.p.bnt ?? 50;
  const power = batter.p.pw ?? 50;
  const level = specialLevel(batter, 'bnt');
  const abilityRate =
    Math.max(0, buntRating - sacrifice.minimumBuntRating) / sacrifice.attemptRatingScale +
    level * sacrifice.attemptPerSpecialLevel +
    (power < sacrifice.weakHitterPowerThreshold ? sacrifice.weakHitterAttemptBonus : 0);
  const scoreFactor =
    context.scoreDifference <= -2
      ? 0.24
      : context.scoreDifference >= 2
        ? 0.48
        : context.inning >= 7
          ? 1.38
          : context.inning <= 3
            ? 0.72
            : 1;
  return clamp(
    abilityRate * strategy.buntAggression * scoreFactor,
    0,
    sacrifice.maximumAttemptRate * 1.5,
  );
}

export function sacrificeBuntSuccessRate(batter: Player): number {
  const sacrifice = AT_BAT_BALANCE.sacrificeBunt;
  const buntRating = batter.p.bnt ?? 50;
  return clamp(
    sacrifice.baseSuccessRate +
      (buntRating - 50) / sacrifice.successRatingScale +
      specialLevel(batter, 'bnt') * sacrifice.successPerSpecialLevel,
    sacrifice.minimumSuccessRate,
    sacrifice.maximumSuccessRate,
  );
}

export function stealAttemptRate(
  runner: Player,
  catcher: Player | undefined,
  pitcher: Player,
  strategy: TeamStrategy,
  context: { inning: number; outs: number; scoreDifference: number },
): number {
  if (context.outs >= 2) return 0;
  let abilityRate = clamp((((runner.p.sp ?? 50) - 30) / 260) * 0.55, 0.01, 0.13);
  if (hasSpecial(runner, 'sb')) abilityRate *= 1.4;
  if (hasGold(runner, 'sb_gold')) abilityRate *= 1.6;
  const catcherArm =
    (catcher?.p.arm ?? 50) +
    (catcher ? specialLevel(catcher, 'strong_arm') * FIELDING_BALANCE.strongArmPerLevel : 0);
  const deterrence = clamp(
    1 - Math.max(0, catcherArm - 50) / 170 - Math.max(0, (pitcher.p.ctrl ?? 50) - 50) / 330,
    0.52,
    1.08,
  );
  const scoreFactor =
    context.scoreDifference <= -2
      ? 0.36
      : context.scoreDifference >= 3
        ? 0.5
        : context.inning >= 7 && Math.abs(context.scoreDifference) <= 1
          ? 1.24
          : context.inning <= 2
            ? 0.82
            : 1;
  // Situational restraint and battery deterrence both reduce attempts. This calibration
  // preserves the existing league-wide opportunity rate while redistributing attempts
  // toward speed clubs, close games, and favorable batteries.
  const leagueRateCalibration = 1.4;
  return clamp(
    abilityRate * strategy.stealAggression * deterrence * scoreFactor * leagueRateCalibration,
    0.004,
    0.22,
  );
}

export function stealSuccessRate(
  runner: Player,
  catcher: Player | undefined,
  pitcher: Player,
): number {
  const catcherArm =
    (catcher?.p.arm ?? 50) +
    (catcher ? specialLevel(catcher, 'strong_arm') * FIELDING_BALANCE.strongArmPerLevel : 0);
  const defensePenalty = (catcherArm - 50) / 420 + ((pitcher.p.ctrl ?? 50) - 50) / 900;
  return clamp(
    (0.62 + ((runner.p.sp ?? 50) - 50) / 280 - defensePenalty) *
      (hasGold(runner, 'sb_gold') ? 1.12 : 1),
    0.4,
    0.92,
  );
}

// A runner alone on second (first and third open) can break for third. Real basestealers
// try this far less often than second - the payoff is smaller and a passed ball or wild
// pitch can score them from third anyway - but succeed noticeably more often once they go,
// since the throw is longer and nobody is usually holding third close.
export function stealThirdAttemptRate(
  runner: Player,
  catcher: Player | undefined,
  pitcher: Player,
  strategy: TeamStrategy,
  context: { inning: number; outs: number; scoreDifference: number },
): number {
  if (context.outs >= 2) return 0;
  let abilityRate = clamp((((runner.p.sp ?? 50) - 30) / 260) * 0.32, 0.005, 0.075);
  if (hasSpecial(runner, 'sb')) abilityRate *= 1.35;
  if (hasGold(runner, 'sb_gold')) abilityRate *= 1.5;
  const catcherArm =
    (catcher?.p.arm ?? 50) +
    (catcher ? specialLevel(catcher, 'strong_arm') * FIELDING_BALANCE.strongArmPerLevel : 0);
  const deterrence = clamp(
    1 - Math.max(0, catcherArm - 50) / 190 - Math.max(0, (pitcher.p.ctrl ?? 50) - 50) / 360,
    0.55,
    1.1,
  );
  const scoreFactor =
    context.scoreDifference <= -2
      ? 0.36
      : context.scoreDifference >= 3
        ? 0.5
        : context.inning >= 7 && Math.abs(context.scoreDifference) <= 1
          ? 1.24
          : context.inning <= 2
            ? 0.82
            : 1;
  return clamp(abilityRate * strategy.stealAggression * deterrence * scoreFactor, 0.002, 0.1);
}

export function stealThirdSuccessRate(
  runner: Player,
  catcher: Player | undefined,
  pitcher: Player,
): number {
  const catcherArm =
    (catcher?.p.arm ?? 50) +
    (catcher ? specialLevel(catcher, 'strong_arm') * FIELDING_BALANCE.strongArmPerLevel : 0);
  const defensePenalty = (catcherArm - 50) / 520 + ((pitcher.p.ctrl ?? 50) - 50) / 1000;
  return clamp(
    (0.74 + ((runner.p.sp ?? 50) - 50) / 320 - defensePenalty) *
      (hasGold(runner, 'sb_gold') ? 1.08 : 1),
    0.5,
    0.95,
  );
}

function approximatePositionScore(player: Player, position: FieldPosition): number {
  const contact = ((player.p.cf ?? 50) + (player.p.cb ?? 50)) / 2;
  const offense =
    contact * 0.42 +
    (player.p.pw ?? 50) * 0.28 +
    (player.p.dc ?? 50) * 0.18 +
    (player.p.sp ?? 50) * 0.12;
  const defense =
    (player.p.df ?? 50) * 0.62 +
    (player.p.arm ?? 50) * 0.28 +
    (position === '捕手' ? (player.p.ld ?? 0) * 0.1 : 0);
  const aptitude =
    player.pos === position
      ? 100
      : (player.positions?.find((entry) => entry.pos === position)?.apt ?? 35);
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
    const selected = players
      .filter((player) => !used.has(player.id))
      .sort((a, b) => score(b) - score(a))[0];
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
  const remaining = players
    .filter((player) => !used.has(player.id))
    .sort((a, b) => runCreation(b) - runCreation(a));
  let remainingIndex = 0;
  for (let index = 0; index < slots.length; index += 1)
    if (!slots[index]) slots[index] = remaining[remainingIndex++];
  return slots.filter((player): player is Player => Boolean(player));
}

export function strategicBestLineup(
  team: Team,
  strategy: TeamStrategy = teamStrategyFor(team.key),
): { lineup: Player[]; audit: Record<FieldPosition, CandidateAudit[]> } {
  const pool = selectRosterPool(team.fielders, 9);
  const positions: FieldPosition[] = [
    '捕手',
    '遊撃手',
    '中堅手',
    '二塁手',
    '三塁手',
    '左翼手',
    '右翼手',
    '一塁手',
  ];
  const audit = Object.fromEntries(
    positions.map((position) => [
      position,
      pool
        .filter(
          (player) =>
            player.pos === position || player.positions?.some((entry) => entry.pos === position),
        )
        .map((player) =>
          auditLineupCandidate(
            player,
            position,
            strategy,
            approximatePositionScore(player, position),
          ),
        )
        .sort((first, second) => second.score - first.score),
    ]),
  ) as Record<FieldPosition, CandidateAudit[]>;
  const used = new Set<string>();
  const selected: Player[] = [];
  for (const position of positions) {
    const choice = audit[position].find((entry) => {
      if (used.has(entry.playerId)) return false;
      const player = pool.find((candidate) => candidate.id === entry.playerId);
      return (
        !player ||
        !isForeignPlayer(player) ||
        selected.filter(isForeignPlayer).length < FOREIGN_PLAYER_BALANCE.simultaneousHitterLimit
      );
    });
    const player = choice ? pool.find((candidate) => candidate.id === choice.playerId) : undefined;
    if (!player) continue;
    used.add(player.id);
    selected.push({ ...player, _assignedPos: position });
  }
  for (const player of [...pool].sort(
    (first, second) => designatedHitterScore(second) - designatedHitterScore(first),
  )) {
    if (selected.length >= 9) break;
    if (
      used.has(player.id) ||
      (isForeignPlayer(player) &&
        selected.filter(isForeignPlayer).length >= FOREIGN_PLAYER_BALANCE.simultaneousHitterLimit)
    )
      continue;
    selected.push({ ...player, _assignedPos: undefined, _isDH: true });
    used.add(player.id);
  }
  return { lineup: strategicBattingOrder(selected.slice(0, 9), strategy), audit };
}

export function strategicPitcherOrder(
  team: Team,
  usage: 'starter' | 'bullpen' | 'closer',
  strategy: TeamStrategy = teamStrategyFor(team.key),
  accumulatedStats: AccumulatedStats = {},
): CandidateAudit[] {
  const role = usage === 'starter' ? '先発' : usage === 'closer' ? 'クローザー' : 'リリーフ';
  const eligible = team.pitchers.filter(
    (player) => player.role === role && (player.injuryDays ?? 0) <= 0,
  );
  const active = eligible.filter((player) => player.activeRoster !== false);
  const pool = active.length ? active : eligible;
  return pool
    .map((player) => {
      const base =
        (player.p.vel ?? 50) * 0.28 +
        (player.p.ctrl ?? 50) * 0.3 +
        (player.p.stam ?? 50) * 0.22 +
        (player.p.nobi ?? 50) * 0.2;
      const stats = accumulatedStats[player.id];
      const seasonAppearances = stats?.type === 'pit' ? stats.g : 0;
      return auditPitcherCandidate(player, strategy, usage, base, seasonAppearances);
    })
    .sort((first, second) => second.score - first.score);
}

export function strategicPitcherPlan(
  team: Team,
  strategy: TeamStrategy = teamStrategyFor(team.key),
  accumulatedStats: AccumulatedStats = {},
): StrategicPitcherPlan {
  return {
    rotationOrder: strategicPitcherOrder(team, 'starter', strategy, accumulatedStats)
      .slice(0, team.rotSize || 6)
      .map((entry) => entry.playerId),
    closerPriority: strategicPitcherOrder(team, 'closer', strategy, accumulatedStats).map(
      (entry) => entry.playerId,
    ),
    bullpenPriority: strategicPitcherOrder(team, 'bullpen', strategy, accumulatedStats).map(
      (entry) => entry.playerId,
    ),
  };
}

function tacticLine(decisions: ManagementDecision[]): TacticAuditLine {
  const attempts = decisions.filter((decision) => decision.attempted);
  const holds = decisions.filter((decision) => !decision.attempted);
  const successes = attempts.filter((decision) => decision.success).length;
  const average = (items: ManagementDecision[]): number =>
    items.length
      ? items.reduce((sum, decision) => sum + (decision.runsAfterDecision ?? 0), 0) / items.length
      : 0;
  return {
    opportunities: decisions.length,
    attempts: attempts.length,
    successes,
    attemptRate: decisions.length ? attempts.length / decisions.length : 0,
    successRate: attempts.length ? successes / attempts.length : 0,
    averageRunsAfterAttempt: average(attempts),
    averageRunsAfterHold: average(holds),
  };
}

export function auditGameManagement(games: GameState[]): TeamManagementAudit[] {
  const decisions = games.flatMap((game) => game.managementLog ?? []);
  const teamKeys = [...new Set(decisions.map((decision) => decision.teamKey))];
  return teamKeys.map((teamKey) => {
    const teamDecisions = decisions.filter((decision) => decision.teamKey === teamKey);
    const bunt = tacticLine(teamDecisions.filter((decision) => decision.type === 'bunt'));
    const steal = tacticLine(teamDecisions.filter((decision) => decision.type === 'steal'));
    const warnings: string[] = [];
    if (bunt.opportunities >= 100 && bunt.attempts === 0)
      warnings.push('犠打機会が100回以上あるのに企図がありません');
    if (bunt.opportunities >= 30 && bunt.attemptRate > 0.28)
      warnings.push(`犠打企図率が高すぎます (${(bunt.attemptRate * 100).toFixed(1)}%)`);
    if (steal.opportunities >= 100 && steal.attempts < 2)
      warnings.push('盗塁機会が100回以上あるのに企図がほぼありません');
    if (steal.opportunities >= 40 && steal.attemptRate > 0.3)
      warnings.push(`盗塁企図率が高すぎます (${(steal.attemptRate * 100).toFixed(1)}%)`);
    if (steal.attempts >= 20 && (steal.successRate < 0.5 || steal.successRate > 0.92))
      warnings.push(`盗塁成功率が極端です (${(steal.successRate * 100).toFixed(1)}%)`);
    return {
      teamKey,
      bunt,
      steal,
      pitchingChanges: teamDecisions.filter((decision) => decision.type === 'pitchingChange')
        .length,
      warnings,
    };
  });
}
