import { FOREIGN_PLAYER_BALANCE } from '../data';
import { clamp, gaussian, random } from './random';
import type { ForeignOrigin, ForeignPlayerProfile, Player, Team } from './types';

const ORIGINS = Object.keys(FOREIGN_PLAYER_BALANCE.originWeights) as ForeignOrigin[];

function weightedOrigin(): ForeignOrigin {
  const roll = random();
  let cumulative = 0;
  for (const origin of ORIGINS) {
    cumulative += FOREIGN_PLAYER_BALANCE.originWeights[origin];
    if (roll < cumulative) return origin;
  }
  return 'その他';
}

function initialContractYears(): number {
  const roll = random();
  if (roll < FOREIGN_PLAYER_BALANCE.contractYearWeights.oneYear) return 1;
  if (
    roll <
    FOREIGN_PLAYER_BALANCE.contractYearWeights.oneYear +
      FOREIGN_PLAYER_BALANCE.contractYearWeights.twoYears
  )
    return 2;
  return 3;
}

function initialAdaptationFactor(): number {
  const balance = FOREIGN_PLAYER_BALANCE.adaptation;
  const tailRoll = random();
  if (tailRoll < balance.immediateBreakthroughRate)
    return (
      balance.breakthroughMinimum +
      random() * (balance.breakthroughMaximum - balance.breakthroughMinimum)
    );
  if (tailRoll < balance.immediateBreakthroughRate + balance.disappointmentRate)
    return (
      balance.disappointmentMinimum +
      random() * (balance.disappointmentMaximum - balance.disappointmentMinimum)
    );
  return clamp(
    gaussian(balance.standardMean, balance.standardDeviation),
    balance.disappointmentMinimum,
    balance.breakthroughMinimum,
  );
}

export function createForeignPlayerProfile(arrivalYear: number): ForeignPlayerProfile {
  return {
    origin: weightedOrigin(),
    arrivalYear,
    contractYearsRemaining: initialContractYears(),
    npbSeasons: 0,
    adaptationFactor: initialAdaptationFactor(),
  };
}

export function isForeignPlayer(player: Player): boolean {
  return Boolean(
    player.foreignProfile ||
    player.signedVia?.includes('外国人') ||
    player.note?.includes('外国人'),
  );
}

export function foreignPerformanceMultiplier(player: Player): number {
  return isForeignPlayer(player)
    ? clamp(
        player.foreignProfile?.adaptationFactor ?? 1,
        FOREIGN_PLAYER_BALANCE.adaptation.minimumFactor,
        FOREIGN_PLAYER_BALANCE.adaptation.maximumFactor,
      )
    : 1;
}

export function countForeignPlayers(team: Team): number {
  return [...team.pitchers, ...team.fielders].filter(isForeignPlayer).length;
}

export function canRegisterForeignPlayer(team: Team): boolean {
  return countForeignPlayers(team) < FOREIGN_PLAYER_BALANCE.registeredLimit;
}
