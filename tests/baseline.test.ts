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

test('Phase A and Phase B baseline means and distributions stay within two percent', async () => {
  const [legacyRaw, engineRaw] = await Promise.all([
    readFile(resolve('baseline/season-stats.json'), 'utf8'),
    readFile(resolve('baseline/new-season-stats.json'), 'utf8'),
  ]);
  const legacy = JSON.parse(legacyRaw) as BaselineFile;
  const engine = JSON.parse(engineRaw) as BaselineFile;

  assert.equal(legacy.seasons, 100);
  assert.equal(engine.seasons, 100);
  assert.equal(legacy.seed, 20260723);
  assert.equal(engine.seed, 20260723);

  const metrics = [
    'battingAverage',
    'era',
    'homeRuns',
    'stolenBaseSuccessRate',
    'walkRate',
  ];
  for (const metric of metrics) {
    const legacyMetric = legacy.summary[metric];
    const engineMetric = engine.summary[metric];
    assert.ok(legacyMetric, `Phase A metric missing: ${metric}`);
    assert.ok(engineMetric, `Phase B metric missing: ${metric}`);
    assert.ok(
      relativeDifference(legacyMetric.mean, engineMetric.mean) <= 0.02,
      `${metric} mean diverged by more than 2%`,
    );
    assert.ok(
      relativeDifference(
        legacyMetric.standardDeviation,
        engineMetric.standardDeviation,
      ) <= 0.02,
      `${metric} standard deviation diverged by more than 2%`,
    );
  }
});
