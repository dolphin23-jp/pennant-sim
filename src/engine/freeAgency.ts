import type { NarrativeEventContext } from '../narrative/types';
import { CENTRAL, FREE_AGENCY_BALANCE, PACIFIC, TINFO } from '../data';
import {
  budgetRoom,
  hasDomesticFreeAgency,
  hasOverseasFreeAgency,
  marketSalary,
  roundSalary,
  salaryOf,
  type SeasonOutcome,
} from './contracts';
import { isForeignPlayer } from './foreign';
import { growPlayer } from './growth';
import { contractTerms, freeAgentContractYears, withoutMarketFields } from './market';
import type { RosterExit } from './offseason';
import { clamp, random } from './random';
import { calcOVR } from './ratings';
import type { FreeAgentRank, Player, Team, TeamKey, Teams } from './types';

const teamKeys = (): TeamKey[] => [...CENTRAL, ...PACIFIC];
const playerOvr = (player: Player): number => calcOVR(player, player.isP ? undefined : player.pos);

const winPctOf = (outcome: SeasonOutcome | undefined, teamKey: TeamKey): number => {
  const standing = outcome?.standings[teamKey];
  return standing && standing.w + standing.l > 0 ? standing.w / (standing.w + standing.l) : 0.5;
};

function withoutPlayers(team: Team, ids: ReadonlySet<string>): Team {
  return {
    ...team,
    pitchers: team.pitchers.filter((player) => !ids.has(player.id)),
    fielders: team.fielders.filter((player) => !ids.has(player.id)),
  };
}

export interface MlbDeparture {
  teamKey: TeamKey;
  player: Player;
  route: 'overseasFreeAgency' | 'posting';
}

function mlbChance(player: Player, route: MlbDeparture['route'], winPct: number): number {
  const balance = FREE_AGENCY_BALANCE;
  const ovr = playerOvr(player);
  if (ovr < balance.mlbMinimumOvr || player.age < balance.mlbMinimumAge) return 0;
  if (player.age > balance.mlbMaximumAge) return 0;
  const base =
    route === 'overseasFreeAgency'
      ? balance.overseasFreeAgencyChance
      : // A contender is slower to let its star go through the posting system.
        balance.postingChance * (winPct < 0.5 ? 1.3 : 0.8);
  const chance =
    (base + (ovr - balance.mlbMinimumOvr) * balance.mlbChancePerOvr) *
    (player.age >= balance.lateCareerAge ? balance.lateCareerMultiplier : 1);
  return clamp(chance, 0, balance.mlbMaximumChance);
}

/**
 * The league's stars leaving for MLB: with overseas FA rights once their contract is up,
 * or earlier through the posting system with their club's consent. `consentWithheldBy`
 * is a club that never posts (the user's, when the user manages the winter).
 */
export function resolveMlbDepartures(
  teams: Teams,
  options: { year: number; outcome?: SeasonOutcome; consentWithheldBy?: TeamKey | null },
  context?: NarrativeEventContext,
): { teams: Teams; exits: RosterExit[]; departures: MlbDeparture[]; abroad: Player[] } {
  const next = { ...teams };
  const exits: RosterExit[] = [];
  const departures: MlbDeparture[] = [];
  const abroad: Player[] = [];
  for (const teamKey of teamKeys()) {
    const team = next[teamKey];
    const leaving = new Set<string>();
    for (const player of [...team.pitchers, ...team.fielders]) {
      if (isForeignPlayer(player) || player.mlbSeasons != null) continue;
      const route: MlbDeparture['route'] | null =
        hasOverseasFreeAgency(player) && (player.contractYears ?? 0) <= 0
          ? 'overseasFreeAgency'
          : (player.serviceYears ?? 0) >= FREE_AGENCY_BALANCE.postingMinimumServiceYears &&
              teamKey !== options.consentWithheldBy
            ? 'posting'
            : null;
      if (!route || random() >= mlbChance(player, route, winPctOf(options.outcome, teamKey)))
        continue;
      leaving.add(player.id);
      departures.push({ teamKey, player, route });
      abroad.push({ ...player, tk: 'foreign', abroadSince: options.year, homeTeam: teamKey });
      exits.push({
        teamKey,
        playerId: player.id,
        name: player.name,
        age: player.age,
        isPitcher: player.isP,
        ovr: playerOvr(player),
        reason: 'mlbTransfer',
        player,
      });
      context?.emit({
        type: 'transaction',
        id: `transaction:release:${context.year}:${teamKey}:${player.id}`,
        year: context.year,
        date: context.date,
        transactionKind: 'release',
        playerId: player.id,
        playerName: player.name,
        fromTeamKey: teamKey,
        exitReason: 'mlbTransfer',
        terms:
          route === 'posting'
            ? 'ポスティングシステムを利用してMLB球団と契約した。'
            : '海外FA権を行使してMLB球団と契約した。',
      });
    }
    if (leaving.size) next[teamKey] = withoutPlayers(team, leaving);
  }
  return { teams: next, exits, departures, abroad };
}

