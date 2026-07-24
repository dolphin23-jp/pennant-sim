import { readFile, writeFile } from 'node:fs/promises';

async function replaceOnce(path, before, after) {
  const source = await readFile(path, 'utf8');
  if (source.includes(after)) return;
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Expected source not found in ${path}`);
  if (source.indexOf(before, index + before.length) >= 0)
    throw new Error(`Expected source is not unique in ${path}`);
  await writeFile(path, source.replace(before, after), 'utf8');
}

await replaceOnce(
  'src/engine/game.ts',
  `      let attemptRate = clamp(((runnerPlayer?.p.sp || 50) - 50) / 400, 0.01, 0.08);`,
  `      let attemptRate = clamp(((runnerPlayer?.p.sp || 50) - 30) / 140, 0.03, 0.35);`,
);

await replaceOnce(
  'scripts/balance-new-engine.ts',
  `    stolenBaseSuccessRate: safeRatio(stolenBases, stolenBases + caughtStealing),
    walkRate: safeRatio(walks, plateAppearances),`,
  `    stolenBaseSuccessRate: safeRatio(stolenBases, stolenBases + caughtStealing),
    stolenBaseAttemptsPerTeamGame: safeRatio(stolenBases + caughtStealing, games * 2),
    walkRate: safeRatio(walks, plateAppearances),`,
);

await replaceOnce(
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
      walkRate: roundSummary(summarize(seasonStats.map((stats) => stats.walkRate)), 6),`,
);

await replaceOnce(
  'scripts/balance-new-engine.ts',
  `      schemaVersion: 2,`,
  `      schemaVersion: 3,`,
);

await replaceOnce(
  'scripts/npb-targets.mjs',
  `  homeRuns: Object.freeze({ minimum: 1000, target: 1096, maximum: 1200 }),`,
  `  homeRuns: Object.freeze({ minimum: 1000, target: 1096, maximum: 1200 }),
  stolenBaseAttemptsPerTeamGame: Object.freeze({ minimum: 0.3, target: 0.45, maximum: 0.6 }),`,
);

await replaceOnce(
  'scripts/npb-targets.mjs',
  `  for (const metric of ['battingAverage', 'era', 'homeRuns']) {`,
  `  for (const metric of Object.keys(NPB_SCORING_TARGETS).filter((key) => key !== 'reference')) {`,
);

console.log('Applied phase 1 balance changes.');
