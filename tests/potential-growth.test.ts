import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calcOVR,
  configureRandom,
  developmentAgeCoefficient,
  generateBatter,
  growPlayer,
  resetRandom,
  type Maturity,
  type Player,
  type PlayerParams,
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

const average = (values: number[]): number =>
  values.reduce((total, value) => total + value, 0) / values.length;

function growForYears(player: Player, years: number): Player {
  let current = player;
  for (let year = 0; year < years; year += 1) current = growPlayer(current);
  return current;
}

const developmentParameters: Array<keyof PlayerParams> = [
  'cf',
  'cb',
  'pw',
  'dc',
  'sp',
  'df',
  'arm',
  'stam',
];

function averagePotentialGap(player: Player): number {
  return average(
    developmentParameters.map(
      (parameter) =>
        Number(player.pot[parameter] ?? player.p[parameter] ?? 0) -
        Number(player.p[parameter] ?? 0),
    ),
  );
}

test('elite potential is rare and creates clearly larger multi-year growth', () => {
  configureRandom(mulberry32(20260727), () => 1_700_000_000_000);
  const players = Array.from({ length: 1600 }, () => generateBatter('draft', 18, '中堅手', 72));
  const elite = players.filter((player) => player.potentialClass === 'elite'),
    standard = players.filter((player) => player.potentialClass === 'standard'),
    eliteRate = elite.length / players.length;

  assert.ok(eliteRate >= 0.015 && eliteRate <= 0.035, `elite rate was ${eliteRate}`);
  assert.equal(elite.length + standard.length, players.length);

  const growth = (player: Player): number => {
    const before = calcOVR(player, player.pos),
      after = calcOVR(growForYears(player, 5), player.pos);
    return after - before;
  };
  const eliteGrowth = average(elite.map(growth)),
    standardGrowth = average(standard.slice(0, 500).map(growth));

  assert.ok(
    eliteGrowth >= standardGrowth + 3,
    `elite growth ${eliteGrowth.toFixed(2)} should exceed standard growth ${standardGrowth.toFixed(2)}`,
  );
  assert.ok(
    elite.some((player) => {
      const grown = growForYears(player, 5);
      return (grown.growthLog ?? []).some((entry) => (entry.delta ?? 0) >= 2);
    }),
    'at least one elite prospect should record a major growth season',
  );
  resetRandom();
});

test('maturity types shift development, peak, and decline to different ages', () => {
  configureRandom(
    () => 0.5,
    () => 1_700_000_000_000,
  );
  try {
    const base: Player = {
      id: 'career-curve',
      name: '成長曲線',
      age: 18,
      tk: 'draft',
      isP: false,
      pos: '中堅手',
      positions: [{ pos: '中堅手', apt: 100 }],
      mat: '通常',
      hand: { bat: '右' },
      p: { cf: 42, cb: 42, pw: 42, dc: 42, sp: 42, df: 42, arm: 42, stam: 42 },
      pot: { cf: 90, cb: 90, pw: 90, dc: 90, sp: 90, df: 90, arm: 90, stam: 90 },
      potentialClass: 'standard',
      trainPolicy: 'balanced',
    };
    const maturities: Maturity[] = ['超早熟', '早熟', '通常', '晩成', '超晩成'];
    const peaks = new Map<Maturity, number>();
    const atAge = new Map<Maturity, Map<number, number>>();

    for (const maturity of maturities) {
      let player = { ...base, mat: maturity };
      const values = new Map<number, number>();
      while (player.age <= 41) {
        values.set(player.age, calcOVR(player, player.pos));
        player = growPlayer(player);
      }
      const peak = [...values].sort(
        (first, second) => second[1] - first[1] || first[0] - second[0],
      )[0];
      peaks.set(maturity, peak[0]);
      atAge.set(maturity, values);
    }

    assert.ok((atAge.get('超早熟')?.get(22) ?? 0) > (atAge.get('超晩成')?.get(22) ?? 0));
    assert.ok((atAge.get('超晩成')?.get(34) ?? 0) > (atAge.get('超早熟')?.get(34) ?? 0));
    assert.ok((peaks.get('超早熟') ?? 99) <= 25);
    assert.ok((peaks.get('通常') ?? 0) >= 27 && (peaks.get('通常') ?? 99) <= 31);
    assert.ok((peaks.get('超晩成') ?? 0) >= 33);
    assert.ok(developmentAgeCoefficient(30, '早熟') < 0);
    assert.ok(developmentAgeCoefficient(30, '超晩成') > 0);
  } finally {
    resetRandom();
  }
});

test('young late bloomers receive more latent development room', () => {
  configureRandom(mulberry32(20260731), () => 1_700_000_000_000);
  try {
    const players = Array.from({ length: 3000 }, () => generateBatter('draft', 18, '中堅手', 72));
    const early = players.filter((player) => player.mat === '超早熟');
    const late = players.filter((player) => player.mat === '超晩成');
    const earlyGap = average(early.map(averagePotentialGap));
    const lateGap = average(late.map(averagePotentialGap));

    assert.ok(
      lateGap >= earlyGap + 5,
      `late gap ${lateGap.toFixed(2)} should exceed early gap ${earlyGap.toFixed(2)}`,
    );
  } finally {
    resetRandom();
  }
});

test('players decline after their peak even when current ratings equal potential', () => {
  configureRandom(
    () => 0.5,
    () => 1_700_000_000_000,
  );
  try {
    const veteran: Player = {
      id: 'veteran-decline',
      name: 'ベテラン',
      age: 34,
      tk: 'draft',
      isP: false,
      pos: '一塁手',
      positions: [{ pos: '一塁手', apt: 100 }],
      mat: '通常',
      hand: { bat: '右' },
      p: { cf: 90, cb: 90, pw: 90, dc: 90, sp: 90, df: 90, arm: 90, stam: 90 },
      pot: { cf: 90, cb: 90, pw: 90, dc: 90, sp: 90, df: 90, arm: 90, stam: 90 },
      potentialClass: 'elite',
      trainPolicy: 'balanced',
    };
    const before = calcOVR(veteran, veteran.pos);
    const after = calcOVR(growForYears(veteran, 4), veteran.pos);
    assert.ok(after <= before - 4, `veteran OVR should decline from ${before}, received ${after}`);
  } finally {
    resetRandom();
  }
});
