import { CLUB_PLAN_BALANCE } from '../data';
import { budgetRoom, financeOf, type SeasonOutcome } from './contracts';
import { calcOVR } from './ratings';
import type { Player, Team } from './types';

/** How a CPU club approaches the winter: spend to win now, sell veterans for youth, or
 * neither. Recomputed each offseason from the season just played; never saved. */
export type ClubPlanMode = 'contend' | 'rebuild' | 'balanced';

export interface ClubPlan {
  mode: ClubPlanMode;
  winPct: number;
  /** Average age of the club's fifteen best players. */
  coreAge: number;
}

export const CLUB_PLAN_LABEL: Record<ClubPlanMode, string> = {
  contend: '勝負',
  rebuild: '再建',
  balanced: '中庸',
};

const ovr = (player: Player) => calcOVR(player, player.isP ? undefined : player.pos);

export function coreAge(team: Team): number {
  const core = [...team.pitchers, ...team.fielders]
    .sort((first, second) => ovr(second) - ovr(first))
    .slice(0, CLUB_PLAN_BALANCE.coreSize);
  return core.reduce((total, player) => total + player.age, 0) / Math.max(1, core.length);
}

export function clubPlanFor(team: Team, outcome?: SeasonOutcome): ClubPlan {
  const balance = CLUB_PLAN_BALANCE;
  const standing = outcome?.standings[team.key];
  const winPct =
    standing && standing.w + standing.l > 0 ? standing.w / (standing.w + standing.l) : 0.5;
  const age = coreAge(team);
  // Before any games (a new season, or no season at all) there is nothing to plan on.
  if (!standing || standing.w + standing.l === 0) return { mode: 'balanced', winPct, coreAge: age };
  const roomy = budgetRoom(team) > financeOf(team).budget * balance.contendBudgetRoomShare;
  const mode: ClubPlanMode =
    winPct < balance.rebuildWinPct ||
    (winPct < balance.agingRebuildWinPct && age >= balance.agingCore)
      ? 'rebuild'
      : winPct >= balance.contendWinPct || (winPct >= 0.5 && roomy)
        ? 'contend'
        : 'balanced';
  return { mode, winPct, coreAge: age };
}

/** Bid adjustment in the free-agent market: a contender pays for proven help, a
 * rebuilding club only for players young enough to be part of its next good team. */
export function planBidAdjustment(plan: ClubPlan, player: Player): number {
  const balance = CLUB_PLAN_BALANCE;
  if (plan.mode === 'contend') return balance.contendBidBonus;
  if (plan.mode === 'rebuild')
    return player.age <= balance.youngAge
      ? balance.rebuildYoungBidBonus
      : -balance.rebuildVeteranBidPenalty;
  return 0;
}

/** Trade value adjustment for giving up `outgoing` and receiving `incoming`: a rebuilding
 * club gains by getting younger, a contender by getting better now. */
export function planTradeAdjustment(plan: ClubPlan, outgoing: Player, incoming: Player): number {
  const balance = CLUB_PLAN_BALANCE;
  if (plan.mode === 'rebuild') return (outgoing.age - incoming.age) * balance.rebuildAgeTradeWeight;
  if (plan.mode === 'contend')
    return (ovr(incoming) - ovr(outgoing)) * balance.contendOvrTradeWeight;
  return 0;
}

/** Roster-cut adjustment: a rebuilding club keeps its young players and lets veterans go. */
export function planRetentionAdjustment(plan: ClubPlan | undefined, player: Player): number {
  if (plan?.mode !== 'rebuild') return 0;
  const balance = CLUB_PLAN_BALANCE;
  return (balance.youngAge - player.age) * balance.rebuildRetentionPerYear;
}
