import { emitTrade } from './narrativeEvents';
import type { NarrativeEventContext } from '../narrative/types';

import {
  CENTRAL,
  FIELD_POSITIONS,
  FOREIGN_PLAYER_BALANCE,
  FREE_AGENCY_BALANCE,
  PACIFIC,
} from '../data';
import {
  budgetRoom,
  canAffordSalary,
  estimatedServiceYears,
  financeOf,
  formatManYen,
  marketSalary,
  roundSalary,
  type SeasonOutcome,
} from './contracts';
import { teamStrategyFor } from './aiStrategy';
import { clubPlanFor, planBidAdjustment, planTradeAdjustment, type ClubPlan } from './clubPlan';
import {
  canRegisterForeignPlayer,
  countForeignPlayers,
  tradeRespectsForeignLimit,
  createForeignPlayerProfile,
  isForeignPlayer,
} from './foreign';
import { generateBatter, generatePitcher } from './players';
import { bestLineup, calcOVR, effectiveOVR } from './ratings';
import { clamp, gaussian, random, randomChoice, randomInt } from './random';
import type { FieldPosition, Player, Team, TeamKey, Teams } from './types';

/** A cohort skewing old raises the value of a young reinforcement (and docks another
 * aging body); a cohort that's still very green rewards a proven, near-peak veteran
 * instead of yet another project. Keeps the OVR term as the dominant signal - this is a
 * tie-breaking nudge, not a replacement for "is this player actually good". */
function ageFitBonus(cohort: Player[], candidateAge: number): number {
  if (!cohort.length) return 0;
  const averageAge = cohort.reduce((total, player) => total + player.age, 0) / cohort.length;
  if (averageAge >= 29) {
    const agingPressure = averageAge - 29;
    if (candidateAge <= 26) return clamp(agingPressure * 1.8, 0, 10);
    if (candidateAge >= 34) return clamp(-agingPressure * 1.2, -8, 0);
    return 0;
  }
  if (averageAge <= 25 && candidateAge >= 27 && candidateAge <= 32) return 4;
  return 0;
}

/** A cohort already carrying injuries values outside reinforcement more, and an injured
 * candidate is worth less regardless of how the roster otherwise looks. */
function injuryAdjustment(cohort: Player[], candidate: Player): number {
  const injuredCount = cohort.filter((player) => (player.injuryDays ?? 0) > 0).length;
  const candidatePenalty = (candidate.injuryDays ?? 0) > 0 ? -10 : 0;
  return Math.min(injuredCount * 2, 8) + candidatePenalty;
}

/** Mirrors the draft/retention upside read (see draft.ts prospectFutureBonus and
 * offseason.ts retentionScore) so CPU acquisition decisions weigh future ceiling, not
 * only the player's OVR today. */
export function potentialUpside(player: Player): number {
  const potentialGap = Math.max(
    0,
    ...Object.entries(player.pot ?? {}).map(([key, value]) => {
      const current = player.p[key as keyof typeof player.p];
      return typeof value === 'number' && typeof current === 'number' ? value - current : 0;
    }),
  );
  const youthFactor = player.age <= 24 ? 1 : player.age <= 27 ? 0.5 : 0;
  if (!youthFactor) return 0;
  return (
    potentialGap * 0.1 * youthFactor + (player.potentialClass === 'elite' ? 3 * youthFactor : 0)
  );
}

/** A club's philosophy (power, speed, defence) tilts which fielders it values: a small
 * nudge, a few points for a player strong in what the club wants. */
function philosophyFit(team: Team, player: Player): number {
  const strategy = teamStrategyFor(team.key);
  const lean = (rating: number | undefined, weight: number, neutral: number) =>
    ((rating ?? 50) - 60) * (weight - neutral) * 0.1;
  return (
    lean(player.p.pw, strategy.powerWeight, 0.2) +
    lean(player.p.sp, strategy.speedWeight, 0.1) +
    lean(player.p.df, strategy.defenseWeight, 0.24)
  );
}

