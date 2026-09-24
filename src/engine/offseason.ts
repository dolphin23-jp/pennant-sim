import { emitRosterExits } from './narrativeEvents';
import type { NarrativeEvent, NarrativeEventContext } from '../narrative/types';
import {
  CENTRAL,
  FIELD_POSITIONS,
  FOREIGN_PLAYER_BALANCE,
  MATURITY_PEAK_AGE,
  PACIFIC,
  RETIREMENT_BALANCE,
} from '../data';
import {
  accrueServiceTime,
  estimatedSalary,
  performanceSignal,
  renewContracts,
  updateTeamFinances,
  withTeamContractDefaults,
  type SeasonOutcome,
} from './contracts';
import type { DraftPick } from './draft';
import { runCpuDraft } from './draftPrePro';
import { foreignPerformanceMultiplier, isForeignPlayer } from './foreign';
import {
  advanceOverseasPlayers,
  declareFreeAgents,
  resolveMlbDepartures,
  returnUnsignedFreeAgents,
  type MlbDeparture,
} from './freeAgency';
import { growthPhase } from './growth';
import {
  cpuAutoSignMarketRounds,
  cpuAutoTradeBetweenTeams,
  genForeignMarket,
  genFreeAgentMarket,
  withoutMarketFields,
} from './market';
import { clamp, gaussian, random, randomChoice, randomInt } from './random';
import { generateBatter, generatePitcher, initTeams } from './players';
import { calcOVR } from './ratings';
import type {
  AccumulatedStats,
  FieldPosition,
  ForeignPlayerProfile,
  Player,
  Team,
  TeamKey,
  Teams,
} from './types';

export type RosterExitReason =
  | 'mandatoryRetirement'
  | 'voluntaryRetirement'
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
  /** The player as he left, so his record can be archived with the retired players. */
  player: Player;
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
  /** Japanese stars who left for MLB this winter (also in exits). */
  mlbDepartures: MlbDeparture[];
  /** Players who declared free agency, and how many of them changed clubs. */
  declaredFreeAgents: Player[];
  freeAgentMoves: number;
  /** Players in MLB after this winter. */
  overseas: Player[];
  narrativeEvents: NarrativeEvent[];
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
  context?: NarrativeEventContext,
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
          player,
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
          player,
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
  emitRosterExits(context, exits);
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

function voluntaryRetirementChance(player: Player): number {
  if (player.age < RETIREMENT_BALANCE.startAge || player.age >= 42) return 0;
  const byAge =
      RETIREMENT_BALANCE.chanceByAge[player.age as keyof typeof RETIREMENT_BALANCE.chanceByAge] ??
      0,
    ovr = playerOvr(player);
  return (
    byAge *
    (ovr >= RETIREMENT_BALANCE.legendOvr
      ? RETIREMENT_BALANCE.legendMultiplier
      : ovr >= RETIREMENT_BALANCE.starOvr
        ? RETIREMENT_BALANCE.starMultiplier
        : ovr <= RETIREMENT_BALANCE.fringeOvr
          ? RETIREMENT_BALANCE.fringeMultiplier
          : 1)
  );
}

function exitReason(
  player: Player,
  forcedForDraft: boolean,
  retiring: ReadonlySet<string>,
): RosterExitReason {
  if (player.age >= 42) return 'mandatoryRetirement';
  if (retiring.has(player.id)) return 'voluntaryRetirement';
  if (player.age >= 35 && playerOvr(player) <= 55) return 'ageAndPerformance';
  return forcedForDraft ? 'draftOpportunity' : 'rosterCompetition';
}

function removalPriority(player: Player, retiring: ReadonlySet<string>): number {
  if (player.age >= 42) return 0;
  if (retiring.has(player.id)) return 1;
  if (player.age >= 35 && playerOvr(player) <= 55) return 2;
  if (isForeignPlayer(player) && (player.foreignProfile?.contractYearsRemaining ?? 0) > 0) return 4;
  return 3;
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
  // Veterans decide once per winter, before the draft, whether this is their last season.
  const retiring = new Set(
    reasonMode === 'draft'
      ? [...team.pitchers, ...team.fielders]
          .filter((player) => {
            const chance = voluntaryRetirementChance(player);
            return chance > 0 && random() < chance;
          })
          .map((player) => player.id)
      : [],
  );
  const choose = (players: Player[], count: number, minimum: number): Player[] => {
    const ordered = [...players].sort(
      (first, second) =>
        removalPriority(first, retiring) - removalPriority(second, retiring) ||
        retentionScore(first) - retentionScore(second),
    );
    // Mandatory retirements (sorted first) always happen; the roster minimum only limits
    // discretionary releases. The draft and free-agent phases refill the roster afterwards.
    const mandatory = ordered.filter((player) => removalPriority(player, retiring) === 0).length;
    const removable = Math.max(mandatory, players.length - minimum);
    return ordered.slice(0, Math.min(Math.max(count, mandatory), removable));
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
      reason: exitReason(player, reasonMode === 'draft', retiring),
      player,
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
  context?: NarrativeEventContext,
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
  emitRosterExits(context, exits);
  return { teams: next, exits };
}

export function finalizeCpuRosters(
  teams: Teams,
  options: CpuRosterOptions = {},
  context?: NarrativeEventContext,
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
    next[teamKey] = withRosterShortfallsFilled(result.team, teamKey, resolved);
    exits.push(...result.exits);
  }
  emitRosterExits(context, exits);
  return { teams: next, exits };
}

