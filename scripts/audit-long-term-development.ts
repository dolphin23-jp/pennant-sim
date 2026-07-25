import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

import {
  calcOVR,
  configureRandom,
  effectiveOVR,
  initTeams,
  resetRandom,
  runAutomatedOffseason,
  type DraftOrigin,
  type Maturity,
  type Player,
  type TeamKey,
  type Teams,
} from '../src/engine/index';

const MATURITIES: Maturity[] = ['超早熟', '早熟', '通常', '晩成', '超晩成'];
const DEFAULT_YEARS = 30;
const DEFAULT_SEEDS = [55, 551, 5501, 55001, 550001];
const DEFAULT_OUTPUT = 'baseline/long-term-development.json';

interface AuditOptions {
  years?: number;
  seeds?: number[];
  startYear?: number;
}

interface CohortRecord {
  playerId: string;
  draftYear: number;
  draftAge: number;
  draftOrigin?: DraftOrigin;
  maturity: Maturity;
  peakAge: number;
  maximumOvr: number;
  activeSeasons: number;
  lastSeenSeason: number;
}

interface DevelopmentRun {
  seed: number;
  years: ReturnType<typeof rosterSnapshot>[];
  decline: Record<'age35' | 'age38' | 'age40', ReturnType<typeof summarize>>;
  draftCohorts: {
    eligiblePlayers: number;
    byMaturity: Record<Maturity, ReturnType<typeof cohortSummary>>;
    byDraftYear: Array<ReturnType<typeof draftYearSummary>>;
  };
}

const round = (value: number, digits = 3): number => Number(value.toFixed(digits));
const average = (values: number[]): number =>
  values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;

function summarize(values: number[]) {
  const mean = average(values);
  return {
    samples: values.length,
    mean: round(mean),
    minimum: values.length ? round(Math.min(...values)) : 0,
    maximum: values.length ? round(Math.max(...values)) : 0,
  };
}

function aggregateSummaries(rows: Array<ReturnType<typeof summarize>>) {
  const samples = rows.reduce((total, row) => total + row.samples, 0);
  return {
    samples,
    mean: round(
      rows.reduce((total, row) => total + row.mean * row.samples, 0) / Math.max(1, samples),
    ),
    minimum: round(Math.min(...rows.map((row) => row.minimum))),
    maximum: round(Math.max(...rows.map((row) => row.maximum))),
  };
}

function percentile(values: number[], position: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((first, second) => first - second);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * position))] ?? 0;
}

function playerOvr(player: Player): number {
  return player.isP ? calcOVR(player) : effectiveOVR(player, player.pos);
}

function allPlayers(teams: Teams): Player[] {
  return Object.values(teams).flatMap((team) => [...team.pitchers, ...team.fielders]);
}

function firstTeamEquivalent(teams: Teams): Player[] {
  return (Object.keys(teams) as TeamKey[]).flatMap((teamKey) => {
    const team = teams[teamKey];
    return [
      ...[...team.pitchers].sort((a, b) => playerOvr(b) - playerOvr(a)).slice(0, 14),
      ...[...team.fielders].sort((a, b) => playerOvr(b) - playerOvr(a)).slice(0, 15),
    ];
  });
}

function ageComposition(players: Player[]) {
  return {
    young24AndUnder: players.filter((player) => player.age <= 24).length,
    prime25To32: players.filter((player) => player.age >= 25 && player.age <= 32).length,
    veteran33AndOver: players.filter((player) => player.age >= 33).length,
  };
}

function maturitySnapshot(players: Player[], maturity: Maturity) {
  const members = players.filter((player) => player.mat === maturity);
  const values = members.map(playerOvr);
  return {
    players: members.length,
    averageAge: round(average(members.map((player) => player.age)), 2),
    averageOvr: round(average(values)),
    top10PercentOvr: percentile(values, 0.9),
    ovr100Plus: values.filter((value) => value >= 100).length,
  };
}

