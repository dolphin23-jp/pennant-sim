import assert from 'node:assert/strict';
import test from 'node:test';

import {
  newspaperFront,
  verticalCells,
  verticalColumns,
} from '../src/components/newspaper/newspaperLayout';
import type { NarrativeArticle } from '../src/narrative/types';

const article = (overrides: Partial<NarrativeArticle>): NarrativeArticle => ({
  id: 'pennant-clinch:2026:giants',
  generatorVersion: 2,
  kind: 'pennantClinch',
  year: 2026,
  publishedAt: '2026-09-04',
  asOfDate: '2026-09-04',
  viewMode: 'archival',
  headline: '巨人、2026年セ・リーグ優勝',
  dek: '9月4日、残り12試合で決める',
  teamKeys: ['giants'],
  playerIds: [],
  segments: [
    { class: 'FACTUAL', text: '読売ジャイアンツが9月4日、優勝を決めた。', factRefs: [] },
    { class: 'FACTUAL', text: '優勝決定時点で80勝50敗3分。', factRefs: [] },
  ],
  factRefs: [],
  ...overrides,
});

test('a pennant front page is an extra with the club over a short banner', () => {
  const front = newspaperFront(article({}));
  assert.equal(front.edition, '号外');
  assert.equal(front.banner, '優勝');
  assert.equal(front.kicker, '読売ジャイアンツ');
  assert.equal(front.dateLine, '2026年9月4日（金）');
  assert.equal(front.lead, '読売ジャイアンツが9月4日、優勝を決めた。');
  assert.deepEqual(front.body, ['優勝決定時点で80勝50敗3分。']);
});

test('a record front page leads with the achievement and names the player', () => {
  const front = newspaperFront(
    article({
      id: 'achievement:a1',
      kind: 'achievement',
      headline: '【メモリアル】村上 一郎、通算300本塁打',
      dek: undefined,
    }),
  );
  assert.equal(front.edition, '特報');
  assert.equal(front.kicker, 'メモリアル');
  assert.equal(front.banner, '300本塁打');
});

test('vertical text keeps short numbers in one cell and never loses a character', () => {
  assert.deepEqual(verticalCells('80勝2026年'), ['80', '勝', '2', '0', '2', '6', '年']);
  const text = '優勝決定時点で80勝50敗3分、残り12試合。';
  const columns = verticalColumns(text, 5);
  assert.ok(columns.every((column) => column.length <= 5));
  assert.equal(columns.flat().join(''), text);
});
