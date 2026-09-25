import { CENTRAL, CONTRACT_BALANCE, FINANCE_BALANCE, PACIFIC, TINFO } from '../data';
import { isForeignPlayer } from './foreign';
import { popularityRevenueFactor } from './popularity';
import { clamp } from './random';
import { calcOVR } from './ratings';
import type {
  AccumulatedStats,
  Player,
  PlayerStats,
  StandingRecord,
  Team,
  TeamFinance,
  TeamKey,
  Teams,
} from './types';

const teamKeys = (): TeamKey[] => [...CENTRAL, ...PACIFIC];
const playerOvr = (player: Player): number => calcOVR(player, player.isP ? undefined : player.pos);
const rosterOf = (team: Team): Player[] => [...team.pitchers, ...team.fielders];

/** Salaries are quoted the way NPB reports them: 10万 steps below 1,000万, 100万 steps
 * below 1億 and 1,000万 steps above. */
export function roundSalary(value: number): number {
  const step = value < 1000 ? 10 : value < 10000 ? 100 : 1000;
  return clamp(
    Math.round(value / step) * step,
    CONTRACT_BALANCE.minimumSalary,
    CONTRACT_BALANCE.maximumSalary,
  );
}

/** Budgets and revenue move in 1,000万 steps. */
const roundBudget = (value: number): number => Math.round(value / 1000) * 1000;

/** "1億2000万円" / "8500万円". */
export function formatManYen(value: number): string {
  const rounded = Math.round(value);
  const oku = Math.floor(rounded / 10000);
  const man = rounded % 10000;
  if (!oku) return `${man.toLocaleString()}万円`;
  return man ? `${oku}億${man}万円` : `${oku}億円`;
}

/** What the open market pays this player for one season. Above 3億 the curve flattens,
 * so only the very best reach the maximum. */
export function marketSalary(player: Player): number {
  const balance = CONTRACT_BALANCE;
  const curve =
    balance.curveBase * Math.exp((playerOvr(player) - balance.curvePivot) / balance.curveScale);
  const base =
    curve > balance.compressionStart
      ? balance.compressionStart * (1 + Math.log(curve / balance.compressionStart))
      : curve;
  const ageFactor =
    player.age > balance.declineAge
      ? Math.max(
          balance.minimumAgeFactor,
          1 - (player.age - balance.declineAge) * balance.declinePerYear,
        )
      : 1;
  return roundSalary(base * ageFactor);
}

export function domesticFreeAgencyYears(player: Player): number {
  return player.draftOrigin === '高卒'
    ? CONTRACT_BALANCE.domesticFreeAgencyYearsHighSchool
    : CONTRACT_BALANCE.domesticFreeAgencyYears;
}

/** Service years the player's current FA rights are measured from. */
function serviceSinceRights(player: Player): number {
  const service = player.serviceYears ?? 0;
  return player.faExercisedAt == null ? service : service - player.faExercisedAt;
}

/** Holds domestic FA rights (first acquisition, or re-acquired four years after using them). */
export function hasDomesticFreeAgency(player: Player): boolean {
  if (isForeignPlayer(player)) return false;
  return player.faExercisedAt == null
    ? (player.serviceYears ?? 0) >= domesticFreeAgencyYears(player)
    : serviceSinceRights(player) >= CONTRACT_BALANCE.reacquireYears;
}

export function hasOverseasFreeAgency(player: Player): boolean {
  if (isForeignPlayer(player)) return false;
  return player.faExercisedAt == null
    ? (player.serviceYears ?? 0) >= CONTRACT_BALANCE.overseasFreeAgencyYears
    : serviceSinceRights(player) >= CONTRACT_BALANCE.reacquireYears;
}

/** Seasons until domestic FA rights, or 0 when the player holds them. */
export function yearsUntilFreeAgency(player: Player): number | null {
  if (isForeignPlayer(player)) return null;
  const needed =
    player.faExercisedAt == null
      ? domesticFreeAgencyYears(player)
      : player.faExercisedAt + CONTRACT_BALANCE.reacquireYears;
  return Math.max(0, needed - (player.serviceYears ?? 0));
}

/** Share of the market salary a player earns before free agency frees him to test it. */
function serviceShare(player: Player): number {
  if (isForeignPlayer(player) || hasDomesticFreeAgency(player) || player.faExercisedAt != null)
    return 1;
  return Math.min(
    1,
    CONTRACT_BALANCE.preFreeAgencyShareBase +
      CONTRACT_BALANCE.preFreeAgencySharePerYear * (player.serviceYears ?? 0),
  );
}

/** -1..1: how the season's numbers compare with an average regular's, weighted by playing
 * time. Shared with the foreign-player review. */