function rosterSnapshot(teams: Teams, seasonIndex: number) {
  const players = allPlayers(teams);
  const values = players.map(playerOvr);
  const firstTeam = firstTeamEquivalent(teams);
  return {
    seasonIndex,
    players: players.length,
    averageAge: round(average(players.map((player) => player.age)), 2),
    averageOvr: round(average(values)),
    top10PercentOvr: percentile(values, 0.9),
    ovr85Plus: values.filter((value) => value >= 85).length,
    ovr100Plus: values.filter((value) => value >= 100).length,
    ageComposition: ageComposition(players),
    firstTeamEquivalent: {
      players: firstTeam.length,
      ...ageComposition(firstTeam),
    },
    maturity: Object.fromEntries(
      MATURITIES.map((maturity) => [maturity, maturitySnapshot(players, maturity)]),
    ) as Record<Maturity, ReturnType<typeof maturitySnapshot>>,
  };
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

function updateCohorts(
  cohorts: Map<string, CohortRecord>,
  teams: Teams,
  seasonIndex: number,
): void {
  for (const player of allPlayers(teams)) {
    const cohort = cohorts.get(player.id);
    if (!cohort) continue;
    const overall = playerOvr(player);
    if (overall > cohort.maximumOvr) {
      cohort.maximumOvr = overall;
      cohort.peakAge = player.age;
    }
    if (cohort.lastSeenSeason !== seasonIndex) {
      cohort.activeSeasons += 1;
      cohort.lastSeenSeason = seasonIndex;
    }
  }
}

function cohortSummary(records: CohortRecord[]) {
  return {
    players: records.length,
    averageDraftAge: round(average(records.map((record) => record.draftAge)), 2),
    averagePeakAge: round(average(records.map((record) => record.peakAge)), 2),
    averageMaximumOvr: round(average(records.map((record) => record.maximumOvr))),
    averageActiveSeasons: round(average(records.map((record) => record.activeSeasons)), 2),
    ovr85PlusRate: round(
      records.filter((record) => record.maximumOvr >= 85).length / Math.max(1, records.length),
      4,
    ),
    ovr100PlusRate: round(
      records.filter((record) => record.maximumOvr >= 100).length / Math.max(1, records.length),
      4,
    ),
  };
}

function draftYearSummary(draftYear: number, records: CohortRecord[]) {
  return {
    draftYear,
    ...cohortSummary(records),
  };
}

function simulateDevelopmentRun(seed: number, years: number, startYear: number): DevelopmentRun {
  let clock = Date.UTC(startYear, 0, 1);
  configureRandom(mulberry32(seed), () => clock++);
  try {
    let teams = initTeams();
    const yearly: ReturnType<typeof rosterSnapshot>[] = [];
    const cohorts = new Map<string, CohortRecord>();
    const declineSamples = {
      age35: [] as number[],
      age38: [] as number[],
      age40: [] as number[],
    };

    for (let seasonIndex = 0; seasonIndex < years; seasonIndex += 1) {
      updateCohorts(cohorts, teams, seasonIndex);
      yearly.push(rosterSnapshot(teams, seasonIndex));
      const beforeGrowth = new Map(
        allPlayers(teams).map((player) => [
          player.id,
          { age: player.age, overall: playerOvr(player) },
        ]),
      );
      const offseason = runAutomatedOffseason(teams, {
        year: startYear + seasonIndex,
        draftRounds: 6,
      });
      for (const player of allPlayers(offseason.growthTeams)) {
        const before = beforeGrowth.get(player.id);
        if (!before) continue;
        const delta = playerOvr(player) - before.overall;
        if (before.age === 35) declineSamples.age35.push(delta);
        else if (before.age === 38) declineSamples.age38.push(delta);
        else if (before.age === 40) declineSamples.age40.push(delta);
      }
      for (const pick of offseason.draftPicks) {
        const overall = playerOvr(pick);
        cohorts.set(pick.id, {
          playerId: pick.id,
          draftYear: startYear + seasonIndex,
          draftAge: pick.age,
          draftOrigin: pick.draftOrigin,
          maturity: pick.mat,
          peakAge: pick.age,
          maximumOvr: overall,
          activeSeasons: 1,
          lastSeenSeason: seasonIndex + 1,
        });
      }
      teams = offseason.teams;
    }
    updateCohorts(cohorts, teams, years);
    yearly.push(rosterSnapshot(teams, years));

    const minimumObservationSeasons = 12;
    const eligible = [...cohorts.values()].filter(
      (record) => record.draftYear <= startYear + years - minimumObservationSeasons,
    );
    const draftYears = [...new Set(eligible.map((record) => record.draftYear))].sort(
      (first, second) => first - second,
    );
    return {
      seed,
      years: yearly,
      decline: {
        age35: summarize(declineSamples.age35),
        age38: summarize(declineSamples.age38),
        age40: summarize(declineSamples.age40),
      },
      draftCohorts: {
        eligiblePlayers: eligible.length,
        byMaturity: Object.fromEntries(
          MATURITIES.map((maturity) => [
            maturity,
            cohortSummary(eligible.filter((record) => record.maturity === maturity)),
          ]),
        ) as Record<Maturity, ReturnType<typeof cohortSummary>>,
        byDraftYear: draftYears.map((draftYear) =>
          draftYearSummary(
            draftYear,
            eligible.filter((record) => record.draftYear === draftYear),
          ),
        ),
      },
    };
  } finally {
    resetRandom();
  }
}

function aggregateYear(runs: DevelopmentRun[], seasonIndex: number) {
  const rows = runs.map((run) => run.years[seasonIndex]).filter(Boolean);
  const firstTeam = rows.map((row) => row.firstTeamEquivalent);
  return {
    seasonIndex,
    averageOvr: round(average(rows.map((row) => row.averageOvr))),
    top10PercentOvr: round(average(rows.map((row) => row.top10PercentOvr))),
    ovr85Plus: round(average(rows.map((row) => row.ovr85Plus))),
    ovr100Plus: round(average(rows.map((row) => row.ovr100Plus))),
    firstTeamEquivalent: {
      young24AndUnder: round(average(firstTeam.map((row) => row.young24AndUnder))),
      prime25To32: round(average(firstTeam.map((row) => row.prime25To32))),
      veteran33AndOver: round(average(firstTeam.map((row) => row.veteran33AndOver))),
    },
  };
}

function aggregateMaturity(runs: DevelopmentRun[], maturity: Maturity) {
  const summaries = runs.map((run) => run.draftCohorts.byMaturity[maturity]);
  return {
    averagePeakAge: round(average(summaries.map((summary) => summary.averagePeakAge)), 2),
    averageMaximumOvr: round(average(summaries.map((summary) => summary.averageMaximumOvr))),
    averageActiveSeasons: round(
      average(summaries.map((summary) => summary.averageActiveSeasons)),
      2,
    ),
    ovr100PlusRate: round(average(summaries.map((summary) => summary.ovr100PlusRate)), 4),
  };
}

function auditWarnings(
  decline: Record<'age35' | 'age38' | 'age40', ReturnType<typeof summarize>>,
  maturity: Record<Maturity, ReturnType<typeof aggregateMaturity>>,
  yearly: ReturnType<typeof aggregateYear>[],
): string[] {
  const warnings: string[] = [];
  if (!(decline.age35.mean > decline.age38.mean && decline.age38.mean > decline.age40.mean))
    warnings.push('35歳、38歳、40歳の順に平均OVR低下が加速していません。');
  if (maturity.超晩成.averagePeakAge - maturity.超早熟.averagePeakAge < 4.5)
    warnings.push('超早熟と超晩成の平均ピーク年齢差が4.5年未満です。');

  const stableYears = yearly.filter((year) => year.seasonIndex >= 10);
  const starCounts = stableYears.map((year) => year.ovr100Plus);
  if (Math.min(...starCounts) < 7.5)
    warnings.push('定着期のOVR100以上が平均7.5人未満となる年があります。');
  if (Math.max(...starCounts) > 60)
    warnings.push('定着期にOVR100以上が60人を超え、名選手が蓄積しています。');
  const final = yearly.at(-1);
  if (!final || final.top10PercentOvr < 68 || final.top10PercentOvr > 105)
    warnings.push('最終年の上位10%境界が安定範囲（68〜105）外です。');
  if (
    !final ||
    final.firstTeamEquivalent.young24AndUnder < 25 ||
    final.firstTeamEquivalent.veteran33AndOver < 20
  )
    warnings.push('一軍相当層の若手・ベテラン構成が一方に偏っています。');
  return warnings;
}

export function runLongTermDevelopmentAudit(options: AuditOptions = {}) {
  const years = options.years ?? DEFAULT_YEARS;
  const seeds = options.seeds ?? DEFAULT_SEEDS;
  const startYear = options.startYear ?? 2026;
  const runs = seeds.map((seed) => simulateDevelopmentRun(seed, years, startYear));
  const yearly = Array.from({ length: years + 1 }, (_, index) => aggregateYear(runs, index));
  const decline = {
    age35: aggregateSummaries(runs.map((run) => run.decline.age35)),
    age38: aggregateSummaries(runs.map((run) => run.decline.age38)),
    age40: aggregateSummaries(runs.map((run) => run.decline.age40)),
  };
  const maturity = Object.fromEntries(
    MATURITIES.map((type) => [type, aggregateMaturity(runs, type)]),
  ) as Record<Maturity, ReturnType<typeof aggregateMaturity>>;
  const warnings = auditWarnings(decline, maturity, yearly);
  return {
    schemaVersion: 1,
    source: 'production-offseason-multi-seed-development-audit',
    configuration: {
      startYear,
      years,
      seeds,
      draftRounds: 6,
      fixedOvrCap: false,
      fixedStarQuota: false,
      firstTeamEquivalentDefinition: '各球団のOVR上位投手14人・野手15人',
      minimumDraftCohortObservationSeasons: 12,
    },
    summary: {
      passed: warnings.length === 0,
      warnings,
      decline,
      maturity,
      opening: yearly[0],
      year10: yearly[Math.min(10, years)],
      final: yearly.at(-1),
      stableOvr100Range: {
        minimum: round(
          Math.min(...yearly.slice(Math.min(10, years)).map((year) => year.ovr100Plus)),
        ),
        maximum: round(
          Math.max(...yearly.slice(Math.min(10, years)).map((year) => year.ovr100Plus)),
        ),
      },
    },
    yearly,
    runs,
  };
}

function parseArguments(argv: string[]) {
  let years = DEFAULT_YEARS;
  let output = DEFAULT_OUTPUT;
  let strict = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];
    if (argument === '--years') {
      years = Number(next);
      index += 1;
    } else if (argument === '--output') {
      output = String(next);
      index += 1;
    } else if (argument === '--strict') strict = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!Number.isSafeInteger(years) || years < 20)
    throw new Error('--years must be an integer of at least 20.');
  return { years, output, strict };
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const report = runLongTermDevelopmentAudit({ years: options.years });
  const outputPath = resolve(options.output);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`Wrote long-term development audit to ${outputPath}`);
  if (options.strict && !report.summary.passed) process.exitCode = 1;
}

const entryPoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === entryPoint)
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
