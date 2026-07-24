import { readFile, writeFile } from 'node:fs/promises';

async function replaceOnce(path, before, after) {
  const source = await readFile(path, 'utf8');
  if (source.includes(after)) return false;
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Could not find expected source in ${path}: ${before.slice(0, 100)}`);
  if (source.indexOf(before, first + before.length) >= 0)
    throw new Error(`Expected source is not unique in ${path}: ${before.slice(0, 100)}`);
  await writeFile(path, source.replace(before, after), 'utf8');
  return true;
}

const changed = [];
async function patch(path, before, after) {
  if (await replaceOnce(path, before, after)) changed.push(path);
}

await patch(
  'scripts/balance-new-engine.ts',
  `  accumulateStatsAll,
  configureRandom,`,
  `  accumulateStatsAll,
  calcOVR,
  configureRandom,`,
);
await patch(
  'scripts/balance-new-engine.ts',
  `  type PlayerStats,
  type TeamKey,`,
  `  type Player,
  type PlayerParams,
  type PlayerStats,
  type TeamKey,
  type Teams,`,
);
await patch(
  'scripts/balance-new-engine.ts',
  `const safeRatio = (numerator: number, denominator: number): number =>
  denominator > 0 ? numerator / denominator : 0;
function finalizeSeason(accumulatedStats: AccumulatedStats, games: number) {`,
  `const safeRatio = (numerator: number, denominator: number): number =>
  denominator > 0 ? numerator / denominator : 0;
function populationStandardDeviation(values: number[]): number {
  if (!values.length) return 0;
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  return Math.sqrt(values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length);
}
function percentile(values: number[], fraction: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((first, second) => first - second),
    index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index] as number;
}
function numericStat(line: PlayerStats | undefined, key: string): number {
  const value = (line as unknown as Record<string, unknown> | undefined)?.[key];
  return typeof value === 'number' ? value : 0;
}
function pearsonCorrelation(pairs: Array<{ x: number; y: number }>): number {
  if (pairs.length < 2) return 0;
  const xMean = pairs.reduce((sum, pair) => sum + pair.x, 0) / pairs.length,
    yMean = pairs.reduce((sum, pair) => sum + pair.y, 0) / pairs.length,
    numerator = pairs.reduce((sum, pair) => sum + (pair.x - xMean) * (pair.y - yMean), 0),
    xVariance = pairs.reduce((sum, pair) => sum + (pair.x - xMean) ** 2, 0),
    yVariance = pairs.reduce((sum, pair) => sum + (pair.y - yMean) ** 2, 0);
  return xVariance > 0 && yVariance > 0 ? numerator / Math.sqrt(xVariance * yVariance) : 0;
}
function awakeningPotentialGap(player: Player): number {
  const parameters: Array<keyof PlayerParams> = player.isP
    ? ['vel', 'ctrl', 'stam', 'nobi', 'fld']
    : [
        'cf',
        'cb',
        'pw',
        'dc',
        'sp',
        'df',
        'arm',
        ...(player.pos === '捕手' ? (['ld'] as Array<keyof PlayerParams>) : []),
      ];
  return Math.max(
    0,
    ...parameters.map(
      (parameter) =>
        Number(player.pot?.[parameter] ?? player.p?.[parameter] ?? 50) -
        Number(player.p?.[parameter] ?? 50),
    ),
  );
}
function rosterMetrics(teams: Teams) {
  const batters = Object.values(teams).flatMap((team) => team.fielders),
    pitchers = Object.values(teams).flatMap((team) => team.pitchers),
    allPlayers = [...batters, ...pitchers],
    batterOvrs = batters.map((player) => calcOVR(player, player.pos)),
    pitcherOvrs = pitchers.map((player) => calcOVR(player));
  return {
    batterOvrStandardDeviation: populationStandardDeviation(batterOvrs),
    pitcherOvrStandardDeviation: populationStandardDeviation(pitcherOvrs),
    batterOvrTop1Percent: percentile(batterOvrs, 0.99),
    batterOvrTop5Percent: percentile(batterOvrs, 0.95),
    pitcherOvrTop1Percent: percentile(pitcherOvrs, 0.99),
    pitcherOvrTop5Percent: percentile(pitcherOvrs, 0.95),
    batterOvr85PlusCount: batterOvrs.filter((overall) => overall >= 85).length,
    pitcherOvr85PlusCount: pitcherOvrs.filter((overall) => overall >= 85).length,
    latentFactorMaximumRate: safeRatio(
      allPlayers.filter((player) => awakeningPotentialGap(player) >= 20).length,
      allPlayers.length,
    ),
  };
}
function finalizeSeason(accumulatedStats: AccumulatedStats, games: number, teams: Teams) {`,
);
await patch(
  'scripts/balance-new-engine.ts',
  `    pitchingOuts = sumStats(pitching, 'ip3');
  return {
    games,
    battingAverage: safeRatio(hits, atBats),
    era: safeRatio(earnedRuns * 27, pitchingOuts),
    homeRuns,
    stolenBaseSuccessRate: safeRatio(stolenBases, stolenBases + caughtStealing),
    walkRate: safeRatio(walks, plateAppearances),
  };`,
  `    pitchingOuts = sumStats(pitching, 'ip3'),
    playerById = new Map(
      Object.values(teams)
        .flatMap((team) => team.fielders)
        .map((player) => [player.id, player]),
    ),
    battingById = new Map(batting.map((line) => [line.id, line])),
    speedStolenBasePairs = [...playerById.values()]
      .map((player) => ({
        x: player.p.sp ?? 50,
        y: numericStat(battingById.get(player.id), 'sb'),
        pa: numericStat(battingById.get(player.id), 'pa'),
      }))
      .filter((pair) => pair.pa >= 50)
      .map(({ x, y }) => ({ x, y }));
  return {
    games,
    battingAverage: safeRatio(hits, atBats),
    era: safeRatio(earnedRuns * 27, pitchingOuts),
    homeRuns,
    stolenBaseSuccessRate: safeRatio(stolenBases, stolenBases + caughtStealing),
    stolenBaseAttemptsPerTeamGame: safeRatio(stolenBases + caughtStealing, games * 2),
    speedStolenBaseCorrelation: pearsonCorrelation(speedStolenBasePairs),
    walkRate: safeRatio(walks, plateAppearances),
    ...rosterMetrics(teams),
  };`,
);
await patch(
  'scripts/balance-new-engine.ts',
  `  return finalizeSeason(accumulatedStats, schedule.length);`,
  `  return finalizeSeason(accumulatedStats, schedule.length, teams);`,
);
await patch(
  'scripts/balance-new-engine.ts',
  `      stolenBaseSuccessRate: roundSummary(
        summarize(seasonStats.map((stats) => stats.stolenBaseSuccessRate)),
        6,
      ),
      walkRate: roundSummary(summarize(seasonStats.map((stats) => stats.walkRate)), 6),`,
  `      stolenBaseSuccessRate: roundSummary(
        summarize(seasonStats.map((stats) => stats.stolenBaseSuccessRate)),
        6,
      ),
      stolenBaseAttemptsPerTeamGame: roundSummary(
        summarize(seasonStats.map((stats) => stats.stolenBaseAttemptsPerTeamGame)),
        6,
      ),
      speedStolenBaseCorrelation: roundSummary(
        summarize(seasonStats.map((stats) => stats.speedStolenBaseCorrelation)),
        6,
      ),
      walkRate: roundSummary(summarize(seasonStats.map((stats) => stats.walkRate)), 6),
      batterOvrStandardDeviation: roundSummary(
        summarize(seasonStats.map((stats) => stats.batterOvrStandardDeviation)),
        6,
      ),
      pitcherOvrStandardDeviation: roundSummary(
        summarize(seasonStats.map((stats) => stats.pitcherOvrStandardDeviation)),
        6,
      ),
      batterOvrTop1Percent: roundSummary(
        summarize(seasonStats.map((stats) => stats.batterOvrTop1Percent)),
        3,
      ),
      batterOvrTop5Percent: roundSummary(
        summarize(seasonStats.map((stats) => stats.batterOvrTop5Percent)),
        3,
      ),
      pitcherOvrTop1Percent: roundSummary(
        summarize(seasonStats.map((stats) => stats.pitcherOvrTop1Percent)),
        3,
      ),
      pitcherOvrTop5Percent: roundSummary(
        summarize(seasonStats.map((stats) => stats.pitcherOvrTop5Percent)),
        3,
      ),
      batterOvr85PlusCount: roundSummary(
        summarize(seasonStats.map((stats) => stats.batterOvr85PlusCount)),
        3,
      ),
      pitcherOvr85PlusCount: roundSummary(
        summarize(seasonStats.map((stats) => stats.pitcherOvr85PlusCount)),
        3,
      ),
      latentFactorMaximumRate: roundSummary(
        summarize(seasonStats.map((stats) => stats.latentFactorMaximumRate)),
        6,
      ),`,
);
await patch(
  'scripts/balance-new-engine.ts',
  `      schemaVersion: 2,
      source: 'src/engine',`,
  `      schemaVersion: 3,
      source: 'src/engine',`,
);
await patch(
  'scripts/balance-new-engine.ts',
  `      seed: options.seed,
      targets: NPB_SCORING_TARGETS,`,
  `      seed: options.seed,
      definitions: {
        battingAverage: 'hits / at-bats',
        era: 'earned runs * 27 / pitching outs',
        homeRuns: 'league-wide total per season',
        stolenBaseSuccessRate: 'stolen bases / (stolen bases + caught stealing)',
        stolenBaseAttemptsPerTeamGame: '(stolen bases + caught stealing) / (games * 2)',
        speedStolenBaseCorrelation: 'Pearson correlation between player speed and seasonal stolen bases',
        batterOvrStandardDeviation: 'population standard deviation of initial batter OVR',
        pitcherOvrStandardDeviation: 'population standard deviation of initial pitcher OVR',
        batterOvrTop1Percent: '99th percentile threshold of initial batter OVR',
        batterOvrTop5Percent: '95th percentile threshold of initial batter OVR',
        pitcherOvrTop1Percent: '99th percentile threshold of initial pitcher OVR',
        pitcherOvrTop5Percent: '95th percentile threshold of initial pitcher OVR',
        batterOvr85PlusCount: 'league-wide initial batters with OVR at least 85',
        pitcherOvr85PlusCount: 'league-wide initial pitchers with OVR at least 85',
        latentFactorMaximumRate: 'share of initial players with awakening potential gap at least 20',
      },
      targets: NPB_SCORING_TARGETS,`,
);

console.log(`Patched ${[...new Set(changed)].join(', ')}`);
