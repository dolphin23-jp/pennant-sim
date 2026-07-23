import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

import {
  accumulateStatsAll,
  calcOVR,
  configureRandom,
  effectiveOVR,
  generateSchedule,
  growthPhase,
  initTeams,
  resetRandom,
  simulateGame,
  type AccumulatedStats,
  type Player,
  type PlayerStats,
  type TeamKey,
  type Teams,
} from '../src/engine/index';
import {
  applyDraftPicks,
  cpuDraftPick,
  draftOrder,
  generateDraftProspects,
  type DraftPick,
} from '../src/state/offseason';
import { evaluateNpbScoringTargets, NPB_SCORING_TARGETS } from './npb-targets.mjs';

const DEFAULT_START_YEAR = 2026;
const DEFAULT_YEARS = 25;
const DEFAULT_SEED = 20260724;
const DEFAULT_OUTPUT = 'baseline/franchise-drift.json';
const DRAFT_ROUNDS = 6;
const MIN_PITCHERS = 18;
const MIN_FIELDERS = 22;
const LOW_OVR_RETIREMENT_AGE = 35;
const LOW_OVR_RETIREMENT_THRESHOLD = 50;
const MANDATORY_RETIREMENT_AGE = 40;

type RetirementReason = 'mandatoryAge' | 'ageAndLowOvr' | 'draftRoom';
type RosterCaps = Record<TeamKey, { pitchers: number; fielders: number; total: number }>;

interface CliOptions {
  startYear: number;
  years: number;
  seed: number;
  output: string;
}

interface RetirementRecord {
  teamKey: TeamKey;
  playerId: string;
  name: string;
  age: number;
  isPitcher: boolean;
  ovr: number;
  reason: RetirementReason;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function parsePositiveInteger(value: string, flagName: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0)
    throw new Error(`${flagName} must be a positive integer.`);
  return parsed;
}

