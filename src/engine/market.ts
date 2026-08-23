import { CENTRAL, FIELD_POSITIONS, FOREIGN_PLAYER_BALANCE, PACIFIC, TINFO } from '../data';
import {
  canRegisterForeignPlayer,
  countForeignPlayers,
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
function potentialUpside(player: Player): number {
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
    rosterNeed +
    weakSpot +
    effectiveOVR(player, position) * 0.7 +
    ageFitBonus(team.fielders, player.age) +
    injuryAdjustment(team.fielders, player) +
    potentialUpside(player)
  );
}
export function marketPlayerCost(player: Player, multiplier = 1): number {
  const overall = Math.round(player.isP ? calcOVR(player) : effectiveOVR(player, player.pos));
  return Math.max(
    800,
    Math.round(((overall * overall * 1.8 + (player.age < 27 ? 1500 : 0)) * multiplier) / 100) * 100,
  );
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
export function genFreeAgentMarket(): Player[] {
  const output: Player[] = [];
  for (let index = 0; index < 14; index += 1) {
    if (index < 6) {
      const age = randomInt(28, 36),
        quality = generateMarketQuality(67, 8, 50, 88),
        role = index < 2 ? '先発' : index < 5 ? 'リリーフ' : 'クローザー',
        player = generatePitcher('fa', age, quality, role);
      player.tk = 'FA';
      player.ask = marketPlayerCost(player, 1.05);
      player.note = '国内FA';
      output.push(player);
    } else {
      const age = randomInt(27, 35),
        quality = generateMarketQuality(66, 8, 48, 86),
        position = randomChoice(FIELD_POSITIONS),
        player = generateBatter('fa', age, position, quality);
      player.tk = 'FA';
      player.ask = marketPlayerCost(player);
      player.note = '国内FA';
      output.push(player);
    }
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
export function signPlayerToTeam(teams: Teams, teamKey: TeamKey, player: Player): Teams {
  if (isForeignPlayer(player) && !canRegisterForeignPlayer(teams[teamKey])) return teams;
  const team = { ...teams[teamKey] },
    signedPlayer = { ...player, tk: teamKey, signedVia: player.note || '市場' };
  if (signedPlayer.isP) team.pitchers = [...team.pitchers, signedPlayer];
  else team.fielders = [...team.fielders, signedPlayer];
  return { ...teams, [teamKey]: team };
}
export function cpuAutoSignMarket(
  teams: Teams,
  market: Player[],
  type: 'fa' | 'foreign' = 'fa',
  excludedTeam: TeamKey | null = null,
): { teams: Teams; remaining: Player[] } {
  let nextTeams = { ...teams },
    remaining = [...market];
  const clubs = [...CENTRAL, ...PACIFIC].filter((teamKey) => teamKey !== excludedTeam),
    signedClubs = new Set<TeamKey>(),
    bidScore = (teamKey: TeamKey, pick: Player): number => {
      const need = teamNeedsScore(nextTeams[teamKey], pick) + (type === 'foreign' ? 3 : 0),
        financialPowerLimit = (TINFO[teamKey].bd || 50) * 100,
        affordability = (financialPowerLimit - (pick.ask || 0)) / 1200;
      return need + affordability + gaussian(0, 0.9);
    },
    candidates = [...remaining].sort(
      (first, second) =>
        (second.isP ? calcOVR(second) : effectiveOVR(second, second.pos)) -
        (first.isP ? calcOVR(first) : effectiveOVR(first, first.pos)),
    );
  for (const pick of candidates) {
    if (!remaining.some((candidate) => candidate.id === pick.id)) continue;
    const bids = clubs
        .filter(
          (teamKey) =>
            !signedClubs.has(teamKey) &&
            (type !== 'foreign' ||
              countForeignPlayers(nextTeams[teamKey]) < FOREIGN_PLAYER_BALANCE.registeredLimit),
        )
        .map((teamKey) => {
          const financialPowerLimit = (TINFO[teamKey].bd || 50) * 100;
          if ((pick.ask || 0) > financialPowerLimit + 1500) return null;
          return { teamKey, score: bidScore(teamKey, pick) };
        })
        .filter((bid): bid is { teamKey: TeamKey; score: number } => bid !== null)
        .sort((first, second) => second.score - first.score),
      winner = bids[0];
    if (!winner || winner.score < -1.5) continue;
    nextTeams = signPlayerToTeam(nextTeams, winner.teamKey, pick);
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
): { teams: Teams; remaining: Player[] } {
  let nextTeams = { ...teams },
    remaining = [...market];
  for (let round = 0; round < rounds && remaining.length; round += 1) {
    const result = cpuAutoSignMarket(nextTeams, remaining, type, excludedTeam);
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

export function cpuAutoTradeBetweenTeams(teams: Teams, playerTeam: TeamKey, rounds = 4): Teams {
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
    const firstPool = tradeable(firstTeam);
    const secondPool = tradeable(secondTeam);
    const firstBefore = rosterCoreValue(firstTeam);
    const secondBefore = rosterCoreValue(secondTeam);
    let best:
      | { firstOut: Player; secondOut: Player; score: number; firstAfter: Team; secondAfter: Team }
      | null = null;
    for (const firstOut of firstPool) {
      for (const secondOut of secondPool) {
        const firstValue = firstOut.isP ? calcOVR(firstOut) : effectiveOVR(firstOut, firstOut.pos);
        const secondValue = secondOut.isP ? calcOVR(secondOut) : effectiveOVR(secondOut, secondOut.pos);
        const valueGap = Math.abs(firstValue - secondValue);
        if (valueGap > 12) continue;
        const firstAfter = move(firstTeam, firstOut, secondOut, firstTeamKey);
        const secondAfter = move(secondTeam, secondOut, firstOut, secondTeamKey);
        const firstFit = teamNeedsScore(firstTeam, secondOut) - teamNeedsScore(firstTeam, firstOut);
        const secondFit = teamNeedsScore(secondTeam, firstOut) - teamNeedsScore(secondTeam, secondOut);
        const firstGain = (rosterCoreValue(firstAfter) - firstBefore) * 1.5 + firstFit * 0.35;
        const secondGain = (rosterCoreValue(secondAfter) - secondBefore) * 1.5 + secondFit * 0.35;
        if (firstGain < 0.5 || secondGain < 0.5) continue;
        const score = firstGain + secondGain - valueGap * 0.2 + gaussian(0, 0.75);
        if (!best || score > best.score)
          best = { firstOut, secondOut, score, firstAfter, secondAfter };
      }
    }
    if (!best || best.score < 5) continue;
    nextTeams[firstTeamKey] = best.firstAfter;
    nextTeams[secondTeamKey] = best.secondAfter;
  }
  return nextTeams;
}
export const sampleTradeCash = (): number => randomInt(0, 20) * 100;