export function teamNeedsScore(team: Team, player: Player): number {
  if (player.isP) {
    const starters = team.pitchers.filter((pitcher) => pitcher.role === '先発').length,
      relievers = team.pitchers.filter((pitcher) => pitcher.role !== '先発').length;
    let need = Math.max(0, 28 - team.pitchers.length) * 12;
    if (player.role === '先発') need += starters < 6 ? 12 : 0;
    else need += relievers < 7 ? 10 : 0;
    return (
      need +
      calcOVR(player) * 0.6 +
      ageFitBonus(team.pitchers, player.age) +
      injuryAdjustment(team.pitchers, player) +
      potentialUpside(player)
    );
  }
  const position = player.pos as FieldPosition,
    count = team.fielders.filter(
      (fielder) =>
        fielder.positions?.some((entry) => entry.pos === position) || fielder.pos === position,
    ).length,
    weakSpot = Math.max(0, 3 - count) * 8,
    rosterNeed = Math.max(0, 35 - team.fielders.length) * 12;
  return (
    philosophyFit(team, player) +
    rosterNeed +
    weakSpot +
    effectiveOVR(player, position) * 0.7 +
    ageFitBonus(team.fielders, player.age) +
    injuryAdjustment(team.fielders, player) +
    potentialUpside(player)
  );
}
/** A market player's yearly asking salary (万円): what the league pays his OVR and age,
 * with a premium for foreign players, who cost more to bring over. */
export function marketPlayerCost(player: Player, multiplier = 1): number {
  return roundSalary(marketSalary(player) * multiplier);
}
/** Contract length a free agent asks for: long for players in their prime, one year for
 * veterans. */
export function freeAgentContractYears(player: Player): number {
  const years = player.age <= 28 ? 4 : player.age <= 30 ? 3 : player.age <= 32 ? 2 : 1;
  const ovr = player.isP ? calcOVR(player) : effectiveOVR(player, player.pos);
  return Math.min(5, years + (ovr >= FREE_AGENCY_BALANCE.starOvr && player.age <= 32 ? 1 : 0));
}
function generateMarketQuality(
  base: number,
  standardDeviation: number,
  minimum: number,
  maximum: number,
): number {
  const tierRoll = random();
  if (tierRoll < 0.03) return clamp(gaussian(base + 48, 7), 96, 128);
  if (tierRoll < 0.15) return clamp(gaussian(base + 28, 9), 70, 112);
  return clamp(gaussian(base, standardDeviation + 2), minimum - 5, maximum);
}
/**
 * Players on the open market who were not on an NPB roster last season: veterans back from
 * the majors, and players released elsewhere or coming from independent leagues. The
 * league's own free agents (declared by their players) join this pool each winter.
 */
export function genFreeAgentMarket(): Player[] {
  const output: Player[] = [];
  for (let index = 0; index < 14; index += 1) {
    const tierRoll = random();
    const quality =
      index < 6 ? generateMarketQuality(67, 8, 50, 88) : generateMarketQuality(66, 8, 48, 86);
    const player =
      index < 6
        ? generatePitcher(
            'fa',
            randomInt(28, 36),
            quality,
            index < 2 ? '先発' : index < 5 ? 'リリーフ' : 'クローザー',
          )
        : generateBatter('fa', randomInt(27, 35), randomChoice(FIELD_POSITIONS), quality);
    player.tk = 'FA';
    player.ask = marketPlayerCost(player, index < 6 ? 1.05 : 1);
    player.askYears = player.age <= 31 && tierRoll < 0.5 ? 2 : 1;
    player.note = quality >= 90 ? 'メジャー帰り' : tierRoll < 0.5 ? '自由契約' : '独立リーグ';
    output.push(player);
  }
  return output.sort(
    (first, second) =>
      (second.isP ? calcOVR(second) : effectiveOVR(second, second.pos)) -
      (first.isP ? calcOVR(first) : effectiveOVR(first, first.pos)),
  );
}
export function genForeignMarket(arrivalYear = 2026): Player[] {
  const output: Player[] = [],
    batterPositions: FieldPosition[] = ['一塁手', '三塁手', '左翼手', '中堅手', '右翼手'];
  for (let index = 0; index < FOREIGN_PLAYER_BALANCE.marketPlayers; index += 1) {
    if (index < FOREIGN_PLAYER_BALANCE.marketPitchers) {
      const age = randomInt(25, 31),
        quality = generateMarketQuality(72, 7, 58, 92),
        role = index === 0 ? '先発' : 'リリーフ',
        player = generatePitcher('foreign', age, quality, role);
      player.foreignProfile = createForeignPlayerProfile(arrivalYear);
      player.tk = '外';
      player.ask = marketPlayerCost(player, 1.25);
      player.askYears = player.foreignProfile.contractYearsRemaining;
      player.note = `${player.foreignProfile.origin}・外国人候補・${player.foreignProfile.contractYearsRemaining}年契約`;
      output.push(player);
    } else {
      const age = randomInt(24, 31),
        quality = generateMarketQuality(73, 7, 60, 94),
        position = randomChoice(batterPositions),
        player = generateBatter('foreign', age, position, quality);
      player.foreignProfile = createForeignPlayerProfile(arrivalYear);
      player.tk = '外';
      player.ask = marketPlayerCost(player, 1.2);
      player.askYears = player.foreignProfile.contractYearsRemaining;
      player.note = `${player.foreignProfile.origin}・外国人候補・${player.foreignProfile.contractYearsRemaining}年契約`;
      output.push(player);
    }
  }
  return output.sort(
    (first, second) =>
      (second.isP ? calcOVR(second) : effectiveOVR(second, second.pos)) -
      (first.isP ? calcOVR(first) : effectiveOVR(first, first.pos)),
  );
}
/** Contract terms as the news reports them. */
export function contractTerms(salary: number, years: number): string {
  return years > 1
    ? `${years}年契約・総額${formatManYen(salary * years)}（年俸${formatManYen(salary)}）`
    : `1年契約・年俸${formatManYen(salary)}`;
}