export function performanceSignal(player: Player, stats: PlayerStats | undefined): number {
  if (!stats) return 0;
  if (!player.isP && stats.type === 'bat') {
    const onBase = stats.ab + stats.bb > 0 ? (stats.h + stats.bb) / (stats.ab + stats.bb) : 0;
    const totalBases = stats.s + stats.d * 2 + stats.t * 3 + stats.hr * 4;
    const slugging = stats.ab > 0 ? totalBases / stats.ab : 0;
    const reliability = clamp(stats.pa / 360, 0, 1);
    return clamp(((onBase + slugging - 0.7) / 0.35) * reliability, -1, 1);
  }
  if (player.isP && stats.type === 'pit') {
    const era = stats.ip3 > 0 ? (stats.er * 27) / stats.ip3 : 9;
    const strikeoutWalkSignal = (stats.k - stats.bb * 2) / Math.max(40, stats.ip3 / 3);
    const reliability = clamp(stats.ip3 / 240, 0, 1);
    return clamp(((3.4 - era) / 2.5 + strikeoutWalkSignal * 0.15) * reliability, -1, 1);
  }
  return 0;
}

/** A rookie's first contract, by how the draft valued him. */
function rookieSalary(player: Player): number {
  const byOrigin =
    player.draftOrigin === '高卒' ? 600 : player.draftOrigin === '社会人' ? 1200 : 1000;
  return roundSalary(Math.max(byOrigin, Math.min(marketSalary(player) * 0.4, 1600)));
}

/** A reasonable salary for a player who has none yet (a legacy save or a new world). */
export function estimatedSalary(player: Player): number {
  if (player.rookieSeason) return rookieSalary(player);
  return roundSalary(marketSalary(player) * serviceShare(player));
}

export const salaryOf = (player: Player): number => player.salary ?? estimatedSalary(player);

export function teamPayroll(team: Team): number {
  return rosterOf(team).reduce((total, player) => total + salaryOf(player), 0);
}

/** The winter's salary negotiation (契約更改) for a player whose contract has run out.
 * `clubFactor` below 1 is a club over its budget holding raises down. */
export function renewalSalary(player: Player, stats?: PlayerStats, clubFactor = 1): number {
  if (player.salary == null) return estimatedSalary(player);
  const balance = CONTRACT_BALANCE;
  const target =
    marketSalary(player) *
    serviceShare(player) *
    clubFactor *
    (1 + balance.performanceShare * performanceSignal(player, stats));
  const limit =
    player.salary > balance.reductionLimitThreshold
      ? balance.reductionLimitHigh
      : balance.reductionLimitLow;
  return roundSalary(
    clamp(target, player.salary * (1 - limit), player.salary * balance.maximumRaiseMultiplier),
  );
}

/** Legacy players get service years estimated from their age and entry route. */
export function estimatedServiceYears(player: Player): number {
  if (isForeignPlayer(player)) return player.foreignProfile?.npbSeasons ?? 0;
  const entryAge = player.draftOrigin === '高卒' ? 18 : player.draftOrigin === '社会人' ? 24 : 22;
  const seasons = Math.max(0, player.age - entryAge);
  const regularShare = clamp((playerOvr(player) - 35) / 30, 0.2, 1);
  return Math.round(seasons * regularShare);
}

/** Fill in contract fields a player is missing; players that already have them are
 * returned as is. */
export function withContractDefaults(player: Player): Player {
  if (player.salary != null && player.serviceYears != null && player.contractYears != null)
    return player;
  const serviceYears = player.serviceYears ?? estimatedServiceYears(player);
  const withService = { ...player, serviceYears };
  return {
    ...withService,
    salary: player.salary ?? estimatedSalary(withService),
    contractYears: player.contractYears ?? (isForeignPlayer(player) ? 1 : 0),
  };
}

export function baseBudget(teamKey: TeamKey): number {
  return roundBudget(
    FINANCE_BALANCE.budgetAtBd60 + (TINFO[teamKey].bd - 60) * FINANCE_BALANCE.budgetPerBd,
  );
}

export const financeOf = (team: Team): TeamFinance =>
  team.finance ?? { budget: baseBudget(team.key), revenue: baseBudget(team.key) };

/** Budget left for new salaries (may be negative for a club already over budget). */
export function budgetRoom(team: Team): number {
  return financeOf(team).budget - teamPayroll(team);
}

/** Whether the club can add this salary, allowing the small overspend clubs make to
 * complete a signing. */
export function canAffordSalary(team: Team, salary: number): boolean {
  const budget = financeOf(team).budget;
  return teamPayroll(team) + salary <= budget * (1 + FINANCE_BALANCE.overspendAllowance);
}

export function withTeamContractDefaults(teams: Teams): Teams {
  const next = { ...teams };
  for (const teamKey of teamKeys()) {
    const team = next[teamKey];
    if (!team) continue;
    next[teamKey] = {
      ...team,
      finance: financeOf(team),
      pitchers: team.pitchers.map(withContractDefaults),
      fielders: team.fielders.map(withContractDefaults),
    };
  }
  return next;
}

function countsAsServiceSeason(stats: PlayerStats | undefined): boolean {
  if (!stats) return false;
  const balance = CONTRACT_BALANCE;
  if (stats.type === 'bat')
    return (
      stats.g >= balance.serviceMinimumBatterGames ||
      stats.pa >= balance.serviceMinimumBatterPlateAppearances
    );
  return (
    stats.g >= balance.serviceMinimumPitcherGames || stats.ip3 >= balance.serviceMinimumPitcherOuts
  );
}

