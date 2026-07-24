import { CENTRAL, FIELD_POSITIONS, PACIFIC, TINFO } from '../data';
import { generateBatter, generatePitcher } from './players';
import { bestLineup, calcOVR, effectiveOVR } from './ratings';
import { clamp, gaussian, random, randomChoice, randomInt } from './random';
import type { FieldPosition, Player, Team, TeamKey, Teams } from './types';
export function teamNeedsScore(team: Team, player: Player): number {
  if (player.isP) {
    const starters = team.pitchers.filter((pitcher) => pitcher.role === '先発').length,
      relievers = team.pitchers.filter((pitcher) => pitcher.role !== '先発').length;
    let need = Math.max(0, 28 - team.pitchers.length) * 12;
    if (player.role === '先発') need += starters < 6 ? 12 : 0;
    else need += relievers < 7 ? 10 : 0;
    return need + calcOVR(player) * 0.6;
  }
  const position = player.pos as FieldPosition,
    count = team.fielders.filter(
      (fielder) =>
        fielder.positions?.some((entry) => entry.pos === position) || fielder.pos === position,
    ).length,
    weakSpot = Math.max(0, 3 - count) * 8,
    rosterNeed = Math.max(0, 35 - team.fielders.length) * 12;
  return rosterNeed + weakSpot + effectiveOVR(player, position) * 0.7;
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
export function genForeignMarket(): Player[] {
  const output: Player[] = [],
    batterPositions: FieldPosition[] = ['一塁手', '三塁手', '左翼手', '中堅手', '右翼手'];
  for (let index = 0; index < 8; index += 1) {
    if (index < 3) {
      const age = randomInt(25, 31),
        quality = generateMarketQuality(72, 7, 58, 92),
        role = index === 0 ? '先発' : 'リリーフ',
        player = generatePitcher('foreign', age, quality, role);
      player.tk = '外';
      player.ask = marketPlayerCost(player, 1.25);
      player.note = '外国人候補';
      output.push(player);
    } else {
      const age = randomInt(24, 31),
        quality = generateMarketQuality(73, 7, 60, 94),
        position = randomChoice(batterPositions),
        player = generateBatter('foreign', age, position, quality);
      player.tk = '外';
      player.ask = marketPlayerCost(player, 1.2);
      player.note = '外国人候補';
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
        budget = (TINFO[teamKey].bd || 50) * 100,
        affordability = (budget - (pick.ask || 0)) / 1200;
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
        .filter((teamKey) => !signedClubs.has(teamKey))
        .map((teamKey) => {
          const budget = (TINFO[teamKey].bd || 50) * 100;
          if ((pick.ask || 0) > budget + 1500) return null;
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
  for (let round = 0; round < rounds; round += 1) {
    const firstTeamKey = clubs[round % clubs.length],
      secondTeamKey = clubs[(round + 3) % clubs.length];
    if (!firstTeamKey || !secondTeamKey || firstTeamKey === secondTeamKey) continue;
    const firstTeam = nextTeams[firstTeamKey],
      secondTeam = nextTeams[secondTeamKey],
      firstBench = [...firstTeam.fielders]
        .filter((fielder) => !bestLineup(firstTeam).some((starter) => starter.id === fielder.id))
        .sort((first, second) => effectiveOVR(second, second.pos) - effectiveOVR(first, first.pos)),
      secondBench = [...secondTeam.fielders]
        .filter((fielder) => !bestLineup(secondTeam).some((starter) => starter.id === fielder.id))
        .sort((first, second) => effectiveOVR(second, second.pos) - effectiveOVR(first, first.pos)),
      firstArms = [...firstTeam.pitchers]
        .filter((pitcher) => pitcher.role !== '先発')
        .sort((first, second) => calcOVR(second) - calcOVR(first)),
      secondArms = [...secondTeam.pitchers]
        .filter((pitcher) => pitcher.role !== '先発')
        .sort((first, second) => calcOVR(second) - calcOVR(first)),
      firstChip = firstBench[0] || firstArms[0],
      secondChip = secondBench[0] || secondArms[0],
      firstWant = [...secondTeam.fielders, ...secondTeam.pitchers].sort(
        (first, second) => teamNeedsScore(firstTeam, second) - teamNeedsScore(firstTeam, first),
      )[0],
      secondWant = [...firstTeam.fielders, ...firstTeam.pitchers].sort(
        (first, second) => teamNeedsScore(secondTeam, second) - teamNeedsScore(secondTeam, first),
      )[0];
    if (!firstChip || !secondChip || !firstWant || !secondWant) continue;
    const firstFit = teamNeedsScore(firstTeam, firstWant) - teamNeedsScore(firstTeam, firstChip),
      secondFit = teamNeedsScore(secondTeam, secondWant) - teamNeedsScore(secondTeam, secondChip),
      valueGap = Math.abs(
        (firstWant.isP ? calcOVR(firstWant) : effectiveOVR(firstWant, firstWant.pos)) -
          (secondWant.isP ? calcOVR(secondWant) : effectiveOVR(secondWant, secondWant.pos)),
      );
    if (firstFit < 8 || secondFit < 8 || valueGap > 12) continue;
    nextTeams[firstTeamKey] = move(firstTeam, secondWant, firstWant, firstTeamKey);
    nextTeams[secondTeamKey] = move(secondTeam, firstWant, secondWant, secondTeamKey);
  }
  return nextTeams;
}
export const sampleTradeCash = (): number => randomInt(0, 20) * 100;