function parseArguments(argv: string[]): CliOptions {
  const options: CliOptions = {
    startYear: DEFAULT_START_YEAR,
    years: DEFAULT_YEARS,
    seed: DEFAULT_SEED,
    output: DEFAULT_OUTPUT,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];
    if (argument === '--start-year') {
      if (!next) throw new Error(`${argument} requires a value.`);
      options.startYear = parsePositiveInteger(next, argument);
      index += 1;
    } else if (argument === '--years' || argument === '-n') {
      if (!next) throw new Error(`${argument} requires a value.`);
      options.years = parsePositiveInteger(next, argument);
      index += 1;
    } else if (argument === '--seed') {
      if (!next) throw new Error(`${argument} requires a value.`);
      options.seed = parsePositiveInteger(next, argument);
      index += 1;
    } else if (argument === '--output' || argument === '-o') {
      if (!next) throw new Error(`${argument} requires a value.`);
      options.output = next;
      index += 1;
    } else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

const round = (value: number, digits = 3): number => Number(value.toFixed(digits));
const ratio = (numerator: number, denominator: number): number =>
  denominator > 0 ? numerator / denominator : 0;
const average = (values: number[]): number =>
  values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;

function standardDeviation(values: number[]): number {
  if (!values.length) return 0;
  const mean = average(values);
  return Math.sqrt(
    values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length,
  );
}

function playerOvr(player: Player): number {
  return player.isP ? calcOVR(player) : effectiveOVR(player, player.pos);
}

function teamKeys(teams: Teams): TeamKey[] {
  return Object.keys(teams) as TeamKey[];
}

function initialRosterCaps(teams: Teams): RosterCaps {
  return Object.fromEntries(
    teamKeys(teams).map((teamKey) => {
      const team = teams[teamKey];
      return [
        teamKey,
        {
          pitchers: team.pitchers.length,
          fielders: team.fielders.length,
          total: team.pitchers.length + team.fielders.length,
        },
      ];
    }),
  ) as RosterCaps;
}

function rosterSnapshot(teams: Teams) {
  const rows = teamKeys(teams).map((teamKey) => {
    const team = teams[teamKey];
    const pitcherOvrs = team.pitchers.map(playerOvr);
    const fielderOvrs = team.fielders.map(playerOvr);
    const players = [...team.pitchers, ...team.fielders];
    return {
      teamKey,
      players: players.length,
      pitchers: team.pitchers.length,
      fielders: team.fielders.length,
      averageAge: round(average(players.map((player) => player.age)), 2),
      averageOvr: round(average([...pitcherOvrs, ...fielderOvrs]), 3),
      pitcherOvr: round(average(pitcherOvrs), 3),
      fielderOvr: round(average(fielderOvrs), 3),
    };
  });
  const pitchers = teamKeys(teams).flatMap((teamKey) => teams[teamKey].pitchers);
  const fielders = teamKeys(teams).flatMap((teamKey) => teams[teamKey].fielders);
  const players = [...pitchers, ...fielders];
  const ranked = [...rows].sort((first, second) => first.averageOvr - second.averageOvr);
  const weakest = ranked[0];
  const strongest = ranked.at(-1);
  return {
    players: players.length,
    pitchers: pitchers.length,
    fielders: fielders.length,
    averageAge: round(average(players.map((player) => player.age)), 3),
    oldestAge: Math.max(...players.map((player) => player.age)),
    averageOvr: {
      overall: round(average(players.map(playerOvr)), 3),
      pitchers: round(average(pitchers.map(playerOvr)), 3),
      fielders: round(average(fielders.map(playerOvr)), 3),
    },
    teamOvrDistribution: {
      minimum: weakest ? { teamKey: weakest.teamKey, value: weakest.averageOvr } : null,
      maximum: strongest ? { teamKey: strongest.teamKey, value: strongest.averageOvr } : null,
      gap: round((strongest?.averageOvr ?? 0) - (weakest?.averageOvr ?? 0), 3),
      standardDeviation: round(
        standardDeviation(rows.map((team) => team.averageOvr)),
        3,
      ),
    },
    teams: rows,
  };
}

type RosterSnapshot = ReturnType<typeof rosterSnapshot>;

function sumStats(lines: PlayerStats[], key: string): number {
  return lines.reduce((total, line) => {
    const value = (line as unknown as Record<string, unknown>)[key];
    return total + (typeof value === 'number' ? value : 0);
  }, 0);
}

function seasonSnapshot(stats: AccumulatedStats, games: number, totalRuns: number) {
  const lines = Object.values(stats);
  const batting = lines.filter((line) => line.type === 'bat');
  const pitching = lines.filter((line) => line.type === 'pit');
  const atBats = sumStats(batting, 'ab');
  const hits = sumStats(batting, 'h');
  const homeRuns = sumStats(batting, 'hr');
  const walks = sumStats(batting, 'bb');
  const strikeouts = sumStats(batting, 'k');
  const plateAppearances = sumStats(batting, 'pa');
  const stolenBases = sumStats(batting, 'sb');
  const caughtStealing = sumStats(batting, 'cs');
  const earnedRuns = sumStats(pitching, 'er');
  const pitchingOuts = sumStats(pitching, 'ip3');
  return {
    games,
    battingAverage: round(ratio(hits, atBats), 6),
    babip: round(ratio(hits - homeRuns, atBats - strikeouts - homeRuns), 6),
    era: round(ratio(earnedRuns * 27, pitchingOuts), 6),
    homeRuns,
    homeRunsPerGame: round(ratio(homeRuns, games), 4),
    runsPerTeamGame: round(ratio(totalRuns, games * 2), 4),
    walkRate: round(ratio(walks, plateAppearances), 6),
    strikeoutRate: round(ratio(strikeouts, plateAppearances), 6),
    stolenBaseSuccessRate: round(ratio(stolenBases, stolenBases + caughtStealing), 6),
  };
}

type SeasonSnapshot = ReturnType<typeof seasonSnapshot>;

function retentionScore(player: Player): number {
  return playerOvr(player) - Math.max(0, player.age - 30) * 0.8;
}

function retirementReason(player: Player): RetirementReason | null {
  if (player.age >= MANDATORY_RETIREMENT_AGE) return 'mandatoryAge';
  if (
    player.age >= LOW_OVR_RETIREMENT_AGE &&
    playerOvr(player) <= LOW_OVR_RETIREMENT_THRESHOLD
  )
    return 'ageAndLowOvr';
  return null;
}

function recordRetirement(
  retired: RetirementRecord[],
  teamKey: TeamKey,
  player: Player,
  reason: RetirementReason,
): void {
  retired.push({
    teamKey,
    playerId: player.id,
    name: player.name,
    age: player.age,
    isPitcher: player.isP,
    ovr: playerOvr(player),
    reason,
  });
}

function applyDiagnosticRetirements(
  teams: Teams,
): { teams: Teams; retired: RetirementRecord[] } {
  const next = { ...teams };
  const retired: RetirementRecord[] = [];
  for (const teamKey of teamKeys(teams)) {
    const team = teams[teamKey];
    let pitchers = [...team.pitchers];
    let fielders = [...team.fielders];
    const selected = new Map<string, RetirementReason>();
    const ageCandidates = [...pitchers, ...fielders]
      .map((player) => ({ player, reason: retirementReason(player) }))
      .filter(
        (entry): entry is { player: Player; reason: Exclude<RetirementReason, 'draftRoom'> } =>
          entry.reason !== null,
      )
      .sort((first, second) => {
        const firstPriority = first.reason === 'mandatoryAge' ? 0 : 1;
        const secondPriority = second.reason === 'mandatoryAge' ? 0 : 1;
        return firstPriority - secondPriority || retentionScore(first.player) - retentionScore(second.player);
      });
    const removePlayer = (player: Player, reason: RetirementReason): boolean => {
      if (selected.size >= DRAFT_ROUNDS) return false;
      if (player.isP) {
        if (pitchers.length <= MIN_PITCHERS) return false;
        pitchers = pitchers.filter((candidate) => candidate.id !== player.id);
      } else {
        if (fielders.length <= MIN_FIELDERS) return false;
        fielders = fielders.filter((candidate) => candidate.id !== player.id);
      }
      selected.set(player.id, reason);
      return true;
    };
    for (const entry of ageCandidates) {
      if (selected.size >= DRAFT_ROUNDS) break;
      removePlayer(entry.player, entry.reason);
    }
    const draftRoomCandidates = [...pitchers, ...fielders].sort(
      (first, second) => retentionScore(first) - retentionScore(second),
    );
    for (const player of draftRoomCandidates) {
      if (selected.size >= DRAFT_ROUNDS) break;
      removePlayer(player, 'draftRoom');
    }
    if (selected.size !== DRAFT_ROUNDS)
      throw new Error(`${teamKey} could not create ${DRAFT_ROUNDS} draft roster slots.`);
    for (const player of [...team.pitchers, ...team.fielders]) {
      const reason = selected.get(player.id);
      if (reason) recordRetirement(retired, teamKey, player, reason);
    }
    next[teamKey] = { ...team, pitchers, fielders };
  }
  return { teams: next, retired };
}

function runDraft(teams: Teams): { teams: Teams; picks: DraftPick[] } {
  const order = draftOrder(teams);
  let prospects = generateDraftProspects();
  const picks: DraftPick[] = [];
  for (let roundNumber = 1; roundNumber <= DRAFT_ROUNDS; roundNumber += 1) {
    for (const teamKey of order) {
      const selected = cpuDraftPick(teams[teamKey], prospects);
      if (!selected) throw new Error(`Draft pool exhausted in round ${roundNumber}.`);
      picks.push({ ...selected, teamKey, round: roundNumber });
      prospects = prospects.filter((prospect) => prospect.id !== selected.id);
    }
  }
  return { teams: applyDraftPicks(teams, picks), picks };
}

function retirementSummary(retired: RetirementRecord[]) {
  const byReason: Record<RetirementReason, number> = {
    mandatoryAge: 0,
    ageAndLowOvr: 0,
    draftRoom: 0,
  };
  for (const player of retired) byReason[player.reason] += 1;
  return {
    total: retired.length,
    pitchers: retired.filter((player) => player.isPitcher).length,
    fielders: retired.filter((player) => !player.isPitcher).length,
    averageAge: round(average(retired.map((player) => player.age)), 2),
    averageOvr: round(average(retired.map((player) => player.ovr)), 3),
    byReason,
  };
}

function draftSummary(picks: DraftPick[]) {
  return {
    total: picks.length,
    pitchers: picks.filter((player) => player.isP).length,
    fielders: picks.filter((player) => !player.isP).length,
    averageAge: round(average(picks.map((player) => player.age)), 2),
    averageOvr: round(average(picks.map(playerOvr)), 3),
  };
}

interface YearReport {
  year: number;
  seasonIndex: number;
  openingRoster: RosterSnapshot;
  season: SeasonSnapshot;
  targetEvaluation: ReturnType<typeof evaluateNpbScoringTargets>;
  offseason: {
    awakeningEvents: number;
    retirements: ReturnType<typeof retirementSummary>;
    draft: ReturnType<typeof draftSummary>;
  };
  closingRoster: RosterSnapshot;
}

function driftSummary(years: YearReport[]) {
  const first = years[0];
  const last = years.at(-1);
  if (!first || !last) throw new Error('At least one franchise season is required.');
  const largestGap = years
    .map((year) => ({ year: year.year, value: year.closingRoster.teamOvrDistribution.gap }))
    .sort((firstRow, secondRow) => secondRow.value - firstRow.value)[0];
  const requiredEndpointsPassed = first.targetEvaluation.passed && last.targetEvaluation.passed;
  return {
    firstYear: first.year,
    finalYear: last.year,
    rosterSizeChange: last.closingRoster.players - first.openingRoster.players,
    openingToFinalClosingOvrChange: {
      overall: round(
        last.closingRoster.averageOvr.overall - first.openingRoster.averageOvr.overall,
        3,
      ),
      pitchers: round(
        last.closingRoster.averageOvr.pitchers - first.openingRoster.averageOvr.pitchers,
        3,
      ),
      fielders: round(
        last.closingRoster.averageOvr.fielders - first.openingRoster.averageOvr.fielders,
        3,
      ),
    },
    firstToFinalSeasonChange: {
      battingAverage: round(last.season.battingAverage - first.season.battingAverage, 6),
      era: round(last.season.era - first.season.era, 6),
      homeRuns: last.season.homeRuns - first.season.homeRuns,
    },
    largestClosingTeamOvrGap: largestGap,
    npbTargetEvaluation: {
      firstSeason: first.targetEvaluation,
      finalSeason: last.targetEvaluation,
      allSeasonsPassed: years.every((year) => year.targetEvaluation.passed),
      requiredEndpointsPassed,
    },
  };
}

async function simulateFranchise(options: CliOptions) {
  let clock = Date.UTC(options.startYear, 0, 1);
  configureRandom(mulberry32(options.seed), () => clock++);
  try {
    let teams = initTeams();
    const caps = initialRosterCaps(teams);
    const years: YearReport[] = [];
    for (let seasonIndex = 0; seasonIndex < options.years; seasonIndex += 1) {
      const year = options.startYear + seasonIndex;
      const openingRoster = rosterSnapshot(teams);
      const schedule = generateSchedule(year, { rainoutRate: 0, maxRainouts: 0 });
      const rotations = Object.fromEntries(
        teamKeys(teams).map((teamKey) => [teamKey, 0]),
      ) as Record<TeamKey, number>;
      let accumulated: AccumulatedStats = {};
      let totalRuns = 0;
      for (const game of schedule) {
        const result = simulateGame(
          game.homeKey,
          game.awayKey,
          teams,
          null,
          null,
          rotations[game.homeKey],
          rotations[game.awayKey],
          accumulated,
        );
        accumulated = accumulateStatsAll(result, accumulated);
        totalRuns += result.score.home + result.score.away;
        rotations[game.homeKey] += 1;
        rotations[game.awayKey] += 1;
      }
      const season = seasonSnapshot(accumulated, schedule.length, totalRuns);
      const targetEvaluation = evaluateNpbScoringTargets(season);
      const growth = growthPhase(teams);
      const retirements = applyDiagnosticRetirements(growth.teams);
      const draft = runDraft(retirements.teams);
      teams = draft.teams;
      const closingRoster = rosterSnapshot(teams);
      if (closingRoster.players !== openingRoster.players)
        throw new Error(`Roster size drifted from ${openingRoster.players} to ${closingRoster.players}.`);
      years.push({
        year,
        seasonIndex: seasonIndex + 1,
        openingRoster,
        season,
        targetEvaluation,
        offseason: {
          awakeningEvents: growth.awakeEvents.length,
          retirements: retirementSummary(retirements.retired),
          draft: draftSummary(draft.picks),
        },
        closingRoster,
      });
      console.log(
        `${year}: AVG ${season.battingAverage.toFixed(3)}, ERA ${season.era.toFixed(2)}, ` +
          `HR ${season.homeRuns}, target ${targetEvaluation.passed ? 'PASS' : 'FAIL'} | ` +
          `OVR F ${openingRoster.averageOvr.fielders.toFixed(1)}→${closingRoster.averageOvr.fielders.toFixed(1)}, ` +
          `P ${openingRoster.averageOvr.pitchers.toFixed(1)}→${closingRoster.averageOvr.pitchers.toFixed(1)} | ` +
          `retired ${retirements.retired.length}, drafted ${draft.picks.length}`,
      );
    }
    return {
      schemaVersion: 2,
      source: 'continuous-franchise-diagnostic',
      targets: NPB_SCORING_TARGETS,
      configuration: {
        startYear: options.startYear,
        seasons: options.years,
        seed: options.seed,
        weather: 'disabled to isolate roster and growth drift',
        draftRounds: DRAFT_ROUNDS,
        initialRosterCaps: caps,
        diagnosticRetirementRule: {
          scope: 'script-only; player-facing offseason behavior is unchanged',
          annualRetirementsPerTeam: DRAFT_ROUNDS,
          priorityRules: {
            mandatoryAge: MANDATORY_RETIREMENT_AGE,
            ageAndLowOvr: {
              minimumAge: LOW_OVR_RETIREMENT_AGE,
              maximumOvr: LOW_OVR_RETIREMENT_THRESHOLD,
            },
          },
          minimumRoster: { pitchers: MIN_PITCHERS, fielders: MIN_FIELDERS },
          remainingSlots:
            'After priority retirements, remove the lowest retention-score players until six draft slots are available.',
        },
      },
      investigation: {
        cpuAutomaticRetirementFound: false,
        finding:
          'Production retirement selection exists only in OffseasonScreen for the human-controlled team. The diagnostic applies its own global six-out/six-in replacement rule.',
      },
      summary: driftSummary(years),
      years,
    };
  } finally {
    resetRandom();
  }
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const report = await simulateFranchise(options);
  const outputPath = resolve(options.output);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${options.years}-season franchise drift report to ${outputPath}`);
  if (!report.summary.npbTargetEvaluation.requiredEndpointsPassed) {
    console.error('The first or final franchise season is outside the configured NPB target ranges.');
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
