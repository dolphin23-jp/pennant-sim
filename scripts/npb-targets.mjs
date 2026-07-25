export const NPB_SCORING_TARGETS = Object.freeze({
  reference: '2025 NPB league environment',
  battingAverage: Object.freeze({ minimum: 0.232, target: 0.244, maximum: 0.257 }),
  era: Object.freeze({ minimum: 2.21, target: 3.01, maximum: 3.6 }),
  homeRuns: Object.freeze({ minimum: 1000, target: 1096, maximum: 1200 }),
  stolenBaseAttemptsPerTeamGame: Object.freeze({ minimum: 0.3, target: 0.45, maximum: 0.6 }),
  // League averages alone cannot tell whether individual seasons are distributed
  // realistically: a league can hit .244 with nobody reaching .300. These gate the tails.
  battingAverage300PlusCount: Object.freeze({ minimum: 3, target: 9, maximum: 18 }),
  homeRuns40Plus: Object.freeze({ minimum: 0.2, target: 1.4, maximum: 4 }),
  runsBattedIn100Plus: Object.freeze({ minimum: 0.8, target: 3, maximum: 7 }),
  era200MinusCount: Object.freeze({ minimum: 1, target: 4, maximum: 10 }),
  errorsPerTeam: Object.freeze({ minimum: 65, target: 86, maximum: 110 }),
  unearnedRunShare: Object.freeze({ minimum: 0.04, target: 0.08, maximum: 0.13 }),
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
