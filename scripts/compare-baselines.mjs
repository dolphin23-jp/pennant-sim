import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { evaluateNpbScoringTargets, NPB_SCORING_TARGETS } from './npb-targets.mjs';

const baseline = JSON.parse(await readFile('baseline/season-stats.json', 'utf8')),
  current = JSON.parse(await readFile('baseline/new-season-stats.json', 'utf8')),
  tolerance = 0.02,
  comparison = {};
let failed = false;
for (const metric of Object.keys(baseline.summary)) {
  comparison[metric] = {};
  for (const statistic of ['mean', 'standardDeviation']) {
    const expected = baseline.summary[metric][statistic],
      actual = current.summary[metric][statistic],
      relativeDifference =
        expected === 0
          ? Math.abs(actual - expected)
          : Math.abs(actual - expected) / Math.abs(expected),
      passed = relativeDifference <= tolerance;
    comparison[metric][statistic] = { expected, actual, relativeDifference, passed };
    if (!passed) failed = true;
  }
}
const targetEvaluation = evaluateNpbScoringTargets(current.summary);
if (!targetEvaluation.passed) failed = true;
console.log(
  JSON.stringify(
    { tolerance, npbTargets: NPB_SCORING_TARGETS, targetEvaluation, comparison },
    null,
    2,
  ),
);
if (failed) {
  console.error(
    'Current engine metrics differ from the recorded baseline by more than 2% or fall outside the NPB target ranges.',
  );
  process.exitCode = 1;
}
