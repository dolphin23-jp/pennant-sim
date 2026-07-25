import { CENTRAL, FOREIGN_PLAYER_BALANCE, MATURITY_PEAK_AGE, PACIFIC } from '../data';
import { runCpuDraft, type DraftPick } from './draft';
import { foreignPerformanceMultiplier, isForeignPlayer } from './foreign';
import { growthPhase } from './growth';
import { cpuAutoSignMarketRounds, genForeignMarket, genFreeAgentMarket } from './market';
import { clamp, gaussian, random, randomInt } from './random';
import { calcOVR } from './ratings';
import type {
  AccumulatedStats,
  ForeignPlayerProfile,
  Player,
  PlayerStats,
  Team,
  TeamKey,
  Teams,
} from './types';

export type RosterExitReason =
  | 'mandatoryRetirement'
  | 'ageAndPerformance'
  | 'draftOpportunity'
  | 'rosterCompetition'
  | 'foreignRelease'
  | 'mlbTransfer';

export interface RosterExit {
  teamKey: TeamKey;
  playerId: string;
  name: string;
  age: number;
  isPitcher: boolean;
  ovr: number;
  reason: RosterExitReason;
}

export interface CpuRosterOptions {
  excludedTeam?: TeamKey | null;
  draftRounds?: number;
  targetPitchers?: number;
  targetFielders?: number;
  minimumPitchers?: number;
  minimumFielders?: number;
  year?: number;
  seasonStats?: AccumulatedStats;
}

export interface ForeignLifecycleEvent {
  teamKey: TeamKey;
  playerId: string;
  name: string;
  type: 'adaptation' | 'renewed' | 'released' | 'mlbTransfer';
  origin: ForeignPlayerProfile['origin'];
  npbSeasons: number;
  adaptationBefore: number;
  adaptationAfter: number;
  contractYearsRemaining: number;
  ovr: number;
}

export interface AutomatedOffseasonResult {
  teams: Teams;
  growthTeams: Teams;
  awakeningEvents: ReturnType<typeof growthPhase>['awakeEvents'];
  exits: RosterExit[];
  draftPicks: DraftPick[];
  freeAgentSignings: number;
  foreignSignings: number;
  foreignLifecycleEvents: ForeignLifecycleEvent[];
  foreignRenewals: number;
  foreignReleases: number;
  mlbTransfers: number;
}

const DEFAULTS = {
  draftRounds: 6,
  targetPitchers: 28,
  targetFielders: 35,
  minimumPitchers: 18,
  minimumFielders: 22,
} as const;

const teamKeys = (): TeamKey[] => [...CENTRAL, ...PACIFIC];
const playerOvr = (player: Player): number => calcOVR(player, player.isP ? undefined : player.pos);

function legacyForeignProfile(player: Player, year: number): ForeignPlayerProfile {
  return (
    player.foreignProfile ?? {
      origin: 'その他',
      arrivalYear: year - 1,
      contractYearsRemaining: 1,
      npbSeasons: 1,
      adaptationFactor: 1,
    }
  );
}

