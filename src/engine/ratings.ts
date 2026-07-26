import {
  FOREIGN_PLAYER_BALANCE,
  DISPLAY_OVR_GOLD_SPECIAL_MULTIPLIER,
  DISPLAY_OVR_NORMAL_SPECIAL_MULTIPLIER,
  DISPLAY_OVR_SPECIAL_ADJUSTMENT_MAX,
  DISPLAY_OVR_SPECIAL_ADJUSTMENT_MIN,
  NEGATIVE_SPECIAL_IDS,
  OVR_W,
  OVR_W_PIT,
  SPECIAL_INDEX,
} from '../data';
import { foreignPerformanceMultiplier, isForeignPlayer } from './foreign';
import { specialLevel } from './specials';
import type { AccumulatedStats, FieldPosition, Player, SpecialAbility, Team } from './types';

export interface DisplayOVROptions {
  includeSpecials?: boolean;
  clampAdjustment?: boolean;
}

export interface DisplayOVRBreakdown {
  base: number;
  rawSpecialAdjustment: number;
  specialAdjustment: number;
  total: number;
}

export const APTITUDE_RANK_THRESHOLDS = [
  { minimum: 95, rank: 'S' },
  { minimum: 85, rank: 'A' },
  { minimum: 75, rank: 'B' },
  { minimum: 65, rank: 'C' },
  { minimum: 55, rank: 'D' },
  { minimum: 45, rank: 'E' },
  { minimum: 35, rank: 'F' },
  { minimum: 0, rank: 'G' },
] as const;

export function calcOVR(player: Player | undefined, position?: FieldPosition): number {
  if (!player) return 50;
  const adaptationFactor = foreignPerformanceMultiplier(player);
  if (player.isP) {
    const weights = OVR_W_PIT[player.role ?? 'リリーフ'],
      params = player.p;
    return Math.round(
      ((params.vel ?? 50) * weights.vel +
        (params.ctrl ?? 50) * weights.ctrl +
        (params.stam ?? 50) * weights.stam +
        (params.nobi ?? 50) * weights.nobi +
        (params.fld ?? 50) * weights.fld) *
        adaptationFactor,
    );
  }
  const resolved = position ?? player._assignedPos ?? player.pos ?? '左翼手',
    weights = OVR_W[resolved],
    params = player.p;
  return Math.round(
    ((params.cf ?? 50) * weights.cf +
      (params.cb ?? 50) * weights.cb +
      (params.pw ?? 50) * weights.pw +
      (params.dc ?? 50) * weights.dc +
      (params.sp ?? 50) * weights.sp +
      (params.df ?? 50) * weights.df +
      (params.arm ?? 50) * weights.arm +
      (params.ld ?? 0) * weights.ld +
      (params.stam ?? 50) * weights.stam) *
      adaptationFactor,
  );
}
export function aptitudeFor(player: Player, position: FieldPosition): number {
  if (!player.positions) return player.pos === position ? 100 : 55;
  const aptitude = player.positions.find((candidate) => candidate.pos === position);
  return aptitude?.apt ?? (player.pos === position ? 100 : 45);
}
export function aptitudeRank(value: number): string {
  const normalized = Math.max(0, Math.min(100, value));
  return APTITUDE_RANK_THRESHOLDS.find((threshold) => normalized >= threshold.minimum)?.rank ?? 'G';
}
export function effectiveOVR(player: Player | undefined, position?: FieldPosition): number {
  if (!player) return 50;
  const resolved = position ?? player._assignedPos ?? player.pos ?? '左翼手';
  return Math.round(
    calcOVR(player, resolved) * (0.7 + (aptitudeFor(player, resolved) / 100) * 0.3),
  );
}

function displayBaseOVR(player: Player | undefined, position?: FieldPosition): number {
  if (!player) return 50;
  return player.isP ? calcOVR(player) : effectiveOVR(player, position);
}

