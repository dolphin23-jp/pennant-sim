import { CENTRAL, PACIFIC } from '../data';
import { runCpuDraft, type DraftPick } from './draft';
import { growthPhase } from './growth';
import { cpuAutoSignMarketRounds, genForeignMarket, genFreeAgentMarket } from './market';
import { calcOVR } from './ratings';
import type { Player, Team, TeamKey, Teams } from './types';

export type RosterExitReason =
  'mandatoryRetirement' | 'ageAndPerformance' | 'draftOpportunity' | 'rosterCompetition';

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
}

export interface AutomatedOffseasonResult {
  teams: Teams;
  growthTeams: Teams;
  awakeningEvents: ReturnType<typeof growthPhase>['awakeEvents'];
  exits: RosterExit[];
  draftPicks: DraftPick[];
  freeAgentSignings: number;
  foreignSignings: number;
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

function retentionScore(player: Player): number {
  const agePenalty = player.age <= 30 ? 0 : (player.age - 30) * (player.age >= 38 ? 1.8 : 1.05);
  const potentialBonus =
    player.potentialClass === 'elite' && player.age <= 27
      ? 12
      : player.age <= 25
        ? Math.max(
            0,
            ...Object.entries(player.pot ?? {}).map(([key, value]) => {
              const current = player.p[key as keyof typeof player.p];
              return typeof value === 'number' && typeof current === 'number' ? value - current : 0;
            }),
          ) * 0.15
        : 0;
  return playerOvr(player) - agePenalty + potentialBonus;
}

function exitReason(player: Player, forcedForDraft: boolean): RosterExitReason {
  if (player.age >= 42) return 'mandatoryRetirement';
  if (player.age >= 35 && playerOvr(player) <= 55) return 'ageAndPerformance';
  return forcedForDraft ? 'draftOpportunity' : 'rosterCompetition';
}

function removalPriority(player: Player): number {
  if (player.age >= 42) return 0;
  if (player.age >= 35 && playerOvr(player) <= 55) return 1;
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

function resolvedOptions(
  options: CpuRosterOptions,
): Required<Omit<CpuRosterOptions, 'excludedTeam'>> & { excludedTeam: TeamKey | null } {
  return {
    excludedTeam: options.excludedTeam ?? null,
    draftRounds: options.draftRounds ?? DEFAULTS.draftRounds,
    targetPitchers: options.targetPitchers ?? DEFAULTS.targetPitchers,
    targetFielders: options.targetFielders ?? DEFAULTS.targetFielders,
    minimumPitchers: options.minimumPitchers ?? DEFAULTS.minimumPitchers,
    minimumFielders: options.minimumFielders ?? DEFAULTS.minimumFielders,
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
    const desiredPitcherSlots = Math.min(
      resolved.draftRounds,
      Math.max(2, Math.round(resolved.draftRounds * 0.45)),
    );
    const result = removePlayers(
      team,
      teamKey,
      desiredPitcherSlots,
      resolved.draftRounds - desiredPitcherSlots,
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
  const growth = growthPhase(teams);
  const prepared = prepareCpuRostersForDraft(growth.teams, resolved);
  const freeAgents = genFreeAgentMarket();
  const foreignPlayers = genForeignMarket();
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
    exits: [...prepared.exits, ...finalized.exits],
    draftPicks: draft.picks,
    freeAgentSignings: freeAgents.length - afterFreeAgents.remaining.length,
    foreignSignings: foreignPlayers.length - afterForeign.remaining.length,
  };
}
