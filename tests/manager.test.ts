import assert from 'node:assert/strict';
import test from 'node:test';

import { FINANCE_BALANCE } from '../src/data';
import {
  INITIAL_TRUST,
  applyOwnerBudget,
  assignAllActiveRosters,
  baseBudget,
  configureRandom,
  evaluateSeason,
  gradeSeason,
  initTeams,
  resetRandom,
  seasonExpectation,
  teamStrength,
} from '../src/engine';
import { CENTRAL } from '../src/data';

test('the goal follows where the roster ranks in its league', () => {
  configureRandom(
    () => 0.42,
    () => 1_700_000_000_000,
  );
  try {
    const teams = assignAllActiveRosters(initTeams());
    const ranked = [...CENTRAL].sort((a, b) => teamStrength(teams[b]) - teamStrength(teams[a]));
    const best = seasonExpectation(teams, ranked[0]!, 2026);
    const worst = seasonExpectation(teams, ranked[5]!, 2026);
    assert.equal(best.strengthRank, 1);
    assert.equal(best.targetRank, 1);
    assert.equal(best.label, 'リーグ優勝');
    assert.equal(worst.strengthRank, 6);
    assert.equal(worst.targetRank, 5);
  } finally {
    resetRandom();
  }
});

test('the grade weighs the finish against the goal, and October on top', () => {
  assert.equal(gradeSeason({ targetRank: 3 }, 3, 'climax'), 'B');
  assert.equal(gradeSeason({ targetRank: 3 }, 1, 'climax'), 'A');
  assert.equal(gradeSeason({ targetRank: 3 }, 1, 'champion'), 'S');
  assert.equal(
    gradeSeason({ targetRank: 1 }, 2, 'japanSeries'),
    'A',
    'a Japan Series makes up for second',
  );
  assert.equal(gradeSeason({ targetRank: 1 }, 3, 'climax'), 'C');
  assert.equal(gradeSeason({ targetRank: 3 }, 6, 'none'), 'D');
});

test('trust moves with the grade and stays within 0 to 100', () => {
  const expectation = { year: 2026, targetRank: 3, label: 'CS進出', strengthRank: 3 };
  const good = evaluateSeason({ trust: 95, expectation, history: [] }, expectation, 1, 'champion');
  assert.equal(good.grade, 'S');
  assert.equal(good.trustAfter, 100);
  const bad = evaluateSeason(
    { trust: INITIAL_TRUST, expectation, history: [] },
    expectation,
    6,
    'none',
  );
  assert.equal(bad.grade, 'D');
  assert.equal(bad.trustAfter, INITIAL_TRUST - 15);
  assert.ok(bad.budgetChange < 0);
});

test('the owner budget change stays inside the league budget range', () => {
  const teams = assignAllActiveRosters(initTeams());
  const team = teams.giants;
  const base = baseBudget('giants');
  const raised = applyOwnerBudget(
    { ...team, finance: { budget: base * FINANCE_BALANCE.maximumBudgetShare, revenue: base } },
    0.04,
  );
  assert.ok(raised.finance!.budget <= Math.round(base * FINANCE_BALANCE.maximumBudgetShare));
  const cut = applyOwnerBudget({ ...team, finance: { budget: base, revenue: base } }, -0.04);
  assert.equal(cut.finance!.budget, Math.round(base * 0.96));
});
