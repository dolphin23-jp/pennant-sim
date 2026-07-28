import assert from 'node:assert/strict';
import test from 'node:test';

import {
  advancePositionConversion,
  cancelPositionConversion,
  configureRandom,
  generateBatter,
  resetRandom,
  startPositionConversion,
  type Player,
} from '../src/engine';

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function advanceUntilComplete(player: Player, maxYears = 40): Player {
  let current = player;
  for (let year = 0; year < maxYears && current.conversionTarget; year += 1) {
    current = advancePositionConversion(current);
  }
  return current;
}

test('starting a conversion adds a low, deliberately shaky aptitude and does not touch the primary position', () => {
  configureRandom(mulberry32(1), () => Date.UTC(2026, 0, 1));
  try {
    const player = generateBatter('giants', 24, '中堅手', 60);
    const converted = startPositionConversion(player, '三塁手');
    assert.equal(converted.conversionTarget?.pos, '三塁手');
    assert.equal(converted.conversionTarget?.startedAge, player.age);
    const apt = converted.positions?.find((entry) => entry.pos === '三塁手')?.apt;
    assert.ok(apt !== undefined && apt >= 15 && apt <= 28, `starting aptitude out of range: ${apt}`);
    const primaryApt = converted.positions?.find((entry) => entry.pos === player.pos)?.apt;
    assert.equal(primaryApt, 100, '本職の適性は変更されない');
  } finally {
    resetRandom();
  }
});

test('starting a conversion on a position with existing aptitude keeps that aptitude', () => {
  const player: Player = {
    ...generateBatter('giants', 24, '中堅手', 60),
    positions: [
      { pos: '中堅手', apt: 100 },
      { pos: '左翼手', apt: 72 },
    ],
  };
  const converted = startPositionConversion(player, '左翼手');
  const apt = converted.positions?.find((entry) => entry.pos === '左翼手')?.apt;
  assert.equal(apt, 72, '既存の適性を持つポジションは開始適性で上書きしない');
});

test('yearly practice raises aptitude toward the ceiling and then clears the target', () => {
  configureRandom(mulberry32(7), () => Date.UTC(2026, 0, 1));
  try {
    const player = startPositionConversion(generateBatter('giants', 22, '中堅手', 60), '遊撃手');
    const startApt = player.positions?.find((entry) => entry.pos === '遊撃手')?.apt ?? 0;

    const afterOneYear = advancePositionConversion(player);
    const aptAfterOneYear = afterOneYear.positions?.find((entry) => entry.pos === '遊撃手')?.apt ?? 0;
    assert.ok(aptAfterOneYear > startApt, '1年分の練習で適性が上がっていない');
    assert.ok(afterOneYear.conversionTarget, '上限に達するまでは練習中フラグが残る');

    const completed = advanceUntilComplete(player);
    assert.equal(completed.conversionTarget, undefined, '上限到達後は練習フラグが消える');
    const finalApt = completed.positions?.find((entry) => entry.pos === '遊撃手')?.apt ?? 0;
    assert.ok(finalApt <= 80, `練習だけで一生の専門ポジション並みには届かない想定: ${finalApt}`);
    assert.ok(finalApt >= 75, `上限付近まで到達しているはず: ${finalApt}`);
  } finally {
    resetRandom();
  }
});

test('advancing without an active conversion target is a no-op', () => {
  const player = generateBatter('giants', 24, '中堅手', 60);
  const unchanged = advancePositionConversion(player);
  assert.deepEqual(unchanged.positions, player.positions);
  assert.equal(unchanged.conversionTarget, undefined);
});

test('cancelling a conversion clears the target but keeps the aptitude already earned', () => {
  configureRandom(mulberry32(3), () => Date.UTC(2026, 0, 1));
  try {
    const started = startPositionConversion(generateBatter('giants', 24, '中堅手', 60), '右翼手');
    const practiced = advancePositionConversion(started);
    const aptBeforeCancel = practiced.positions?.find((entry) => entry.pos === '右翼手')?.apt;
    const cancelled = cancelPositionConversion(practiced);
    assert.equal(cancelled.conversionTarget, undefined);
    assert.equal(
      cancelled.positions?.find((entry) => entry.pos === '右翼手')?.apt,
      aptBeforeCancel,
    );
  } finally {
    resetRandom();
  }
});
