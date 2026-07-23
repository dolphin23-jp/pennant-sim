import { readFile } from 'node:fs/promises';
import process from 'node:process';
const legacy = JSON.parse(await readFile('baseline/season-stats.json', 'utf8')),
  current = JSON.parse(await readFile('baseline/new-season-stats.json', 'utf8')),
  tolerance = 0.02,
  comparison = {};
let failed = false;
for (const metric of Object.keys(legacy.summary)) {
  comparison[metric] = {};
  for (const statistic of ['mean', 'standardDeviation']) {
    const expected = legacy.summary[metric][statistic],
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
console.log(JSON.stringify({ tolerance, comparison }, null, 2));
if (failed) {
  console.error('New-engine baseline differs from the legacy baseline by more than 2%.');
  process.exitCode = 1;
}
