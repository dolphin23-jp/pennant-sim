import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { PLAYER_DEVELOPMENT_BALANCE } from '../src/data';
import {
  accumulateStatsAll,
  configureRandom,
  generateSchedule,
  growthPhase,
  initTeams,
  resetRandom,
  simulateGame,
  type AccumulatedStats,
  type TeamKey,
} from '../src/engine';

const SEASONS = 20;
const BASE_SEED = 20260725;
const OUTPUT = 'baseline/player-event-frequency.json';

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

function summarize(values: number[]) {
  const mean = values.reduce((total, value) => total + value, 0) / values.length,
    variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;
  return {
    mean: Number(mean.toFixed(3)),
    minimum: Math.min(...values),
    maximum: Math.max(...values),
    standardDeviation: Number(Math.sqrt(variance).toFixed(3)),
  };
}

async function main() {
  const reports = [];
  for (let seasonIndex = 0; seasonIndex < SEASONS; seasonIndex += 1) {
    const seed = BASE_SEED + seasonIndex;
    configureRandom(mulberry32(seed), () => Date.UTC(2026, 0, 1) + seed * 1000);
    try {
      const teams = initTeams(),
        schedule = generateSchedule(2026 + seasonIndex, { rainoutRate: 0, maxRainouts: 0 }),
        rotations = Object.fromEntries(Object.keys(teams).map((key) => [key, 0])) as Record<
          TeamKey,
          number
        >;
      let accumulated: AccumulatedStats = {};
      const inSeasonAwakenings = new Set<string>(),
        newSpecials = new Set<string>();
      const injuries = { light: 0, mid: 0, heavy: 0 };
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
        rotations[game.homeKey] += 1;
        rotations[game.awayKey] += 1;
        for (const event of result.postGameEvents.awakenings) {
          inSeasonAwakenings.add(event.playerId);
          if (event.newSpecial) newSpecials.add(event.playerId);
        }
        for (const event of result.postGameEvents.injuries) injuries[event.severity] += 1;
      }
      const offseason = growthPhase(teams);
      reports.push({
        season: seasonIndex + 1,
        inSeasonAwakenings: inSeasonAwakenings.size,
        offseasonAwakenings: offseason.awakeEvents.length,
        totalAwakenings: inSeasonAwakenings.size + offseason.awakeEvents.length,
        newSpecials: newSpecials.size,
        injuries,
        totalInjuries: injuries.light + injuries.mid + injuries.heavy,
      });
    } finally {
      resetRandom();
    }
  }
  const output = {
    schemaVersion: 1,
    seasons: SEASONS,
    baseSeed: BASE_SEED,
    configuredBalance: PLAYER_DEVELOPMENT_BALANCE,
    summary: {
      inSeasonAwakenings: summarize(reports.map((report) => report.inSeasonAwakenings)),
      offseasonAwakenings: summarize(reports.map((report) => report.offseasonAwakenings)),
      totalAwakenings: summarize(reports.map((report) => report.totalAwakenings)),
      newSpecials: summarize(reports.map((report) => report.newSpecials)),
      injuries: summarize(reports.map((report) => report.totalInjuries)),
      lightInjuries: summarize(reports.map((report) => report.injuries.light)),
      midInjuries: summarize(reports.map((report) => report.injuries.mid)),
      heavyInjuries: summarize(reports.map((report) => report.injuries.heavy)),
    },
    reports,
  };
  const outputPath = resolve(OUTPUT);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(output.summary, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
