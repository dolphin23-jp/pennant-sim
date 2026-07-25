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

test('Japanese name pools are weighted, broad, and free of known contaminated fragments', () => {
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