function performanceSignal(player: Player, stats: PlayerStats | undefined): number {
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

function evolvedAdaptation(current: number, performance: number): number {
  const balance = FOREIGN_PLAYER_BALANCE.adaptation;
  let next =
    current +
    (1 - current) * balance.annualRegressionToAverage +
    performance * balance.annualPerformanceShare +
    gaussian(0, balance.annualVariation);
  const tailRoll = random();
  if (tailRoll < balance.annualBreakthroughRate) next += 0.04 + random() * 0.09;
  else if (tailRoll < balance.annualBreakthroughRate + balance.annualSetbackRate)
    next -= 0.03 + random() * 0.07;
  return clamp(next, balance.minimumFactor, balance.maximumFactor);
}

function renewalYears(score: number): number {
  if (score >= 90) return randomInt(2, 3);
  if (score >= 75) return random() < 0.55 ? 2 : 1;
  return 1;
}

export function reviewForeignPlayers(
  teams: Teams,
  seasonStats: AccumulatedStats = {},
  year = 2026,
): {
  teams: Teams;
  exits: RosterExit[];
  events: ForeignLifecycleEvent[];
} {
  const next = { ...teams };
  const exits: RosterExit[] = [];
  const events: ForeignLifecycleEvent[] = [];
  for (const teamKey of teamKeys()) {
    const team = teams[teamKey];
    const review = (player: Player): Player | null => {
      if (!isForeignPlayer(player)) return player;
      const before = legacyForeignProfile(player, year);
      const performance = performanceSignal(player, seasonStats[player.id]);
      const adaptationAfter = evolvedAdaptation(before.adaptationFactor, performance);
      const contractYearsRemaining = Math.max(0, before.contractYearsRemaining - 1);
      const updatedProfile: ForeignPlayerProfile = {
        ...before,
        npbSeasons: before.npbSeasons + 1,
        adaptationFactor: adaptationAfter,
        contractYearsRemaining,
      };
      let reviewed: Player = {
        ...player,
        foreignProfile: updatedProfile,
      };
      const ovr = playerOvr(reviewed);
      const eventBase = {
        teamKey,
        playerId: player.id,
        name: player.name,
        origin: before.origin,
        npbSeasons: updatedProfile.npbSeasons,
        adaptationBefore: before.adaptationFactor,
        adaptationAfter,
        contractYearsRemaining,
        ovr,
      };
      if (Math.abs(adaptationAfter - before.adaptationFactor) >= 0.03)
        events.push({ ...eventBase, type: 'adaptation' });
      if (contractYearsRemaining > 0) return reviewed;

      const contractBalance = FOREIGN_PLAYER_BALANCE.contractReview;
      const mlbRate = clamp(
        contractBalance.mlbBaseRate +
          Math.max(0, ovr - contractBalance.mlbMinimumOvr) * contractBalance.mlbOvrRate,
        0,
        contractBalance.mlbMaximumRate,
      );
      if (
        ovr >= contractBalance.mlbMinimumOvr &&
        reviewed.age <= contractBalance.mlbMaximumAge &&
        performance >= contractBalance.mlbMinimumPerformanceSignal &&
        random() < mlbRate
      ) {
        events.push({ ...eventBase, type: 'mlbTransfer' });
        exits.push({
          teamKey,
          playerId: player.id,
          name: player.name,
          age: player.age,
          isPitcher: player.isP,
          ovr,
          reason: 'mlbTransfer',
        });
        return null;
      }

      const renewalScore =
        ovr + performance * 12 + (foreignPerformanceMultiplier(reviewed) - 1) * 20 + gaussian(0, 5);
      if (renewalScore < contractBalance.renewalScoreThreshold || reviewed.age >= 39) {
        events.push({ ...eventBase, type: 'released' });
        exits.push({
          teamKey,
          playerId: player.id,
          name: player.name,
          age: player.age,
          isPitcher: player.isP,
          ovr,
          reason: 'foreignRelease',
        });
        return null;
      }

      const renewedYears = renewalYears(renewalScore);
      reviewed = {
        ...reviewed,
        foreignProfile: {
          ...updatedProfile,
          contractYearsRemaining: renewedYears,
        },
        note: `${before.origin}・契約更新 ${renewedYears}年`,
      };
      events.push({
        ...eventBase,
        type: 'renewed',
        contractYearsRemaining: renewedYears,
      });
      return reviewed;
    };
    next[teamKey] = {
      ...team,
      pitchers: team.pitchers.map(review).filter((player): player is Player => player !== null),
      fielders: team.fielders.map(review).filter((player): player is Player => player !== null),
    };
  }
  return { teams: next, exits, events };
}

function retentionScore(player: Player): number {
  const agePenalty = player.age <= 30 ? 0 : (player.age - 30) * (player.age >= 38 ? 1.8 : 1.05);
  const potentialGap = Math.max(
    0,
    ...Object.entries(player.pot ?? {}).map(([key, value]) => {
      const current = player.p[key as keyof typeof player.p];
      return typeof value === 'number' && typeof current === 'number' ? value - current : 0;
    }),
  );
  const potentialBonus =
    player.age <= MATURITY_PEAK_AGE[player.mat]
      ? potentialGap * 0.15 +
        (player.potentialClass === 'elite' ? 12 : 0) +
        (player.generationalTalent ? 18 : 0) +
        Math.max(0, MATURITY_PEAK_AGE[player.mat] - player.age) * 0.65
      : 0;
  const foreignContractBonus = isForeignPlayer(player)
    ? 16 + (player.foreignProfile?.contractYearsRemaining ?? 1) * 4
    : 0;
  return playerOvr(player) - agePenalty + potentialBonus + foreignContractBonus;
}

function exitReason(player: Player, forcedForDraft: boolean): RosterExitReason {
  if (player.age >= 42) return 'mandatoryRetirement';
  if (player.age >= 35 && playerOvr(player) <= 55) return 'ageAndPerformance';
  return forcedForDraft ? 'draftOpportunity' : 'rosterCompetition';
}

function removalPriority(player: Player): number {
  if (player.age >= 42) return 0;
  if (player.age >= 35 && playerOvr(player) <= 55) return 1;
  if (isForeignPlayer(player) && (player.foreignProfile?.contractYearsRemaining ?? 0) > 0) return 3;
  return 2;
}

function removePlayers(
  team: Team,
  teamKey: TeamKey,
  pitcherRemovals: number,
  fielderRemovals: number,
  reasonMode: 'draft' | 'competition',
  options: Required<Omit<CpuRosterOptions, 'excludedTeam'>>,
): { team: Team; exits: RosterExit[] } {
  const exits: RosterExit[] = [];
  const choose = (players: Player[], count: number, minimum: number): Player[] => {
    const removable = Math.max(0, players.length - minimum);
    return [...players]
      .sort(
        (first, second) =>
          removalPriority(first) - removalPriority(second) ||
          retentionScore(first) - retentionScore(second),
      )
      .slice(0, Math.min(count, removable));
  };
  const pitchers = choose(team.pitchers, pitcherRemovals, options.minimumPitchers);
  const fielders = choose(team.fielders, fielderRemovals, options.minimumFielders);
  const removedIds = new Set([...pitchers, ...fielders].map((player) => player.id));
  for (const player of [...pitchers, ...fielders]) {
    exits.push({
      teamKey,
      playerId: player.id,
      name: player.name,
      age: player.age,
      isPitcher: player.isP,
      ovr: playerOvr(player),
      reason: exitReason(player, reasonMode === 'draft'),
    });
  }
  return {
    team: {
      ...team,
      pitchers: team.pitchers.filter((player) => !removedIds.has(player.id)),
      fielders: team.fielders.filter((player) => !removedIds.has(player.id)),
    },
    exits,
  };
}

function resolvedOptions(options: CpuRosterOptions): Required<
  Omit<CpuRosterOptions, 'excludedTeam' | 'seasonStats'>
> & {
  excludedTeam: TeamKey | null;
  seasonStats: AccumulatedStats;
} {
  return {
    excludedTeam: options.excludedTeam ?? null,
    draftRounds: options.draftRounds ?? DEFAULTS.draftRounds,
    targetPitchers: options.targetPitchers ?? DEFAULTS.targetPitchers,
    targetFielders: options.targetFielders ?? DEFAULTS.targetFielders,
    minimumPitchers: options.minimumPitchers ?? DEFAULTS.minimumPitchers,
    minimumFielders: options.minimumFielders ?? DEFAULTS.minimumFielders,
    year: options.year ?? 2026,
    seasonStats: options.seasonStats ?? {},
  };
}

export function prepareCpuRostersForDraft(
  teams: Teams,
  options: CpuRosterOptions = {},
): { teams: Teams; exits: RosterExit[] } {
  const resolved = resolvedOptions(options);
  const next = { ...teams };
  const exits: RosterExit[] = [];
  for (const teamKey of teamKeys()) {
    if (teamKey === resolved.excludedTeam) continue;
    const team = next[teamKey];
    const mandatoryPitcherRetirements = team.pitchers.filter((player) => player.age >= 42).length;
    const mandatoryFielderRetirements = team.fielders.filter((player) => player.age >= 42).length;
    const desiredPitcherSlots = Math.min(
      resolved.draftRounds,
      Math.max(2, Math.round(resolved.draftRounds * 0.45)),
    );
    const existingPitcherSlots = Math.max(0, resolved.targetPitchers - team.pitchers.length);
    const existingFielderSlots = Math.max(0, resolved.targetFielders - team.fielders.length);
    const result = removePlayers(
      team,
      teamKey,
      Math.max(mandatoryPitcherRetirements, desiredPitcherSlots - existingPitcherSlots, 0),
      Math.max(
        mandatoryFielderRetirements,
        resolved.draftRounds - desiredPitcherSlots - existingFielderSlots,
        0,
      ),
      'draft',
      resolved,
    );
    next[teamKey] = result.team;
    exits.push(...result.exits);
  }
  return { teams: next, exits };
}

export function finalizeCpuRosters(
  teams: Teams,
  options: CpuRosterOptions = {},
): { teams: Teams; exits: RosterExit[] } {
  const resolved = resolvedOptions(options);
  const next = { ...teams };
  const exits: RosterExit[] = [];
  for (const teamKey of teamKeys()) {
    if (teamKey === resolved.excludedTeam) continue;
    const team = next[teamKey];
    const result = removePlayers(
      team,
      teamKey,
      Math.max(0, team.pitchers.length - resolved.targetPitchers),
      Math.max(0, team.fielders.length - resolved.targetFielders),
      'competition',
      resolved,
    );
    next[teamKey] = result.team;
    exits.push(...result.exits);
  }
  return { teams: next, exits };
}

export function runAutomatedOffseason(
  teams: Teams,
  options: CpuRosterOptions = {},
): AutomatedOffseasonResult {
  const resolved = resolvedOptions(options);
  const foreignReview = reviewForeignPlayers(teams, resolved.seasonStats, resolved.year);
  const growth = growthPhase(foreignReview.teams);
  const prepared = prepareCpuRostersForDraft(growth.teams, resolved);
  const freeAgents = genFreeAgentMarket();
  const foreignPlayers = genForeignMarket(resolved.year + 1);
  const afterFreeAgents = cpuAutoSignMarketRounds(
    prepared.teams,
    freeAgents,
    'fa',
    4,
    resolved.excludedTeam,
  );
  const afterForeign = cpuAutoSignMarketRounds(
    afterFreeAgents.teams,
    foreignPlayers,
    'foreign',
    4,
    resolved.excludedTeam,
  );
  const draft = runCpuDraft(afterForeign.teams, resolved.draftRounds);
  const finalized = finalizeCpuRosters(draft.teams, resolved);
  return {
    teams: finalized.teams,
    growthTeams: growth.teams,
    awakeningEvents: growth.awakeEvents,
    exits: [...foreignReview.exits, ...prepared.exits, ...finalized.exits],
    draftPicks: draft.picks,
    freeAgentSignings: freeAgents.length - afterFreeAgents.remaining.length,
    foreignSignings: foreignPlayers.length - afterForeign.remaining.length,
    foreignLifecycleEvents: foreignReview.events,
    foreignRenewals: foreignReview.events.filter((event) => event.type === 'renewed').length,
    foreignReleases: foreignReview.events.filter((event) => event.type === 'released').length,
    mlbTransfers: foreignReview.events.filter((event) => event.type === 'mlbTransfer').length,
  };
}