/** A development-squad (育成) player promoted to the roster. */
function promotedPlayer(teamKey: TeamKey, pitcher: boolean, position?: FieldPosition): Player {
  const age = randomInt(19, 23);
  const quality = clamp(gaussian(50, 7), 36, 66);
  const generated = pitcher
    ? generatePitcher(teamKey, age, quality, random() < 0.45 ? '先発' : 'リリーフ')
    : generateBatter(teamKey, age, position ?? randomChoice(FIELD_POSITIONS), quality);
  const promoted: Player = {
    ...generated,
    tk: teamKey,
    draftOrigin: age <= 20 ? '高卒' : '大卒',
    signedVia: '育成から支配下登録',
    serviceYears: 0,
    contractYears: 1,
  };
  return { ...promoted, salary: estimatedSalary(promoted) };
}

/**
 * A club that ended the winter short (players who left in free agency or for MLB and were
 * not replaced) promotes development-squad players to keep its roster at the target.
 */
function withRosterShortfallsFilled(
  team: Team,
  teamKey: TeamKey,
  options: { targetPitchers: number; targetFielders: number },
): Team {
  const pitcherShortfall = Math.max(0, options.targetPitchers - team.pitchers.length);
  const fielderShortfall = Math.max(0, options.targetFielders - team.fielders.length);
  if (!pitcherShortfall && !fielderShortfall) return team;
  const fielders = [...team.fielders];
  for (let index = 0; index < fielderShortfall; index += 1) {
    const thinnest = [...FIELD_POSITIONS].sort(
      (first, second) =>
        fielders.filter((player) => player.pos === first).length -
        fielders.filter((player) => player.pos === second).length,
    )[0];
    fielders.push(promotedPlayer(teamKey, false, thinnest));
  }
  return {
    ...team,
    pitchers: [
      ...team.pitchers,
      ...Array.from({ length: pitcherShortfall }, () => promotedPlayer(teamKey, true)),
    ],
    fielders,
  };
}

/**
 * The first half of every winter, shared by the automated and interactive offseasons:
 * foreign contract reviews, service time, growth, the budgets that follow last season's
 * revenue, stars leaving for MLB, FA declarations, and the CPU clubs' pre-draft cuts.
 * `userTeam` (when the user manages the winter) makes its own cuts and never posts.
 */
export function openOffseason(
  teams: Teams,
  options: {
    year: number;
    seasonStats?: AccumulatedStats;
    outcome?: SeasonOutcome;
    userTeam?: TeamKey | null;
    /** Players currently in MLB. */
    overseas?: readonly Player[];
  },
  context?: NarrativeEventContext,
) {
  const seasonStats = options.seasonStats ?? {};
  const abroad = advanceOverseasPlayers(options.overseas ?? [], options.year);
  const foreignReview = reviewForeignPlayers(
    withTeamContractDefaults(teams),
    seasonStats,
    options.year,
    context,
  );
  const served = accrueServiceTime(foreignReview.teams, seasonStats);
  const growth = growthPhase(served, context);
  const funded = updateTeamFinances(growth.teams, options.outcome);
  const mlb = resolveMlbDepartures(
    funded,
    { year: options.year, outcome: options.outcome, consentWithheldBy: options.userTeam ?? null },
    context,
  );
  const declaration = declareFreeAgents(mlb.teams, { outcome: options.outcome });
  const prepared = prepareCpuRostersForDraft(
    declaration.teams,
    { excludedTeam: options.userTeam ?? null, year: options.year },
    context,
  );
  return {
    foreignReview,
    growth,
    mlb,
    declared: declaration.declared,
    prepared,
    teams: prepared.teams,
    /** The domestic market: this winter's declared free agents, players back from MLB and
     * the journeymen. */
    freeAgentMarket: [...declaration.declared, ...abroad.returning, ...genFreeAgentMarket()],
    /** Players in MLB after this winter's departures (returning players not included). */
    overseas: [...abroad.overseas, ...mlb.abroad],
  };
}

