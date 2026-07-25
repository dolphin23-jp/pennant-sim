import type { FieldPosition, Player, Team, TeamKey } from './types';

export type TeamPhilosophy =
  | 'balanced'
  | 'power'
  | 'onBase'
  | 'speed'
  | 'defense'
  | 'youth'
  | 'veteran';

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
): CandidateAudit {
  const velocity = player.p.vel ?? 50;
  const control = player.p.ctrl ?? 50;
  const stamina = player.p.stam ?? 50;
  const movement = player.p.nobi ?? 50;
  const roleFit =
    usage === 'starter'
      ? stamina * 0.22
      : usage === 'closer'
        ? (velocity * 0.14 + movement * 0.1)
        : (control * 0.11 + movement * 0.09);
  const fatigue = -Number(player.fatigue ?? 0) * strategy.fatigueReaction * 0.13;
  const consecutive = -Number(player.consecutivePitchingGames ?? 0) * 3.5 * strategy.fatigueReaction;
  const fixed = usage === 'starter' && player.role === '先発' ? strategy.fixedStarterBias * 8 : 0;
  const injury = (player.injuryDays ?? 0) > 0 ? -1000 : 0;
  const youth = player.age <= 25 ? (26 - player.age) * strategy.youthPreference : 0;
  const veteran = player.age >= 32 ? (player.age - 31) * strategy.veteranPreference * 0.7 : 0;
  const components = [
    component('base', '基礎評価', baseScore * 0.75),
    component('role', '役割適性', roleFit),
    component('fixed', '固定起用', fixed),
    component('youth', '若手起用', youth),
    component('veteran', '経験値', veteran),
    component('fatigue', '疲労', fatigue),
    component('consecutive', '連投', consecutive),
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
  const positions: FieldPosition[] = ['捕手', '一塁手', '二塁手', '三塁手', '遊撃手', '左翼手', '中堅手', '右翼手'];
  return Object.fromEntries(
    positions.map((position) => [
      position,
      team.fielders
        .filter((player) => player.pos === position || player.positions?.some((entry) => entry.pos === position))
        .map((player) => auditLineupCandidate(player, position, strategy, positionScores(player, position)))
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
