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
const MAX_AGE_RETIREMENTS_PER_TEAM = 10;

type RosterCaps = Record<TeamKey, { pitchers: number; fielders: number; total: number }>;
type RetirementReason = 'mandatoryAge' | 'ageAndLowOvr' | 'draftRoom';

interface RetirementRecord {
  teamKey: TeamKey;
  playerId: string;
  name: string;
  age: number;
  isPitcher: boolean;
  ovr: number;
  reason: RetirementReason;
}

interface CliOptions {
  startYear: number;
  years: number;
  seed: number;
  output: string;
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
    const nextValue = argv[index + 1];
    if (argument === '--start-year') {
      if (!nextValue) throw new Error(`${argument} requires a value.`);
      options.startYear = parsePositiveInteger(nextValue, argument);
      index += 1;
    } else if (argument === '--years' || argument === '-n') {
      if (!nextValue) throw new Error(`${argument} requires a value.`);
      options.years = parsePositiveInteger(nextValue, argument);
      index += 1;
    } else if (argument === '--seed') {
      if (!nextValue) throw new Error(`${argument} requires a value.`);
      options.seed = parsePositiveInteger(nextValue, argument);
      index += 1;
    } else if (argument === '--output' || argument === '-o') {
      if (!nextValue) throw new Error(`${argument} requires a value.`);
      options.output = nextValue;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

const round = (value: number, digits = 3): number => Number(value.toFixed(digits));
const safeRatio = (numerator: number, denominator: number): number =>
  denominator > 0 ? numerator / denominator : 0;

function mean(values: number[]): number {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function standardDeviation(values: number[]): number {
  if (!values.length) return 0;
  const average = mean(values);
  return Math.sqrt(
    values.reduce((total, value) => total + (value - average) ** 2, 0) / values.length,
  );
}

function playerOvr(player: Player): number {
  return player.isP ? calcOVR(player) : effectiveOVR(player, player.pos);
}

function allTeamKeys(teams: Teams): TeamKey[] {
  return Object.keys(teams) as TeamKey[];
}

function buildRosterCaps(teams: Teams): RosterCaps {
  return Object.fromEntries(
    allTeamKeys(teams).map((teamKey) => {
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
  const teamRows = allTeamKeys(teams).map((teamKey) => {
    const team = teams[teamKey];
    const pitcherOvrs = team.pitchers.map(playerOvr);
    const fielderOvrs = team.fielders.map(playerOvr);
    const allPlayers = [...team.pitchers, ...team.fielders];
    const allOvrs = [...pitcherOvrs, ...fielderOvrs];
    return {
      teamKey,
      players: allPlayers.length,
      pitchers: team.pitchers.length,
      fielders: team.fielders.length,
      averageAge: round(mean(allPlayers.map((player) => player.age)), 2),
      averageOvr: round(mean(allOvrs), 3),
      pitcherOvr: round(mean(pitcherOvrs), 3),
      fielderOvr: round(mean(fielderOvrs), 3),
    };
  });
  const allPitchers = allTeamKeys(teams).flatMap((teamKey) => teams[teamKey].pitchers);
  const allFielders = allTeamKeys(teams).flatMap((teamKey) => teams[teamKey].fielders);
  const allPlayers = [...allPitchers, ...allFielders];
  const teamAverages = teamRows.map((team) => team.averageOvr);
  const weakest = [...teamRows].sort((first, second) => first.averageOvr - second.averageOvr)[0];
  const strongest = [...teamRows].sort((first, second) => second.averageOvr - first.averageOvr)[0];
  return {
    players: allPlayers.length,
    pitchers: allPitchers.length,
    fielders: allFielders.length,
    averageAge: round(mean(allPlayers.map((player) => player.age)), 3),
    oldestAge: Math.max(...allPlayers.map((player) => player.age)),
    averageOvr: {
      overall: round(mean(allPlayers.map(playerOvr)), 3),
      pitchers: round(mean(allPitchers.map(playerOvr)), 3),
      fielders: round(mean(allFielders.map(playerOvr)), 3),
    },
    teamOvrDistribution: {
      minimum: weakest ? { teamKey: weakest.teamKey, value: weakest.averageOvr } : null,
      maximum: strongest ? { teamKey: strongest.teamKey, value: strongest.averageOvr } : null,
      gap: round((strongest?.averageOvr ?? 0) - (weakest?.averageOvr ?? 0), 3),
      standardDeviation: round(standardDeviation(teamAverages), 3),
    },
    teams: teamRows,
  };
}

function sumStats(lines: PlayerStats[], key: string): number {
  return lines.reduce((total, line) => {
    const value = (line as unknown as Record<string, unknown>)[key];
    return total + (typeof value === 'number' ? value : 0);
  }, 0);
}

function seasonSnapshot(accumulatedStats: AccumulatedStats, games: number, totalRuns: number) {
  const lines = Object.values(accumulatedStats);
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
    battingAverage: round(safeRatio(hits, atBats), 6),
    babip: round(safeRatio(hits - homeRuns, atBats - strikeouts - homeRuns), 6),
    era: round(safeRatio(earnedRuns * 27, pitchingOuts), 6),
    homeRuns,
    homeRunsPerGame: round(safeRatio(homeRuns, games), 4),
    runsPerTeamGame: round(safeRatio(totalRuns, games * 2), 4),
    walkRate: round(safeRatio(walks, plateAppearances), 6),
    strikeoutRate: round(safeRatio(strikeouts, plateAppearances), 6),
    stolenBaseSuccessRate: round(
      safeRatio(stolenBases, stolenBases + caughtStealing),
      6,
    ),
  };
}

function retentionScore(player: Player): number {
  return playerOvr(player) - Math.max(0, player.age - 30) * 0.8;
}

function selectAgeRetirements(players: Player[], minimumPlayers: number): Array<{
  player: Player;
  reason: Exclude<RetirementReason, 'draftRoom'>;
}> {
  const candidates = players
    .filter(
      (player) =>
        player.age >= MANDATORY_RETIREMENT_AGE ||
        (player.age >= LOW_OVR_RETIREMENT_AGE &&
          playerOvr(player) <= LOW_OVR_RETIREMENT_THRESHOLD),
    )
    .sort((first, second) => retentionScore(first) - retentionScore(second))
    .slice(0, MAX_AGE_RETIREMENTS_PER_TEAM);
  const maximumRemovals = Math.max(0, players.length - minimumPlayers);
  return candidates.slice(0, maximumRemovals).map((player) => ({
    player,
    reason:
      player.age >= MANDATORY_RETIREMENT_AGE ? 'mandatoryAge' : 'ageAndLowOvr',
  }));
}

function applyDiagnosticRetirements(
  teams: Teams,
  caps: RosterCaps,
  expectedDraftPicksPerTeam: number,
): { teams: Teams; retired: RetirementRecord[] } {
  const nextTeams = { ...teams };
  const retired: RetirementRecord[] = [];
  for (const teamKey of allTeamKeys(teams)) {
    const original = teams[teamKey];
    const agePitchers = selectAgeRetirements(original.pitchers, MIN_PITCHERS);
    const ageFielders = selectAgeRetirements(original.fielders, MIN_FIELDERS);
    const removalReasons = new Map<string, RetirementReason>();
    for (const entry of [...agePitchers, ...ageFielders])
      removalReasons.set(entry.player.id, entry.reason);

    let remainingPitchers = original.pitchers.filter(
      (player) => !removalReasons.has(player.id),
    );
    let remainingFielders = original.fielders.filter(
      (player) => !removalReasons.has(player.id),
    );
    const targetTotal = Math.max(
      MIN_PITCHERS + MIN_FIELDERS,
      caps[teamKey].total - expectedDraftPicksPerTeam,
    );
    const draftRoomCandidates = [...remainingPitchers, ...remainingFielders].sort(
      (first, second) => retentionScore(first) - retentionScore(second),
    );
    for (const player of draftRoomCandidates) {
      if (remainingPitchers.length + remainingFielders.length <= targetTotal) break;
      if (player.isP) {
        if (remainingPitchers.length <= MIN_PITCHERS) continue;
        remainingPitchers = remainingPitchers.filter((candidate) => candidate.id !== player.id);
      } else {
        if (remainingFielders.length <= MIN_FIELDERS) continue;
        remainingFielders = remainingFielders.filter((candidate) => candidate.id !== player.id);
      }
      removalReasons.set(player.id, 'draftRoom');
    }

    for (const player of [...original.pitchers, ...original.fielders]) {
      const reason = removalReasons.get(player.id);
      if (!reason) continue;
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
    nextTeams[teamKey] = {
      ...original,
      pitchers: remainingPitchers,
      fielders: remainingFielders,
    };
  }
  return { teams: nextTeams, retired };
}

function runDraft(teams: Teams, rounds: number): { teams: Teams; picks: DraftPick[] } {
  const order = draftOrder(teams);
  let prospects = generateDraftProspects();
  const picks: DraftPick[] = [];
  for (let roundNumber = 1; roundNumber <= rounds; roundNumber += 1) {
    for (const teamKey of order) {
      const selected = cpuDraftPick(teams[teamKey], prospects);
      if (!selected) break;
      picks.push({ ...selected, teamKey, round: roundNumber });
      prospects = prospects.filter((prospect) => prospect.id !== selected.id);
    }
  }
  return { teams: applyDraftPicks(teams, picks), picks };
}

function retirementSummary(retired: RetirementRecord[]) {
  const reasonCounts: Record<RetirementReason, number> = {
    mandatoryAge: 0,
    ageAndLowOvr: 0,
    draftRoom: 0,
  };
  for (const record of retired) reasonCounts[record.reason] += 1;
  return {
    total: retired.length,
    pitchers: retired.filter((record) => record.isPitcher).length,
    fielders: retired.filter((record) => !record.isPitcher).length,
    averageAge: round(mean(retired.map((record) => record.age)), 2),
    averageOvr: round(mean(retired.map((record) => record.ovr)), 3),
    byReason: reasonCounts,
  };
}

function draftSummary(picks: DraftPick[]) {
  return {
    total: picks.length,
    pitchers: picks.filter((pick) => pick.isP).length,
    fielders: picks.filter((pick) => !pick.isP).length,
    averageAge: round(mean(picks.map((pick) => pick.age)), 2),
    averageOvr: round(mean(picks.map(playerOvr)), 3),
  };
}

function summarizeDrift(years: Array<Record<string, unknown>>) {
  const first = years[0] as {
    year: number;
    openingRoster: ReturnType<typeof rosterSnapshot>;
    season: ReturnType<typeof seasonSnapshot>;
  };
  const last = years[years.length - 1] as {
    year: number;
    closingRoster: ReturnType<typeof rosterSnapshot>;
    season: ReturnType<typeof seasonSnapshot>;
  };
  const largestTeamGap = years
    .map((year) => {
      const row = year as {
        year: number;
        closingRoster: ReturnType<typeof rosterSnapshot>;
      };
      return { year: row.year, value: row.closingRoster.teamOvrDistribution.gap };
    })
    .sort((firstRow, secondRow) => secondRow.value - firstRow.value)[0];
  return {
    firstYear: first.year,
    finalYear: last.year,
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
    largestClosingTeamOvrGap: largestTeamGap,
  };
}

async function simulateFranchise(options: CliOptions) {
  let clock = Date.UTC(options.startYear, 0, 1);
  configureRandom(mulberry32(options.seed), () => clock++);
  try {
    let teams = initTeams();
    const caps = buildRosterCaps(teams);
    const years: Array<Record<string, unknown>> = [];
    for (let seasonIndex = 0; seasonIndex < options.years; seasonIndex += 1) {
      const year = options.startYear + seasonIndex;
      const openingRoster = rosterSnapshot(teams);
      const schedule = generateSchedule(year, { rainoutRate: 0, maxRainouts: 0 });
      const rotations = Object.fromEntries(
        allTeamKeys(teams).map((teamKey) => [teamKey, 0]),
      ) as Record<TeamKey, number>;
      let accumulatedStats: AccumulatedStats = {};
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
          accumulatedStats,
        );
        accumulatedStats = accumulateStatsAll(result, accumulatedStats);
        totalRuns += result.score.home + result.score.away;
        rotations[game.homeKey] += 1;
        rotations[game.awayKey] += 1;
      }
      const season = seasonSnapshot(accumulatedStats, schedule.length, totalRuns);
      const growth = growthPhase(teams);
      const retirements = applyDiagnosticRetirements(
        growth.teams,
        caps,
        DRAFT_ROUNDS,
      );
      const draft = runDraft(retirements.teams, DRAFT_ROUNDS);
      teams = draft.teams;
      const closingRoster = rosterSnapshot(teams);
      years.push({
        year,
        seasonIndex: seasonIndex + 1,
        openingRoster,
        season,
        offseason: {
          awakeningEvents: growth.awakeEvents.length,
          retirements: retirementSummary(retirements.retired),
          draft: draftSummary(draft.picks),
        },
        closingRoster,
      });
      console.log(
        `${year}: AVG ${season.battingAverage.toFixed(3)}, ERA ${season.era.toFixed(2)}, HR ${season.homeRuns} | ` +
          `OVR F ${openingRoster.averageOvr.fielders.toFixed(1)}→${closingRoster.averageOvr.fielders.toFixed(1)}, ` +
          `P ${openingRoster.averageOvr.pitchers.toFixed(1)}→${closingRoster.averageOvr.pitchers.toFixed(1)} | ` +
          `retired ${retirements.retired.length}, drafted ${draft.picks.length}`,
      );
    }
    return {
      schemaVersion: 1,
      source: 'continuous-franchise-diagnostic',
      generatedAt: new Date().toISOString(),
      configuration: {
        startYear: options.startYear,
        seasons: options.years,
        seed: options.seed,
        weather: 'disabled to isolate roster and growth drift',
        draftRounds: DRAFT_ROUNDS,
        initialRosterCaps: caps,
        diagnosticRetirementRule: {
          scope: 'script-only; the player-facing offseason UI is unchanged',
          mandatoryAge: MANDATORY_RETIREMENT_AGE,
          ageAndLowOvr: {
            minimumAge: LOW_OVR_RETIREMENT_AGE,
            maximumOvr: LOW_OVR_RETIREMENT_THRESHOLD,
          },
          maximumAgeBasedRetirementsPerTeam: MAX_AGE_RETIREMENTS_PER_TEAM,
          minimumRoster: { pitchers: MIN_PITCHERS, fielders: MIN_FIELDERS },
          draftRoom:
            'After age-based retirements, remove the lowest retention-score players until six draft slots are available.',
        },
      },
      investigation: {
        cpuAutomaticRetirementFound: false,
        finding:
          'Production retirement selection exists only in OffseasonScreen for the human-controlled team. This diagnostic therefore applies its own global script-only retirement rule.',
      },
      summary: summarizeDrift(years),
      years,
    };
  } finally {
    resetRandom();
  }
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const output = await simulateFranchise(options);
  const outputPath = resolve(options.output);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${options.years}-season franchise drift report to ${outputPath}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