/** The signed player: under contract with his new club, market-only fields cleared. A
 * declared free agent has used his FA rights. */
export function withoutMarketFields(player: Player): Player {
  const copy = { ...player };
  delete copy.faFrom;
  delete copy.faRank;
  delete copy.ask;
  delete copy.askYears;
  delete copy.abroadSince;
  delete copy.homeTeam;
  return copy;
}

function signedContract(player: Player, teamKey: TeamKey, salary: number): Player {
  const formerTeam = player.faFrom;
  const years = player.askYears ?? player.foreignProfile?.contractYearsRemaining ?? 1;
  return {
    ...withoutMarketFields(player),
    tk: teamKey,
    signedVia: player.note || '市場',
    salary,
    contractYears: years,
    // Journeymen come from other leagues with their careers behind them.
    serviceYears: player.serviceYears ?? estimatedServiceYears(player),
    faExercisedAt: formerTeam ? (player.serviceYears ?? 0) : player.faExercisedAt,
  };
}

export function signPlayerToTeam(
  teams: Teams,
  teamKey: TeamKey,
  player: Player,
  context?: NarrativeEventContext,
  salary: number = player.ask ?? marketPlayerCost(player),
): Teams {
  if (
    Object.values(teams).some((t) => [...t.pitchers, ...t.fielders].some((p) => p.id === player.id))
  )
    return teams;
  if (isForeignPlayer(player) && !canRegisterForeignPlayer(teams[teamKey])) return teams;
  const team = { ...teams[teamKey] },
    signedPlayer = signedContract(player, teamKey, salary);
  if (signedPlayer.isP) team.pitchers = [...team.pitchers, signedPlayer];
  else team.fielders = [...team.fielders, signedPlayer];
  if (context) {
    const kind = isForeignPlayer(player) ? 'foreignSigning' : 'faSigning';
    context.emit({
      type: 'transaction',
      id: `transaction:${kind}:${context.year}:${teamKey}:${player.id}`,
      year: context.year,
      date: context.date,
      transactionKind: kind,
      playerId: player.id,
      playerName: player.name,
      fromTeamKey: player.faFrom ?? null,
      toTeamKey: teamKey,
      terms: contractTerms(salary, signedPlayer.contractYears ?? 1),
      ...(player.abroadSince != null ? { returnFromMlb: true } : {}),
    });
  }
  return { ...teams, [teamKey]: team };
}

/** Players a club keeps off its compensation list: the best by OVR with young upside, plus
 * the free agent just signed. Foreign players are exempt, as in NPB. */
function protectedIds(team: Team, signedId: string): Set<string> {
  const value = (player: Player) =>
    (player.isP ? calcOVR(player) : effectiveOVR(player, player.pos)) + potentialUpside(player);
  return new Set([
    signedId,
    ...[...team.pitchers, ...team.fielders]
      .sort((first, second) => value(second) - value(first))
      .slice(0, FREE_AGENCY_BALANCE.protectedPlayers)
      .map((player) => player.id),
  ]);
}

