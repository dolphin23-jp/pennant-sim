import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const DEFAULT_SEASONS = 100;
const DEFAULT_SEED = 20260723;
const DEFAULT_OUTPUT = 'baseline/season-stats.json';
const LEGACY_PATH = resolve('legacy/index.html');
const REQUIRED_EXPORTS = [
  'initTeams',
  'simAB',
  'simHalf',
  'simulateGame',
  'generateSchedule',
  'growPlayer',
  'checkAwakening',
  'accumulateStatsAll',
];

function parsePositiveInteger(value, flagName) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive integer.`);
  }
  return parsed;
}

function parseArguments(argv) {
  const options = {
    seasons: DEFAULT_SEASONS,
    seed: DEFAULT_SEED,
    output: DEFAULT_OUTPUT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const nextValue = argv[index + 1];

    if (argument === '--seasons' || argument === '-n') {
      if (!nextValue) throw new Error(`${argument} requires a value.`);
      options.seasons = parsePositiveInteger(nextValue, argument);
      index += 1;
    } else if (argument === '--seed') {
      if (!nextValue) throw new Error(`${argument} requires a value.`);
      options.seed = parsePositiveInteger(nextValue, argument);
      index += 1;
    } else if (argument === '--output' || argument === '-o') {
      if (!nextValue) throw new Error(`${argument} requires a value.`);
      options.output = nextValue;
      index += 1;
    } else if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/balance-baseline.mjs [options]

Options:
  -n, --seasons <number>  Number of seasons to simulate (default: ${DEFAULT_SEASONS})
      --seed <number>     Base random seed (default: ${DEFAULT_SEED})
  -o, --output <path>     Output JSON path (default: ${DEFAULT_OUTPUT})
  -h, --help              Show this help
`);
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function createSeededMath(seed) {
  const seededMath = Object.create(Math);
  Object.defineProperty(seededMath, 'random', {
    value: mulberry32(seed),
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return seededMath;
}

function createDeterministicDate(seed) {
  const epoch = Date.UTC(2024, 0, 1) + seed * 1_000;
  return class DeterministicDate extends Date {
    static now() {
      return epoch;
    }
  };
}

function extractLegacyLogic(html) {
  const scriptMatch = html.match(/<script\s+type=['"]text\/babel['"]>([\s\S]*?)<\/script>/i);
  if (!scriptMatch) {
    throw new Error('Could not find the Babel script in legacy/index.html.');
  }

  const uiBoundary = scriptMatch[1].indexOf('UI PARTS');
  if (uiBoundary < 0) {
    throw new Error('Could not find the UI PARTS boundary in legacy/index.html.');
  }

  const commentStart = scriptMatch[1].lastIndexOf('/*', uiBoundary);
  if (commentStart < 0) {
    throw new Error('Could not isolate the legacy non-UI logic.');
  }

  return scriptMatch[1].slice(0, commentStart);
}

async function loadLegacyEngine(seed) {
  const html = await readFile(LEGACY_PATH, 'utf8');
  const legacyLogic = extractLegacyLogic(html);
  const exportSource = `
;globalThis.__legacyEngine = {
  initTeams,
  simAB,
  simHalf,
  simulateGame,
  generateSchedule,
  growPlayer,
  checkAwakening,
  accumulateStatsAll,
  resetRuntimeState() {
    accumulatedGlobal = {};
    registerExistingNames({});
  },
};`;

  const context = vm.createContext({
    console,
    Date: createDeterministicDate(seed),
    Math: createSeededMath(seed),
    React: {},
    setTimeout,
    clearTimeout,
  });

  new vm.Script(`${legacyLogic}\n${exportSource}`, {
    filename: 'legacy/index.html',
  }).runInContext(context);

  const engine = context.__legacyEngine;
  for (const exportName of REQUIRED_EXPORTS) {
    if (typeof engine?.[exportName] !== 'function') {
      throw new Error(`Legacy function ${exportName} was not extracted.`);
    }
  }

  engine.resetRuntimeState();
  return engine;
}

function safeRatio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

function finalizeSeason(accumulatedStats, games) {
  const statLines = Object.values(accumulatedStats);
  const battingLines = statLines.filter((line) => line.type === 'bat');
  const pitchingLines = statLines.filter((line) => line.type === 'pit');
  const total = (lines, key) =>
    lines.reduce((sum, line) => sum + (typeof line[key] === 'number' ? line[key] : 0), 0);

  const atBats = total(battingLines, 'ab');
  const hits = total(battingLines, 'h');
  const homeRuns = total(battingLines, 'hr');
  const stolenBases = total(battingLines, 'sb');
  const caughtStealing = total(battingLines, 'cs');
  const walks = total(battingLines, 'bb');
  const plateAppearances = total(battingLines, 'pa');
  const earnedRuns = total(pitchingLines, 'er');
  const pitchingOuts = total(pitchingLines, 'ip3');

  return {
    games,
    battingAverage: safeRatio(hits, atBats),
    era: safeRatio(earnedRuns * 27, pitchingOuts),
    homeRuns,
    stolenBaseSuccessRate: safeRatio(stolenBases, stolenBases + caughtStealing),
    walkRate: safeRatio(walks, plateAppearances),
  };
}

async function simulateSeason(seasonIndex, baseSeed) {
  const engine = await loadLegacyEngine(baseSeed + seasonIndex);
  const teams = engine.initTeams();
  const schedule = engine.generateSchedule(2024 + seasonIndex);
  const rotations = Object.fromEntries(Object.keys(teams).map((teamKey) => [teamKey, 0]));
  let accumulatedStats = {};

  for (const game of schedule) {
    const result = engine.simulateGame(
      game.homeKey,
      game.awayKey,
      teams,
      null,
      null,
      rotations[game.homeKey],
      rotations[game.awayKey],
    );

    accumulatedStats = engine.accumulateStatsAll(result, accumulatedStats);

    rotations[game.homeKey] += 1;
    rotations[game.awayKey] += 1;
  }

  return finalizeSeason(accumulatedStats, schedule.length);
}

function summarize(values) {
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const variance =
    values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;
  return { mean, standardDeviation: Math.sqrt(variance) };
}

function roundSummary(summary, digits) {
  return Object.fromEntries(
    Object.entries(summary).map(([key, value]) => [key, Number(value.toFixed(digits))]),
  );
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const seasonStats = [];
  for (let seasonIndex = 0; seasonIndex < options.seasons; seasonIndex += 1) {
    const stats = await simulateSeason(seasonIndex, options.seed);
    seasonStats.push(stats);
    console.log(
      `Season ${seasonIndex + 1}/${options.seasons}: AVG ${stats.battingAverage.toFixed(3)}, ERA ${stats.era.toFixed(2)}, HR ${stats.homeRuns}`,
    );
  }

  const output = {
    schemaVersion: 1,
    source: 'legacy/index.html',
    seasons: options.seasons,
    seed: options.seed,
    definitions: {
      battingAverage: 'hits / at-bats',
      era: 'earned runs * 27 / pitching outs',
      homeRuns: 'league-wide total per season',
      stolenBaseSuccessRate: 'stolen bases / (stolen bases + caught stealing)',
      walkRate: 'walks / plate appearances',
      standardDeviation: 'population standard deviation across simulated seasons',
    },
    summary: {
      battingAverage: roundSummary(
        summarize(seasonStats.map((stats) => stats.battingAverage)),
        6,
      ),
      era: roundSummary(summarize(seasonStats.map((stats) => stats.era)), 6),
      homeRuns: roundSummary(summarize(seasonStats.map((stats) => stats.homeRuns)), 3),
      stolenBaseSuccessRate: roundSummary(
        summarize(seasonStats.map((stats) => stats.stolenBaseSuccessRate)),
        6,
      ),
      walkRate: roundSummary(summarize(seasonStats.map((stats) => stats.walkRate)), 6),
    },
    seasonStats: seasonStats.map((stats, index) => ({
      season: index + 1,
      ...Object.fromEntries(
        Object.entries(stats).map(([key, value]) => [
          key,
          typeof value === 'number'
            ? Number(value.toFixed(key === 'homeRuns' || key === 'games' ? 0 : 6))
            : value,
        ]),
      ),
    })),
  };

  const outputPath = resolve(options.output);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${options.seasons}-season baseline to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
