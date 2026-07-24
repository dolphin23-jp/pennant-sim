import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calcOVR,
  displayOVR,
  displayOVRBreakdown,
  effectiveOVR,
} from '../src/engine/ratings';
import type { Player, SpecialAbility } from '../src/engine/types';

function special(
  id: string,
  p: number,
  rarity: SpecialAbility['rarity'] = 'normal',
): SpecialAbility {
  return { id, n: id, c: '#fff', p, tierMax: rarity === 'gold' ? 1 : 5, rarity };
}

function batter(overrides: Partial<Player> = {}): Player {
  return {
    id: 'batter-1',
    name: '表示テスト',
    age: 25,
    tk: 'giants',
    isP: false,
    pos: '中堅手',
    positions: [{ pos: '中堅手', apt: 100 }],
    mat: '通常',
    hand: { th: '右', bat: '右' },
    p: { cf: 70, cb: 68, pw: 65, dc: 60, sp: 72, df: 70, arm: 65, stam: 70 },
    pot: {},
    trainPolicy: 'balanced',
    ...overrides,
  };
}

test('特殊能力がなければ従来の実効OVRと同じ', () => {
  const player = batter();
  assert.equal(displayOVR(player, '中堅手'), effectiveOVR(player, '中堅手'));
});

test('通常特殊能力は p × level × 通常係数で加算する', () => {
  const player = batter({
    specials: [special('custom-positive', 0.1)],
    specialLevels: { 'custom-positive': 3 },
  });
  const breakdown = displayOVRBreakdown(player, '中堅手');
  assert.equal(breakdown.specialAdjustment, 3);
  assert.equal(breakdown.total, breakdown.base + 3);
});

test('ゴールド特殊能力にはゴールド係数を使う', () => {
  const player = batter({
    specials: [special('custom-gold', 0.02, 'gold')],
    specialLevels: { 'custom-gold': 1 },
  });
  const breakdown = displayOVRBreakdown(player, '中堅手');
  assert.equal(breakdown.specialAdjustment, 3);
});

test('明示されたネガティブ特殊能力IDは減点する', () => {
  const player = batter({
    specials: [special('px', 0.08)],
    specialLevels: { px: 2 },
  });
  const breakdown = displayOVRBreakdown(player, '中堅手');
  assert.equal(breakdown.specialAdjustment, -1.6);
  assert.ok(breakdown.total < breakdown.base);
});

test('特殊能力補正は±10にクランプする', () => {
  const positives = Array.from({ length: 12 }, (_, index) => special(`positive-${index}`, 1));
  const positiveLevels = Object.fromEntries(positives.map((entry) => [entry.id, 1]));
  const positive = displayOVRBreakdown(
    batter({ specials: positives, specialLevels: positiveLevels }),
    '中堅手',
  );
  assert.equal(positive.specialAdjustment, 10);

  const negatives = ['px', 'ldx', 'cx', 'fbx'].map((id) => special(id, 1));
  const negativeLevels = Object.fromEntries(negatives.map((entry) => [entry.id, 99]));
  const negative = displayOVRBreakdown(
    batter({ specials: negatives, specialLevels: negativeLevels }),
    '中堅手',
  );
  assert.equal(negative.specialAdjustment, -10);
});

test('includeSpecials=falseなら表示補正を無効化できる', () => {
  const player = batter({
    specials: [special('custom-positive', 0.1)],
    specialLevels: { 'custom-positive': 5 },
  });
  assert.equal(
    displayOVR(player, '中堅手', { includeSpecials: false }),
    effectiveOVR(player, '中堅手'),
  );
});

test('calcOVRとeffectiveOVRの値は表示用計算を呼んでも変化しない', () => {
  const player = batter({
    specials: [special('custom-positive', 0.1)],
    specialLevels: { 'custom-positive': 5 },
  });
  const rawBefore = calcOVR(player);
  const effectiveBefore = effectiveOVR(player, '中堅手');
  void displayOVR(player, '中堅手');
  assert.equal(calcOVR(player), rawBefore);
  assert.equal(effectiveOVR(player, '中堅手'), effectiveBefore);
});