/**
 * 人的補償: the former club of an A/B-rank free agent takes the unprotected player who
 * fits it best from the signing club. When nobody on the list is worth a roster place,
 * it takes cash instead and no player moves.
 */
export function takeCompensation(
  teams: Teams,
  formerTeam: TeamKey,
  signingTeam: TeamKey,
  freeAgent: Player,
  context?: NarrativeEventContext,
): Teams {
  const source = teams[signingTeam];
  const shielded = protectedIds(source, freeAgent.id);
  const target = teams[formerTeam];
  const pick = [...source.pitchers, ...source.fielders]
    .filter((player) => !shielded.has(player.id) && !isForeignPlayer(player))
    .filter(
      (player) =>
        (player.isP ? calcOVR(player) : effectiveOVR(player, player.pos)) >=
          FREE_AGENCY_BALANCE.minimumCompensationOvr || potentialUpside(player) >= 3,
    )
    .sort((first, second) => teamNeedsScore(target, second) - teamNeedsScore(target, first))[0];
  if (!pick) return teams;
  const moved = { ...pick, tk: formerTeam };
  const next = {
    ...teams,
    [signingTeam]: {
      ...source,
      pitchers: source.pitchers.filter((player) => player.id !== pick.id),
      fielders: source.fielders.filter((player) => player.id !== pick.id),
    },
    [formerTeam]: {
      ...target,
      pitchers: moved.isP ? [...target.pitchers, moved] : target.pitchers,
      fielders: moved.isP ? target.fielders : [...target.fielders, moved],
    },
  };
  context?.emit({
    type: 'transaction',
    id: `transaction:compensation:${context.year}:${formerTeam}:${pick.id}`,
    year: context.year,
    date: context.date,
    transactionKind: 'compensation',
    playerId: pick.id,
    playerName: pick.name,
    fromTeamKey: signingTeam,
    toTeamKey: formerTeam,
    terms: `${freeAgent.name}のFA移籍に伴う人的補償`,
  });
  return next;
}

/** Sign a market player; a declared A/B-rank free agent leaving his club brings it a
 * compensation player from the signing club. */
export function signFreeAgent(
  teams: Teams,
  teamKey: TeamKey,
  player: Player,
  context?: NarrativeEventContext,
  salary: number = player.ask ?? marketPlayerCost(player),
): Teams {
  const signed = signPlayerToTeam(teams, teamKey, player, context, salary);
  if (
    signed === teams ||
    !player.faFrom ||
    player.faFrom === teamKey ||
    !player.faRank ||
    player.faRank === 'C'
  )
    return signed;
  return takeCompensation(signed, player.faFrom, teamKey, player, context);
}

const winPctOf = (outcome: SeasonOutcome | undefined, teamKey: TeamKey): number => {
  const standing = outcome?.standings[teamKey];
  return standing && standing.w + standing.l > 0 ? standing.w / (standing.w + standing.l) : 0.5;
};

/**
 * CPU clubs bid for the market, best player first, one signing per club per call. A bid
 * needs the budget room for the asking salary; it is scored by need, budget comfort, the
 * former club's pull (宣言残留) and a contender's appeal. When several clubs bid, the price
 * rises. A declared A/B-rank free agent who changes clubs brings his former club a player
 * from the new club's unprotected list (人的補償).
 */
