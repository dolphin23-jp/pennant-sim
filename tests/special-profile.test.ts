import assert from 'node:assert/strict';
import test from 'node:test';

import { ALL_SPECIALS, SPECIAL_DESCRIPTIONS } from '../src/data';
import {
  configureRandom,
  generateBatter,
  generatePitcher,
  resetRandom,
  type Player,
} from '../src/engine';

test('every special ability shown to players has a concise explanation', () => {
  for (const special of ALL_SPECIALS) {
    assert.ok(
      SPECIAL_DESCRIPTIONS[special.id]?.length >= 12,
      `${special.n} (${special.id}) needs a player-facing explanation`,
    );
  }
});

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
const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const hasAny = (player: Player, ids: string[]) =>
  ids.some((id) => (player.specialLevels?.[id] ?? 0) > 0);

function assertProfileAdvantage(
  players: Player[],
  ids: string[],
  rating: (player: Player) => number,
  minimumDifference = 2,
): void {
  const holders = players.filter((player) => hasAny(player, ids));
  const others = players.filter((player) => !hasAny(player, ids));
  assert.ok(holders.length > 20, `Too few holders for ${ids.join(', ')}: ${holders.length}`);
  const difference = average(holders.map(rating)) - average(others.map(rating));
  assert.ok(
    difference > minimumDifference,
    `${ids.join(', ')} profile difference was only ${difference.toFixed(2)}`,
  );
}

test('batter special abilities follow the generated player profile', () => {
  configureRandom(mulberry32(20260724), () => 1_700_000_000_000);
  const players = Array.from({ length: 3000 }, (_, index) =>
    generateBatter('draft', 27, index % 2 ? '一塁手' : '中堅手', 72),
  );
  assertProfileAdvantage(players, ['pull', 'slugger_gold'], (player) => player.p.pw ?? 0);
  assertProfileAdvantage(
    players,
    ['avg', 'avg_gold', 'spray', 'spray_gold'],
    (player) => ((player.p.cf ?? 0) + (player.p.cb ?? 0)) / 2,
  );
  assertProfileAdvantage(players, ['sb', 'sb_gold', 'run'], (player) => player.p.sp ?? 0);
  assertProfileAdvantage(players, ['eye', 'eye_gold'], (player) => player.p.dc ?? 0);
  for (const player of players) {
    assert.ok(!hasAny(player, ['co']) || !hasAny(player, ['cx']));
    assert.ok(!hasAny(player, ['fbo']) || !hasAny(player, ['fbx']));
  }
  resetRandom();
});

test('pitcher special abilities follow the generated player profile', () => {
  configureRandom(mulberry32(20260725), () => 1_700_000_000_000);
  const players = Array.from({ length: 3000 }, (_, index) =>
    generatePitcher('draft', 27, 72, index % 2 ? '先発' : 'リリーフ'),
  );
  assertProfileAdvantage(
    players,
    ['kire', 'kire_gold', 'kk', 'kk_gold', 'heavy', 'heavy_gold'],
    (player) => ((player.p.vel ?? 0) + (player.p.nobi ?? 0)) / 2,
  );
  assertProfileAdvantage(players, ['low', 'cnr', 'cnr_gold'], (player) => player.p.ctrl ?? 0);
  assertProfileAdvantage(players, ['tough', 'iron'], (player) => player.p.stam ?? 0);
  resetRandom();
});