/** CPU bidding for the domestic market; declared free agents nobody signed go home. */
export function settleFreeAgency(
  teams: Teams,
  market: Player[],
  options: { excludedTeam?: TeamKey | null; outcome?: SeasonOutcome; rounds?: number } = {},
  context?: NarrativeEventContext,
): {
  teams: Teams;
  remaining: Player[];
  signed: number;
  moved: number;
  /** Players back from MLB whom no club signed; they stay abroad. */
  unsignedReturnees: Player[];
} {
  const bidding = cpuAutoSignMarketRounds(
    teams,
    market,
    'fa',
    options.rounds ?? 4,
    options.excludedTeam ?? null,
    context,
    options.outcome,
  );
  const unsigned = returnUnsignedFreeAgents(bidding.teams, bidding.remaining, context);
  const remainingIds = new Set(bidding.remaining.map((player) => player.id));
  const signed = market.filter((player) => !remainingIds.has(player.id));
  const onRoster = new Map(
    Object.values(bidding.teams).flatMap((team) =>
      [...team.pitchers, ...team.fielders].map((player) => [player.id, team.key] as const),
    ),
  );
  return {
    teams: unsigned.teams,
    remaining: bidding.remaining.filter((player) => !player.faFrom),
    unsignedReturnees: bidding.remaining
      .filter((player) => player.abroadSince != null)
      .map((player) => ({
        ...withoutMarketFields(player),
        tk: 'foreign' as const,
        abroadSince: player.abroadSince,
        homeTeam: player.homeTeam,
      })),
    signed: signed.length,
    moved: signed.filter((player) => player.faFrom && onRoster.get(player.id) !== player.faFrom)
      .length,
  };
}

export function runAutomatedOffseason(
  teams: Teams,
  options: CpuRosterOptions & { outcome?: SeasonOutcome; overseas?: readonly Player[] } = {},
): AutomatedOffseasonResult {
  const resolved = resolvedOptions(options);
  const narrativeEvents: NarrativeEvent[] = [];
  const context: NarrativeEventContext = {
    year: resolved.year,
    date: `${resolved.year}年オフ`,
    emit: (e) => narrativeEvents.push(e),
  };
  const opened = openOffseason(
    teams,
    {
      year: resolved.year,
      seasonStats: resolved.seasonStats,
      outcome: options.outcome,
      overseas: options.overseas,
    },
    context,
  );
  const foreignPlayers = genForeignMarket(resolved.year + 1);
  const afterFreeAgents = settleFreeAgency(
    opened.teams,
    opened.freeAgentMarket,
    { excludedTeam: resolved.excludedTeam, outcome: options.outcome },
    context,
  );
  const afterForeign = cpuAutoSignMarketRounds(
    afterFreeAgents.teams,
    foreignPlayers,
    'foreign',
    4,
    resolved.excludedTeam,
    context,
    options.outcome,
  );
  const draft = runCpuDraft(afterForeign.teams, resolved.draftRounds, context);
  const finalized = finalizeCpuRosters(draft.teams, resolved, context);
  const foreignReview = opened.foreignReview;
  return {
    narrativeEvents,
    teams: renewContracts(finalized.teams, resolved.seasonStats),
    growthTeams: opened.growth.teams,
    awakeningEvents: opened.growth.awakeEvents,
    exits: [
      ...foreignReview.exits,
      ...opened.mlb.exits,
      ...opened.prepared.exits,
      ...finalized.exits,
    ],
    draftPicks: draft.picks,
    freeAgentSignings: afterFreeAgents.signed,
    foreignSignings: foreignPlayers.length - afterForeign.remaining.length,
    foreignLifecycleEvents: foreignReview.events,
    foreignRenewals: foreignReview.events.filter((event) => event.type === 'renewed').length,
    foreignReleases: foreignReview.events.filter((event) => event.type === 'released').length,
    mlbTransfers: foreignReview.events.filter((event) => event.type === 'mlbTransfer').length,
    mlbDepartures: opened.mlb.departures,
    declaredFreeAgents: opened.declared,
    freeAgentMoves: afterFreeAgents.moved,
    overseas: [...opened.overseas, ...afterFreeAgents.unsignedReturnees],
  };
}

export interface FullOffseasonResult {
  teams: Teams;
  /** Every player who left a roster this winter (retired, released, or moved abroad). */
  exits: RosterExit[];
  foreignReview: ReturnType<typeof reviewForeignPlayers>;
  growth: ReturnType<typeof growthPhase>;
  draftPicks: DraftPick[];
  freeAgentSignings: number;
  foreignSignings: number;
  mlbDepartures: MlbDeparture[];
  declaredFreeAgents: Player[];
  freeAgentMoves: number;
  overseas: Player[];
}