export function cpuAutoSignMarket(
  teams: Teams,
  market: Player[],
  type: 'fa' | 'foreign' = 'fa',
  excludedTeam: TeamKey | null = null,
  context?: NarrativeEventContext,
  outcome?: SeasonOutcome,
): { teams: Teams; remaining: Player[] } {
  let nextTeams = { ...teams },
    remaining = [...market];
  const balance = FREE_AGENCY_BALANCE,
    clubs = [...CENTRAL, ...PACIFIC].filter((teamKey) => teamKey !== excludedTeam),
    plans = Object.fromEntries(
      clubs.map((teamKey) => [teamKey, clubPlanFor(teams[teamKey], outcome)]),
    ) as Record<TeamKey, ClubPlan>,
    signedClubs = new Set<TeamKey>(),
    bidScore = (teamKey: TeamKey, pick: Player): number => {
      const team = nextTeams[teamKey],
        budget = financeOf(team).budget,
        need = teamNeedsScore(team, pick) + (type === 'foreign' ? 3 : 0),
        affordability = clamp((budgetRoom(team) - (pick.ask || 0)) / (budget * 0.02), -5, 5),
        home = (pick.faFrom ?? pick.homeTeam) === teamKey ? balance.homeBonus : 0,
        contender = balance.contenderBonus * (winPctOf(outcome, teamKey) - 0.5);
      return (
        need +
        affordability +
        home +
        contender +
        planBidAdjustment(plans[teamKey], pick) +
        gaussian(0, 0.9)
      );
    },
    candidates = [...remaining].sort(
      (first, second) =>
        (second.isP ? calcOVR(second) : effectiveOVR(second, second.pos)) -
        (first.isP ? calcOVR(first) : effectiveOVR(first, first.pos)),
    );
  for (const pick of candidates) {
    if (!remaining.some((candidate) => candidate.id === pick.id)) continue;
    const ask = pick.ask || 0;
    const bids = clubs
        .filter(
          (teamKey) =>
            !signedClubs.has(teamKey) &&
            (type !== 'foreign' ||
              countForeignPlayers(nextTeams[teamKey]) < FOREIGN_PLAYER_BALANCE.registeredLimit) &&
            canAffordSalary(nextTeams[teamKey], ask),
        )
        .map((teamKey) => ({ teamKey, score: bidScore(teamKey, pick) }))
        .filter((bid) => bid.score >= balance.minimumBidScore)
        .sort((first, second) => second.score - first.score),
      winner = bids[0];
    if (!winner) continue;
    const premium = Math.min(
      balance.maximumPremium,
      balance.competitionPremium * (bids.length - 1),
    );
    const contested = roundSalary(ask * (1 + premium));
    const salary = canAffordSalary(nextTeams[winner.teamKey], contested) ? contested : ask;
    nextTeams = signFreeAgent(nextTeams, winner.teamKey, pick, context, salary);
    signedClubs.add(winner.teamKey);
    remaining = remaining.filter((player) => player.id !== pick.id);
  }
  return { teams: nextTeams, remaining };
}
export function cpuAutoSignMarketRounds(
  teams: Teams,
  market: Player[],
  type: 'fa' | 'foreign' = 'fa',
  rounds = 2,
  excludedTeam: TeamKey | null = null,
  context?: NarrativeEventContext,
  outcome?: SeasonOutcome,
): { teams: Teams; remaining: Player[] } {
  let nextTeams = { ...teams },
    remaining = [...market];
  for (let round = 0; round < rounds && remaining.length; round += 1) {
    const result = cpuAutoSignMarket(nextTeams, remaining, type, excludedTeam, context, outcome);
    nextTeams = result.teams;
    remaining = result.remaining;
  }
  return { teams: nextTeams, remaining };
}

function rosterCoreValue(team: Team): number {
  const lineup = bestLineup(team);
  const batting = lineup.length
    ? lineup.reduce((sum, player) => sum + calcOVR(player, player.pos), 0) / lineup.length
    : 50;
  const starters = team.pitchers
    .filter((pitcher) => pitcher.role === '先発')
    .sort((first, second) => calcOVR(second) - calcOVR(first))
    .slice(0, 5);
  const starting = starters.length
    ? starters.reduce((sum, player) => sum + calcOVR(player), 0) / starters.length
    : 50;
  const bullpen = team.pitchers
    .filter((pitcher) => pitcher.role !== '先発')
    .sort((first, second) => calcOVR(second) - calcOVR(first))
    .slice(0, 6);
  const relief = bullpen.length
    ? bullpen.reduce((sum, player) => sum + calcOVR(player), 0) / bullpen.length
    : 50;
  return batting * 0.45 + starting * 0.3 + relief * 0.25;
}