/**
 * A year in MLB for the league's departed stars: they age and develop as they would at
 * home, and after a couple of seasons the older ones start coming back. A returning player
 * enters the domestic market drawn to his old club; one who stays past his playing days
 * retires abroad.
 */
export function advanceOverseasPlayers(
  overseas: readonly Player[],
  year: number,
): { overseas: Player[]; returning: Player[] } {
  const balance = FREE_AGENCY_BALANCE;
  const staying: Player[] = [];
  const returning: Player[] = [];
  for (const player of overseas) {
    const grown = growPlayer(player);
    if (grown.age > balance.retireAbroadAge) continue;
    const yearsAbroad = year - (grown.abroadSince ?? year);
    const chance =
      yearsAbroad < balance.minimumYearsAbroad
        ? 0
        : clamp(
            balance.returnChance +
              Math.max(0, grown.age - balance.returnAge) * balance.returnChancePerYearOfAge,
            0,
            balance.maximumReturnChance,
          );
    if (random() >= chance) {
      staying.push(grown);
      continue;
    }
    const home = grown.homeTeam ? TINFO[grown.homeTeam].ab : null;
    returning.push({
      ...grown,
      mlbSeasons: yearsAbroad,
      tk: 'FA',
      ask: marketSalary(grown),
      askYears: grown.age <= 33 ? 2 : 1,
      note: home ? `MLB帰り（元${home}）` : 'MLB帰り',
    });
  }
  return { overseas: staying, returning };
}

/** A/B/C by the player's salary rank among his club's Japanese players. */
function freeAgentRank(team: Team, player: Player): FreeAgentRank {
  const ordered = [...team.pitchers, ...team.fielders]
    .filter((candidate) => !isForeignPlayer(candidate))
    .sort((first, second) => salaryOf(second) - salaryOf(first));
  const place = ordered.findIndex((candidate) => candidate.id === player.id) + 1;
  if (place > 0 && place <= FREE_AGENCY_BALANCE.rankASalaryPlaces) return 'A';
  if (place > 0 && place <= FREE_AGENCY_BALANCE.rankBSalaryPlaces) return 'B';
  return 'C';
}

function declareChance(team: Team, player: Player, winPct: number): number {
  const balance = FREE_AGENCY_BALANCE;
  const ovr = playerOvr(player);
  if (ovr < balance.minimumDeclareOvr) return 0;
  const market = marketSalary(player);
  const underpaid = clamp(
    (market / Math.max(1, salaryOf(player)) - 1) * balance.underpaidDeclareWeight,
    0,
    balance.maximumUnderpaidBonus,
  );
  return clamp(
    balance.baseDeclareChance +
      underpaid +
      (ovr >= balance.starOvr ? balance.starDeclareBonus : 0) +
      (winPct < 0.45 ? balance.losingClubDeclareBonus : 0) +
      (budgetRoom(team) < market ? balance.tightBudgetDeclareBonus : 0) -
      (player.age >= balance.veteranAge ? balance.veteranDeclarePenalty : 0),
    0,
    balance.maximumDeclareChance,
  );
}