function specialDefinitions(player: Player): SpecialAbility[] {
  const ids = new Set<string>([
    ...(player.specials ?? []).map((special) => special.id),
    ...Object.keys(player.specialLevels ?? {}),
  ]);
  return [...ids]
    .map((id) => {
      const embedded = player.specials?.find((special) => special.id === id);
      return SPECIAL_INDEX[id] ?? embedded;
    })
    .filter((special): special is SpecialAbility => Boolean(special));
}

export function displayOVRBreakdown(
  player: Player | undefined,
  position?: FieldPosition,
  options: DisplayOVROptions = {},
): DisplayOVRBreakdown {
  const base = displayBaseOVR(player, position);
  if (!player || options.includeSpecials === false) {
    return { base, rawSpecialAdjustment: 0, specialAdjustment: 0, total: base };
  }

  const negativeIds = new Set<string>(NEGATIVE_SPECIAL_IDS);
  const rawSpecialAdjustment = specialDefinitions(player).reduce((total, special) => {
    const level = specialLevel(player, special.id);
    if (level <= 0) return total;
    const multiplier =
      special.rarity === 'gold'
        ? DISPLAY_OVR_GOLD_SPECIAL_MULTIPLIER
        : DISPLAY_OVR_NORMAL_SPECIAL_MULTIPLIER;
    const sign = negativeIds.has(special.id) ? -1 : 1;
    return total + sign * special.p * level * multiplier;
  }, 0);
  const clampedAdjustment =
    options.clampAdjustment === false
      ? rawSpecialAdjustment
      : Math.max(
          DISPLAY_OVR_SPECIAL_ADJUSTMENT_MIN,
          Math.min(DISPLAY_OVR_SPECIAL_ADJUSTMENT_MAX, rawSpecialAdjustment),
        );
  const specialAdjustment = Math.round(clampedAdjustment * 10) / 10;

  return {
    base,
    rawSpecialAdjustment,
    specialAdjustment,
    total: Math.round(base + specialAdjustment),
  };
}

export function displayOVR(
  player: Player | undefined,
  position?: FieldPosition,
  options: DisplayOVROptions = {},
): number {
  return displayOVRBreakdown(player, position, options).total;
}

function takeHighestScoring(
  players: Player[],
  used: Set<string>,
  score: (player: Player) => number,
): Player | undefined {
  const selected = players
    .filter((player) => !used.has(player.id))
    .sort((first, second) => score(second) - score(first))[0];
  if (selected) used.add(selected.id);
  return selected;
}

export function orderBattingLineup(players: Player[]): Player[] {
  if (players.length < 3) return [...players];
  const used = new Set<string>(),
    contact = (player: Player) => ((player.p.cf ?? 50) + (player.p.cb ?? 50)) / 2,
    discipline = (player: Player) => player.p.dc ?? 50,
    power = (player: Player) => player.p.pw ?? 50,
    speed = (player: Player) => player.p.sp ?? 50,
    onBase = (player: Player) => contact(player) * 0.7 + discipline(player) * 0.3,
    runCreation = (player: Player) =>
      contact(player) * 0.45 + discipline(player) * 0.2 + power(player) * 0.35,
    cleanup = (player: Player) =>
      power(player) * 0.65 + contact(player) * 0.25 + discipline(player) * 0.1,
    leadoff = (player: Player) => onBase(player) * 0.7 + speed(player) * 0.3,
    secondHitter = (player: Player) =>
      contact(player) * 0.5 + onBase(player) * 0.35 + speed(player) * 0.15;
  const slots: Array<Player | undefined> = Array.from({ length: players.length });
  slots[3] = takeHighestScoring(players, used, cleanup);
  slots[2] = takeHighestScoring(players, used, runCreation);
  slots[4] = takeHighestScoring(players, used, cleanup);
  slots[0] = takeHighestScoring(players, used, leadoff);
  slots[1] = takeHighestScoring(players, used, secondHitter);
  const remaining = players
    .filter((player) => !used.has(player.id))
    .sort((first, second) => runCreation(second) - runCreation(first));
  let remainingIndex = 0;
  for (let index = 0; index < slots.length; index += 1)
    if (!slots[index]) slots[index] = remaining[remainingIndex++];
  return slots.filter((player): player is Player => Boolean(player));
}