/**
 * The whole offseason with every club, the user's included, managed by the CPU: the same
 * order the interactive offseason screen follows (foreign review, service time, growth,
 * budgets, MLB departures, FA declarations, pre-draft cuts, the FA and foreign markets, CPU
 * trades, the draft in standings order, final cuts, contract renewals). The user's club
 * takes part in cuts, signings and the draft but is never traded away.
 */
export function runFullOffseason(
  teams: Teams,
  options: {
    year: number;
    seasonStats: AccumulatedStats;
    draftOrder: TeamKey[];
    userTeam: TeamKey;
    outcome?: SeasonOutcome;
    overseas?: readonly Player[];
  },
  context?: NarrativeEventContext,
): FullOffseasonResult {
  const opened = openOffseason(
    teams,
    {
      year: options.year,
      seasonStats: options.seasonStats,
      outcome: options.outcome,
      overseas: options.overseas,
    },
    context,
  );
  const rosterOptions: CpuRosterOptions = { excludedTeam: null, year: options.year };
  const foreignMarket = genForeignMarket(options.year + 1);
  const afterFreeAgents = settleFreeAgency(
    opened.teams,
    opened.freeAgentMarket,
    { excludedTeam: null, outcome: options.outcome },
    context,
  );
  const afterForeign = cpuAutoSignMarketRounds(
    afterFreeAgents.teams,
    foreignMarket,
    'foreign',
    4,
    null,
    context,
    options.outcome,
  );
  const traded = cpuAutoTradeBetweenTeams(afterForeign.teams, options.userTeam, 8, context);
  const draft = runCpuDraft(traded, DEFAULTS.draftRounds, context, options.draftOrder);
  const finalized = finalizeCpuRosters(draft.teams, rosterOptions, context);
  return {
    teams: renewContracts(finalized.teams, options.seasonStats),
    exits: [
      ...opened.foreignReview.exits,
      ...opened.mlb.exits,
      ...opened.prepared.exits,
      ...finalized.exits,
    ],
    foreignReview: opened.foreignReview,
    growth: opened.growth,
    draftPicks: draft.picks,
    freeAgentSignings: afterFreeAgents.signed,
    foreignSignings: foreignMarket.length - afterForeign.remaining.length,
    mlbDepartures: opened.mlb.departures,
    declaredFreeAgents: opened.declared,
    freeAgentMoves: afterFreeAgents.moved,
    overseas: [...opened.overseas, ...afterFreeAgents.unsignedReturnees],
  };
}

/**
 * Offseasons run on freshly generated rosters before a world opens. Generated rosters
 * start well below the talent level the draft, growth and retirement cycle settles at,
 * and the generated record-class stars retire before home-grown ones replace them (a dip
 * in stars around years 10-16), so without this the first two decades of every world played
 * in a different era from the rest, and balance tuned on the opening season did not describe
 * the league a long-term player actually watches.
 */
export const SETTLED_LEAGUE_BURN_IN_YEARS = 20;

export function initSettledTeams(
  firstSeason = 2026,
  burnInYears = SETTLED_LEAGUE_BURN_IN_YEARS,
): Teams {
  return initSettledWorld(firstSeason, burnInYears).teams;
}

/** The settled league and the stars it has already sent to MLB, who may come back. */
export function initSettledWorld(
  firstSeason = 2026,
  burnInYears = SETTLED_LEAGUE_BURN_IN_YEARS,
): { teams: Teams; overseas: Player[] } {
  let teams = withTeamContractDefaults(initTeams());
  let overseas: Player[] = [];
  for (let index = 0; index < burnInYears; index += 1) {
    const offseason = runAutomatedOffseason(teams, {
      year: firstSeason - burnInYears + index,
      overseas,
    });
    teams = offseason.teams;
    overseas = offseason.overseas;
  }
  return { teams, overseas };
}

/** Called by the user-retirement command, before removing the explicitly selected players. */
export function retirePlayers(
  teams: Teams,
  teamKey: TeamKey,
  ids: readonly string[],
  context?: NarrativeEventContext,
) {
  const selected = new Set(ids);
  const team = teams[teamKey];
  const removed = [...team.pitchers, ...team.fielders].filter((p) => selected.has(p.id));
  for (const player of removed)
    context?.emit({
      type: 'transaction',
      id: `transaction:retirement:${context.year}:${teamKey}:${player.id}`,
      year: context.year,
      date: context.date,
      transactionKind: 'retirement',
      playerId: player.id,
      playerName: player.name,
      fromTeamKey: teamKey,
      exitReason: 'userRetirement',
    });
  return {
    teams: {
      ...teams,
      [teamKey]: {
        ...team,
        pitchers: team.pitchers.filter((p) => !selected.has(p.id)),
        fielders: team.fielders.filter((p) => !selected.has(p.id)),
      },
    },
    retiredPlayers: removed,
  };
}
