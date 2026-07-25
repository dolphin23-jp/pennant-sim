import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FOREIGN_GN,
  FOREIGN_NAME_POOLS,
  FOREIGN_SN,
  GN,
  JAPANESE_GIVEN_NAMES,
  JAPANESE_SURNAMES,
  SN,
} from '../src/data';
import { configureRandom, generateBatter, registerExistingNames, resetRandom } from '../src/engine';

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

test('Japanese name pools are weighted, broad, and free of contaminated fragments', () => {
  assert.ok(JAPANESE_SURNAMES.length >= 80);
  assert.ok(JAPANESE_GIVEN_NAMES.length >= 70);
  assert.ok(SN.length > JAPANESE_SURNAMES.length);
  assert.ok(GN.length > JAPANESE_GIVEN_NAMES.length);
  const surnames = new Set(JAPANESE_SURNAMES.map((entry) => entry.value));
  const givenNames = new Set(JAPANESE_GIVEN_NAMES.map((entry) => entry.value));
  for (const invalid of ['田中将', '高橋光', 'バウアー']) assert.equal(surnames.has(invalid), false);
  assert.equal(givenNames.has('ノーラン'), false);
});

test('foreign names are separated into origin-region pools', () => {
  const coveredOrigins = new Set<string>(
    Object.values(FOREIGN_NAME_POOLS).flatMap((pool) => [...pool.origins]),
  );
  const requiredOrigins = [
    'アメリカ',
    'ドミニカ共和国',
    'ベネズエラ',
    'キューバ',
    'メキシコ',
    '韓国',
    '台湾',
    'その他',
  ];
  for (const origin of requiredOrigins) assert.ok(coveredOrigins.has(origin));
  assert.ok(new Set(FOREIGN_SN).size >= 70);
  assert.ok(new Set(FOREIGN_GN).size >= 70);
});

test('same-name players use ids rather than numbered display-name suffixes', () => {
  configureRandom(mulberry32(20260725), () => 1_700_000_000_000);
  try {
    registerExistingNames({});
    const players = Array.from({ length: 500 }, (_, index) =>
      generateBatter('draft', 18 + (index % 7), '中堅手', 55 + (index % 25)),
    );
    // Duplicate display names are intentional; only the immutable Player.id must remain unique.
    assert.equal(players.some((player) => player.name.includes('#')), false);
    assert.equal(new Set(players.map((player) => player.id)).size, players.length);
  } finally {
    resetRandom();
  }
});
