import assert from 'node:assert/strict';
import test from 'node:test';

import { runLongTermDevelopmentAudit } from '../scripts/audit-long-term-development';

test('multi-seed 30-year development audit keeps generations cycling without quotas', () => {
  const report = runLongTermDevelopmentAudit({
    years: 30,
    seeds: [55, 551, 5501],
  });

  assert.equal(report.configuration.fixedOvrCap, false);
  assert.equal(report.configuration.fixedStarQuota, false);
  assert.deepEqual(report.summary.warnings, []);
  assert.ok(report.summary.decline.age35.mean > report.summary.decline.age38.mean);
  assert.ok(report.summary.decline.age38.mean > report.summary.decline.age40.mean);
  assert.ok(
    report.summary.maturity.超晩成.averagePeakAge - report.summary.maturity.超早熟.averagePeakAge >=
      4.5,
  );
  assert.ok((report.summary.final?.ovr100Plus ?? 0) >= 8);
});
