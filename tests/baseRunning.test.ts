import assert from 'node:assert/strict';
import test from 'node:test';

import { advBases } from '../src/engine/atBat';
import { accumulateStatsAll } from '../src/engine/stats';
import type { GameState, Player } from '../src/engine/types';

function batter(id: string, name: string, speed = 70): Player {
  return {
    id,
    name,
    age: 25,
    tk: 'giants',
    isP: false,
    pos: '中堅手',
    mat: '通常',
    hand: { th: '右', bat: '右' },
    p: { stam: 50, sp: speed },
    pot: {},
    trainPolicy: 'balanced',
  };
}

test('打者が出塁したときPlayer identityを塁上に保持する', () => {
  const firstBatter = batter('first', '一塁走者');
  const secondBatter = batter('second', '二塁打者');
  const thirdBatter = batter('third', '三塁打者');

  assert.equal(advBases([false, false, false], '1B', firstBatter, 0).bases[0], firstBatter);
  assert.equal(advBases([false, false, false], '2B', secondBatter, 0).bases[1], secondBatter);
  assert.equal(advBases([false, false, false], '3B', thirdBatter, 0).bases[2], thirdBatter);
});

test('四球の押し出しでも既存走者のPlayer identityを失わない', () => {
  const runnerOnFirst = batter('r1', '一塁走者');
  const runnerOnSecond = batter('r2', '二塁走者');
  const runnerOnThird = batter('r3', '三塁走者');
  const currentBatter = batter('b', '打者');

  const result = advBases(
    [runnerOnFirst, runnerOnSecond, runnerOnThird],
    'BB',
    currentBatter,
    1,
  );

  assert.deepEqual(result.bases, [currentBatter, runnerOnFirst, runnerOnSecond]);
  assert.equal(result.runs, 1);
});

test('盗塁イベントは走者本人の成績に加算され、打席数を増やさない', () => {
  const runner = batter('runner', '走者');
  const pitcher = {
    ...batter('pitcher', '投手'),
    isP: true,
    role: '先発' as const,
    pos: undefined,
    p: { stam: 80, vel: 70, ctrl: 70 },
  };
  const game = {
    atBatLog: [
      {
        inning: 1,
        isBot: false,
        batter: runner.name,
        batterId: runner.id,
        bSide: 'giants',
        pitcher: pitcher.name,
        pitcherId: pitcher.id,
        pSide: 'tigers',
        result: 'SB',
        rbi: 0,
        desc: `${runner.name}、盗塁成功`,
        snap: { home: 0, away: 0 },
      },
    ],
    starterH: pitcher,
    starterA: pitcher,
  } as unknown as GameState;

  const stats = accumulateStatsAll(game, {});
  assert.equal(stats[runner.id]?.type, 'bat');
  if (stats[runner.id]?.type !== 'bat') assert.fail('runner stats must be batting stats');
  assert.equal(stats[runner.id].sb, 1);
  assert.equal(stats[runner.id].pa, 0);
  assert.equal(stats[runner.id].ab, 0);
});
