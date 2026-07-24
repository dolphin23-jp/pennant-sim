export const NPB_SCORING_TARGETS = Object.freeze({
  reference: '2025 NPB league environment',
  battingAverage: Object.freeze({ minimum: 0.232, target: 0.244, maximum: 0.257 }),
  era: Object.freeze({ minimum: 2.21, target: 3.01, maximum: 3.6 }),
  homeRuns: Object.freeze({ minimum: 1000, target: 1096, maximum: 1200 }),
  stolenBaseAttemptsPerTeamGame: Object.freeze({ minimum: 0.3, target: 0.45, maximum: 0.6 }),
});

const metricValue = (value) =>
  typeof value === 'number' ? value : typeof value?.mean === 'number' ? value.mean : Number.NaN;

export function evaluateNpbScoringTargets(metrics) {
  const comparison = {};
  let passed = true;
  for (const metric of Object.keys(NPB_SCORING_TARGETS).filter((key) => key !== 'reference')) {
    const value = metricValue(metrics[metric]);
    const range = NPB_SCORING_TARGETS[metric];
    const metricPassed = Number.isFinite(value) && value >= range.minimum && value <= range.maximum;
    comparison[metric] = { value, ...range, passed: metricPassed };
    if (!metricPassed) passed = false;
  }
  return { passed, comparison };
}
