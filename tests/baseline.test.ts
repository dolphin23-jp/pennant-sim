import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { resolve } from 'node:path';

interface MetricSummary {
  mean: number;
  standardDeviation: number;
}

interface BaselineFile {
  seasons: number;
  seed: number;
  summary: Record<string, MetricSummary>;
}

const relativeDifference = (first: number, second: number): number =>
  first === 0 ? Math.abs(second) : Math.abs(second - first) / Math.abs(first);

test('current engine stays within two percent of the recorded balance baseline', async () => {
  const [baselineRaw, currentRaw] = await Promise.all([
    readFile(resolve('baseline/season-stats.json'), 'utf8'),
    readFile(resolve('baseline/new-season-stats.json'), 'utf8'),
  ]);
  const baseline = JSON.parse(baselineRaw) as BaselineFile;
  const current = JSON.parse(currentRaw) as BaselineFile;

  assert.equal(baseline.seasons, 100);
  assert.equal(current.seasons, 100);
  assert.equal(baseline.seed, 20260723);
  assert.equal(current.seed, 20260723);

  const metrics = [
    'battingAverage',
    'era',
    'homeRuns',
    'stolenBaseSuccessRate',
    'walkRate',
  ];
  for (const metric of metrics) {
    const baselineMetric = baseline.summary[metric];
    const currentMetric = current.summary[metric];
    assert.ok(baselineMetric, `Recorded baseline metric missing: ${metric}`);
    assert.ok(currentMetric, `Current engine metric missing: ${metric}`);
    assert.ok(
      relativeDifference(baselineMetric.mean, currentMetric.mean) <= 0.02,
      `${metric} mean diverged by more than 2%`,
    );
    assert.ok(
      relativeDifference(
        baselineMetric.standardDeviation,
        currentMetric.standardDeviation,
      ) <= 0.02,
      `${metric} standard deviation diverged by more than 2%`,
    );
  }
});