/**
 * The season just played counts toward service time, and every contract is one season
 * shorter. With season statistics a season counts for players who were part of the top
 * team; without them (the silent burn-in) the best players by OVR stand in for them.
 */
export function accrueServiceTime(teams: Teams, seasonStats: AccumulatedStats = {}): Teams {
  const withStats = Object.keys(seasonStats).length > 0;
  const next = { ...teams };
  for (const teamKey of teamKeys()) {
    const team = next[teamKey];
    const topByOvr = (players: Player[], count: number) =>
      new Set(
        [...players]
          .sort((first, second) => playerOvr(second) - playerOvr(first))
          .slice(0, count)
          .map((player) => player.id),
      );
    const fallback = withStats
      ? new Set<string>()
      : new Set([
          ...topByOvr(team.pitchers, CONTRACT_BALANCE.serviceFallbackPitchers),
          ...topByOvr(team.fielders, CONTRACT_BALANCE.serviceFallbackFielders),
        ]);
    const accrue = (raw: Player): Player => {
      const player = withContractDefaults(raw);
      const served = withStats
        ? countsAsServiceSeason(seasonStats[player.id])
        : fallback.has(player.id);
      return {
        ...player,
        serviceYears: (player.serviceYears ?? 0) + (served ? 1 : 0),
        contractYears: Math.max(0, (player.contractYears ?? 0) - 1),
      };
    };
    next[teamKey] = {
      ...team,
      pitchers: team.pitchers.map(accrue),
      fielders: team.fielders.map(accrue),
    };
  }
  return next;
}

/**
 * 契約更改: every player whose contract has run out signs for one more season at a salary
 * that follows his value, service time and season. Multi-year deals keep their terms.
 * Run last in the winter, once the roster is final.
 */
export function renewContracts(teams: Teams, seasonStats: AccumulatedStats = {}): Teams {
  const next = { ...teams };
  for (const teamKey of teamKeys()) {
    const team = next[teamKey];
    // A club over budget negotiates harder; one with room pays the going rate.
    const clubFactor = clamp(
      financeOf(team).budget / Math.max(1, teamPayroll(team)),
      FINANCE_BALANCE.minimumRenewalFactor,
      1,
    );
    const renew = (raw: Player): Player => {
      const player = withContractDefaults(raw);
      if ((player.contractYears ?? 0) > 0) return player;
      return {
        ...player,
        salary: renewalSalary(player, seasonStats[player.id], clubFactor),
        contractYears: 1,
      };
    };
    next[teamKey] = {
      ...team,
      pitchers: team.pitchers.map(renew),
      fielders: team.fielders.map(renew),
    };
  }
  return next;
}

/** How the finished season went for each club, for revenue. */
export interface SeasonOutcome {
  standings: Record<TeamKey, StandingRecord>;
  champion?: TeamKey | null;
  runnerUp?: TeamKey | null;
}

function leagueRank(outcome: SeasonOutcome, teamKey: TeamKey): number {
  const league = (CENTRAL as readonly TeamKey[]).includes(teamKey) ? CENTRAL : PACIFIC;
  const pct = (key: TeamKey) => {
    const standing = outcome.standings[key];
    return standing && standing.w + standing.l > 0 ? standing.w / (standing.w + standing.l) : 0.5;
  };
  return [...league].sort((first, second) => pct(second) - pct(first)).indexOf(teamKey) + 1;
}

export function seasonRevenue(teamKey: TeamKey, outcome: SeasonOutcome): number {
  const standing = outcome.standings[teamKey];
  const winPct =
    standing && standing.w + standing.l > 0 ? standing.w / (standing.w + standing.l) : 0.5;
  const bonus = FINANCE_BALANCE.postseasonRevenue;
  const postseason =
    (leagueRank(outcome, teamKey) <= 3 ? bonus.climax : 0) +
    (outcome.champion === teamKey || outcome.runnerUp === teamKey ? bonus.japanSeries : 0) +
    (outcome.champion === teamKey ? bonus.champion : 0);
  return roundBudget(
    baseBudget(teamKey) * (1 + FINANCE_BALANCE.winPctRevenueEffect * (winPct - 0.5) + postseason),
  );
}

/** Revenue from the season just finished moves each club's budget for the next. */
export function updateTeamFinances(teams: Teams, outcome?: SeasonOutcome): Teams {
  const next = { ...teams };
  for (const teamKey of teamKeys()) {
    const team = next[teamKey];
    const current = financeOf(team);
    if (!outcome) {
      next[teamKey] = { ...team, finance: current };
      continue;
    }
    // Fan following against the league average moves revenue by up to 5% either way.
    const revenue = roundBudget(
      seasonRevenue(teamKey, outcome) * popularityRevenueFactor(team, teams),
    );
    const base = baseBudget(teamKey);
    const budget = roundBudget(
      clamp(
        current.budget + (revenue - current.budget) * FINANCE_BALANCE.budgetAdjustment,
        base * FINANCE_BALANCE.minimumBudgetShare,
        base * FINANCE_BALANCE.maximumBudgetShare,
      ),
    );
    next[teamKey] = { ...team, finance: { budget, revenue } };
  }
  return next;
}