/**
 * Prefer healthy, non-fatigued players from the 一軍(active) roster, falling back
 * through fatigue, then injury-only, then the full roster (including 二軍) as each
 * tier fails to meet `minimumSize` (activeRoster is undefined for every existing
 * save/CPU player, so this collapses to a simple two-pool fallback for them).
 * Shared by bestLineup, topStarters, and strategicBestLineup so the fallback order
 * can't drift between the three independent copies that used to exist here.
 */
export function selectRosterPool<
  T extends { activeRoster?: boolean; injuryDays?: number; fatigue?: number },
>(allPlayers: T[], minimumSize: number): T[] {
  const active = allPlayers.filter((player) => player.activeRoster !== false);
  const pools = [
    active.filter((player) => (player.injuryDays ?? 0) <= 0 && (player.fatigue ?? 0) < 85),
    active.filter((player) => (player.injuryDays ?? 0) <= 0),
    allPlayers.filter((player) => (player.injuryDays ?? 0) <= 0 && (player.fatigue ?? 0) < 85),
    allPlayers.filter((player) => (player.injuryDays ?? 0) <= 0),
  ];
  return (
    pools.find((candidate) => candidate.length >= minimumSize) ?? (pools[pools.length - 1] as T[])
  );
}

export function bestLineup(team: Team): Player[] {
  const used = new Set<string>(),
    lineup: Player[] = [];
  const pool = selectRosterPool(team.fielders, 9);
  const priority: FieldPosition[] = [
    '捕手',
    '遊撃手',
    '中堅手',
    '二塁手',
    '三塁手',
    '左翼手',
    '右翼手',
    '一塁手',
  ];
  for (const position of priority) {
    const candidates = pool
      .filter(
        (f) =>
          !used.has(f.id) &&
          (!isForeignPlayer(f) ||
            lineup.filter(isForeignPlayer).length <
              FOREIGN_PLAYER_BALANCE.simultaneousHitterLimit) &&
          (f.pos === position || f.positions?.some((entry) => entry.pos === position)),
      )
      .sort((a, b) => effectiveOVR(b, position) - effectiveOVR(a, position));
    if (candidates.length) {
      const selected = candidates[0] as Player;
      used.add(selected.id);
      lineup.push({ ...selected, _assignedPos: position });
    }
  }
  for (const fielder of pool
    .filter((player) => !used.has(player.id))
    .sort((first, second) => calcOVR(second) - calcOVR(first))) {
    if (lineup.length >= 9) break;
    if (
      isForeignPlayer(fielder) &&
      lineup.filter(isForeignPlayer).length >= FOREIGN_PLAYER_BALANCE.simultaneousHitterLimit
    )
      continue;
    lineup.push({ ...fielder, _assignedPos: fielder.pos });
  }
  return orderBattingLineup(lineup.slice(0, 9));
}
export function topStarters(team: Team): Player[] {
  const slotCount = team.rotSize || 6;
  const starters = team.pitchers.filter((p) => p.role === '先発');
  // minimumSize 1: "any healthy starters at all" wins (not "enough to fill every
  // slot") — a thin healthy pool still starts.
  const pool = selectRosterPool(starters, 1);
  return pool.sort((a, b) => calcOVR(b) - calcOVR(a)).slice(0, slotCount);
}
export function masteryFromAccum(player: Player, accumulated: AccumulatedStats): number {
  const stats = accumulated[player.id];
  if (player.isP) {
    const outs = stats?.type === 'pit' ? stats.ip3 : 0;
    return Math.min(1, 0.75 + (outs / 300) * 0.25);
  }
  const pa = stats?.type === 'bat' ? stats.pa : 0;
  return Math.min(1, 0.75 + (pa / 500) * 0.25);
}