/** The player as he enters the market: asking for his market salary over the years his
 * age supports, and remembering the club he left. */
function onMarket(player: Player, teamKey: TeamKey, rank: FreeAgentRank): Player {
  return {
    ...player,
    tk: 'FA',
    faFrom: teamKey,
    faRank: rank,
    ask: marketSalary(player),
    askYears: freeAgentContractYears(player),
    note: `国内FA（${rank}ランク）`,
  };
}

/**
 * FA宣言: players holding domestic FA rights whose contract is up decide whether to test
 * the market. Underpaid players, stars, and players on losing or cash-strapped clubs are
 * the likeliest to go. A player who stays and is worth a regular's place usually signs a
 * multi-year deal instead, which keeps him off the market until it ends.
 */
export function declareFreeAgents(
  teams: Teams,
  options: { outcome?: SeasonOutcome } = {},
): { teams: Teams; declared: Player[] } {
  const next = { ...teams };
  const declared: Player[] = [];
  for (const teamKey of teamKeys()) {
    const team = next[teamKey];
    const winPct = winPctOf(options.outcome, teamKey);
    const leaving = new Set<string>();
    const extended = new Map<string, Player>();
    for (const player of [...team.pitchers, ...team.fielders]) {
      if (!hasDomesticFreeAgency(player) || (player.contractYears ?? 0) > 0) continue;
      if (random() < declareChance(team, player, winPct)) {
        leaving.add(player.id);
        declared.push(onMarket(player, teamKey, freeAgentRank(team, player)));
      } else if (playerOvr(player) >= FREE_AGENCY_BALANCE.minimumDeclareOvr + 5 && random() < 0.5) {
        const years = Math.max(2, Math.min(4, freeAgentContractYears(player)));
        extended.set(player.id, {
          ...player,
          salary: roundSalary(Math.max(salaryOf(player), marketSalary(player) * 0.95)),
          contractYears: years,
        });
      }
    }
    const extend = (player: Player) => extended.get(player.id) ?? player;
    next[teamKey] = withoutPlayers(
      {
        ...team,
        pitchers: team.pitchers.map(extend),
        fielders: team.fielders.map(extend),
      },
      leaving,
    );
  }
  return { teams: next, declared };
}

/**
 * 宣言残留: a declared free agent nobody signed returns to his club on a one-year deal below
 * his asking price. Other unsigned players (the journeymen pool) simply leave the market.
 */
export function returnUnsignedFreeAgents(
  teams: Teams,
  remaining: Player[],
  context?: NarrativeEventContext,
): { teams: Teams; returned: Player[] } {
  const next = { ...teams };
  const returned: Player[] = [];
  for (const player of remaining) {
    const teamKey = player.faFrom;
    if (!teamKey) continue;
    const rest = withoutMarketFields(player);
    const salary = roundSalary(Math.max(salaryOf(rest), (player.ask ?? 0) * 0.8));
    const back: Player = {
      ...rest,
      tk: teamKey,
      salary,
      contractYears: 1,
      faExercisedAt: player.serviceYears ?? 0,
    };
    const team = next[teamKey];
    next[teamKey] = back.isP
      ? { ...team, pitchers: [...team.pitchers, back] }
      : { ...team, fielders: [...team.fielders, back] };
    returned.push(back);
    context?.emit({
      type: 'transaction',
      id: `transaction:faSigning:${context.year}:${teamKey}:${player.id}`,
      year: context.year,
      date: context.date,
      transactionKind: 'faSigning',
      playerId: player.id,
      playerName: player.name,
      fromTeamKey: teamKey,
      toTeamKey: teamKey,
      terms: contractTerms(salary, 1),
    });
  }
  return { teams: next, returned };
}
