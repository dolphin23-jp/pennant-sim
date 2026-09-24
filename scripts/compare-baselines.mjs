import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { evaluateNpbScoringTargets, NPB_SCORING_TARGETS } from './npb-targets.mjs';

// Run by `npm run baseline:compare` right after `baseline:new` regenerates
// baseline/new-season-stats.json from the current engine. That file is a build product
// (git-ignored), so this comparison always measures the engine being tested.
const EXPECTED_SEASONS = 100;
const EXPECTED_SEED = 20260723;
// Metrics the balance run must keep reporting; dropping one would silently stop gating it.
const REQUIRED_METRICS = [
  'battingAverage',
  'era',
  'homeRuns',
  'stolenBaseSuccessRate',
  'stolenBaseAttemptsPerTeamGame',
  'walkRate',
  'batterOvrStandardDeviation',
  'pitcherOvrStandardDeviation',
  'batterOvrTop1Percent',
  'batterOvrTop5Percent',
  'pitcherOvrTop1Percent',
  'pitcherOvrTop5Percent',
  'batterOvr85PlusCount',
  'pitcherOvr85PlusCount',
  'averageTeamOvr85PlusCount',
  'minimumTeamOvr85PlusCount',
  'latentFactorMaximumRate',
  'potentialGap40PlusRate',
  'meanMaximumPotentialGap',
  'meanAveragePotentialGap',
  'elitePotentialRate',
];

const baseline = JSON.parse(await readFile('baseline/season-stats.json', 'utf8')),
  current = JSON.parse(await readFile('baseline/new-season-stats.json', 'utf8')),
  tolerance = 0.02,
  comparison = {},
  problems = [];

for (const [name, file] of [
  ['recorded baseline', baseline],
  ['current run', current],
]) {
  if (file.seasons !== EXPECTED_SEASONS)
    problems.push(`${name} covers ${file.seasons} seasons, expected ${EXPECTED_SEASONS}`);
  if (file.seed !== EXPECTED_SEED)
    problems.push(`${name} used seed ${file.seed}, expected ${EXPECTED_SEED}`);
}
for (const metric of REQUIRED_METRICS)
  if (!baseline.summary[metric]) problems.push(`recorded baseline is missing ${metric}`);

for (const metric of Object.keys(baseline.summary)) {
  const expectedMetric = baseline.summary[metric],
    actualMetric = current.summary[metric];
  if (!actualMetric) {
    problems.push(`current run is missing ${metric}`);
    continue;
  }
  comparison[metric] = {};
  for (const statistic of ['mean', 'standardDeviation']) {
    const expected = expectedMetric[statistic],
      actual = actualMetric[statistic],
      relativeDifference =
        expected === 0
          ? Math.abs(actual - expected)
          : Math.abs(actual - expected) / Math.abs(expected),
      passed = relativeDifference <= tolerance;
    comparison[metric][statistic] = { expected, actual, relativeDifference, passed };
    if (!passed) problems.push(`${metric} ${statistic} differs by more than 2%`);
  }
}
const targetEvaluation = evaluateNpbScoringTargets(current.summary);
if (!targetEvaluation.passed) problems.push('an NPB scoring target is out of range');
console.log(
  JSON.stringify(
    { tolerance, npbTargets: NPB_SCORING_TARGETS, targetEvaluation, comparison, problems },
    null,
    2,
  ),
);
if (problems.length) {
  console.error(
    `Balance comparison failed:\n${problems.map((problem) => `- ${problem}`).join('\n')}`,
  );
  process.exitCode = 1;
}