export function cpuAutoTradeBetweenTeams(
  teams: Teams,
  playerTeam: TeamKey,
  rounds = 4,
  context?: NarrativeEventContext,
  outcome?: SeasonOutcome,
): Teams {
  const nextTeams = { ...teams };
  const clubs = [...CENTRAL, ...PACIFIC]
      .filter((teamKey) => teamKey !== playerTeam)
      .sort(() => random() - 0.5),
    move = (team: Team, removed: Player, added: Player, teamKey: TeamKey): Team =>
      added.isP
        ? {
            ...team,
            pitchers: [
              ...team.pitchers.filter((pitcher) => pitcher.id !== removed.id),
              { ...added, tk: teamKey },
            ],
            fielders: team.fielders.filter((fielder) => fielder.id !== removed.id),
          }
        : {
            ...team,
            fielders: [
              ...team.fielders.filter((fielder) => fielder.id !== removed.id),
              { ...added, tk: teamKey },
            ],
            pitchers: team.pitchers.filter((pitcher) => pitcher.id !== removed.id),
          };
  const tradeable = (team: Team): Player[] => {
    const starters = new Set(bestLineup(team).map((player) => player.id));
    return [
      ...team.fielders.filter((player) => !starters.has(player.id)),
      ...team.pitchers.filter((player) => player.role !== '先発'),
    ]
      .sort(
        (first, second) =>
          (second.isP ? calcOVR(second) : effectiveOVR(second, second.pos)) -
          (first.isP ? calcOVR(first) : effectiveOVR(first, first.pos)),
      )
      .slice(0, 8);
  };
  for (let round = 0; round < rounds; round += 1) {
    const firstTeamKey = clubs[round % clubs.length],
      secondTeamKey = clubs[(round + 3) % clubs.length];
    if (!firstTeamKey || !secondTeamKey || firstTeamKey === secondTeamKey) continue;
    const firstTeam = nextTeams[firstTeamKey];
    const secondTeam = nextTeams[secondTeamKey];
    const firstPlan = clubPlanFor(firstTeam, outcome);
    const secondPlan = clubPlanFor(secondTeam, outcome);
    const firstPool = tradeable(firstTeam);
    const secondPool = tradeable(secondTeam);
    const firstBefore = rosterCoreValue(firstTeam);
    const secondBefore = rosterCoreValue(secondTeam);
    let best: {
      firstOut: Player;
      secondOut: Player;
      score: number;
      firstAfter: Team;
      secondAfter: Team;
    } | null = null;
    for (const firstOut of firstPool) {
      for (const secondOut of secondPool) {
        const firstValue = firstOut.isP ? calcOVR(firstOut) : effectiveOVR(firstOut, firstOut.pos);
        const secondValue = secondOut.isP
          ? calcOVR(secondOut)
          : effectiveOVR(secondOut, secondOut.pos);
        const valueGap = Math.abs(firstValue - secondValue);
        if (valueGap > 12) continue;
        const firstAfter = move(firstTeam, firstOut, secondOut, firstTeamKey);
        const secondAfter = move(secondTeam, secondOut, firstOut, secondTeamKey);
        if (
          !tradeRespectsForeignLimit(firstTeam, firstAfter) ||
          !tradeRespectsForeignLimit(secondTeam, secondAfter)
        )
          continue;
        const firstFit = teamNeedsScore(firstTeam, secondOut) - teamNeedsScore(firstTeam, firstOut);
        const secondFit =
          teamNeedsScore(secondTeam, firstOut) - teamNeedsScore(secondTeam, secondOut);
        const firstGain =
          (rosterCoreValue(firstAfter) - firstBefore) * 1.5 +
          firstFit * 0.35 +
          planTradeAdjustment(firstPlan, firstOut, secondOut);
        const secondGain =
          (rosterCoreValue(secondAfter) - secondBefore) * 1.5 +
          secondFit * 0.35 +
          planTradeAdjustment(secondPlan, secondOut, firstOut);
        if (firstGain < 0.5 || secondGain < 0.5) continue;
        const score = firstGain + secondGain - valueGap * 0.2 + gaussian(0, 0.75);
        if (!best || score > best.score)
          best = { firstOut, secondOut, score, firstAfter, secondAfter };
      }
    }
    if (!best || best.score < 5) continue;
    nextTeams[firstTeamKey] = best.firstAfter;
    nextTeams[secondTeamKey] = best.secondAfter;
    emitTrade(
      context,
      `cpu:${context?.scope ?? 'default'}:${round}:${firstTeamKey}:${best.firstOut.id}:${secondTeamKey}:${best.secondOut.id}`,
      [
        {
          playerId: best.firstOut.id,
          playerName: best.firstOut.name,
          fromTeamKey: firstTeamKey,
          toTeamKey: secondTeamKey,
        },
        {
          playerId: best.secondOut.id,
          playerName: best.secondOut.name,
          fromTeamKey: secondTeamKey,
          toTeamKey: firstTeamKey,
        },
      ],
    );
  }
  return nextTeams;
}
export const sampleTradeCash = (): number => randomInt(0, 20) * 100;
