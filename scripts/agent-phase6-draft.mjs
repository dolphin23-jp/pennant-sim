import { readFile, writeFile } from 'node:fs/promises';

async function replaceOnce(path, before, after) {
  const source = await readFile(path, 'utf8');
  if (source.includes(after)) return false;
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Could not find expected source in ${path}`);
  if (source.indexOf(before, first + before.length) >= 0)
    throw new Error(`Expected source is not unique in ${path}`);
  await writeFile(path, source.replace(before, after), 'utf8');
  return true;
}

await replaceOnce(
  'src/engine/types.ts',
  `export type Maturity = '超早熟' | '早熟' | '通常' | '晩成' | '超晩成';
export type PotentialClass = 'standard' | 'elite';`,
  `export type Maturity = '超早熟' | '早熟' | '通常' | '晩成' | '超晩成';
export type PotentialClass = 'standard' | 'elite';
export type DraftOrigin = '高卒' | '大卒' | '社会人';`,
);
await replaceOnce(
  'src/engine/types.ts',
  `  signedVia?: string;
  [key: string]: unknown;`,
  `  signedVia?: string;
  draftOrigin?: DraftOrigin;
  [key: string]: unknown;`,
);
await replaceOnce(
  'src/state/offseason.ts',
  `import type { FieldPosition, Player, Team, TeamKey, Teams } from '../engine';`,
  `import type { DraftOrigin, FieldPosition, Player, Team, TeamKey, Teams } from '../engine';`,
);
await replaceOnce(
  'src/state/offseason.ts',
  `    const position = randomChoice(positions);
    const age = randomInt(18, 22);
    let quality = Math.max(32, Math.min(96, gaussian(58, 14)));
    if (random() < 0.1) quality = Math.max(60, Math.min(104, gaussian(78, 8)));
    if (random() < 0.02) quality = Math.max(82, Math.min(112, gaussian(94, 6)));
    const player =
      position === '先発' || position === 'リリーフ' || position === 'クローザー'
        ? generatePitcher('draft', age, quality, position)
        : generateBatter('draft', age, position, quality);
    player.note = quality >= 90 ? '怪物候補' : quality >= 75 ? '即戦力候補' : age <= 19 ? '素材型' : '有望株';`,
  `    const position = randomChoice(positions),
      originRoll = random(),
      draftOrigin: DraftOrigin =
        originRoll < 0.46 ? '高卒' : originRoll < 0.82 ? '大卒' : '社会人',
      age =
        draftOrigin === '高卒'
          ? randomInt(18, 19)
          : draftOrigin === '大卒'
            ? randomInt(21, 22)
            : randomInt(23, 25),
      immediateChance = draftOrigin === '高卒' ? 0.07 : draftOrigin === '大卒' ? 0.13 : 0.16,
      monsterChance = draftOrigin === '高卒' ? 0.012 : draftOrigin === '大卒' ? 0.027 : 0.035;
    let quality = Math.max(32, Math.min(96, gaussian(58, 14)));
    if (random() < immediateChance) quality = Math.max(60, Math.min(104, gaussian(78, 8)));
    if (random() < monsterChance) quality = Math.max(82, Math.min(112, gaussian(94, 6)));
    const player =
      position === '先発' || position === 'リリーフ' || position === 'クローザー'
        ? generatePitcher('draft', age, quality, position)
        : generateBatter('draft', age, position, quality);
    player.draftOrigin = draftOrigin;
    const prospectLabel =
      quality >= 90 ? '怪物候補' : quality >= 75 ? '即戦力候補' : age <= 19 ? '素材型' : '有望株';
    player.note = \`\${draftOrigin}・\${prospectLabel}\`;`,
);

const testPath = 'tests/draft-origin.test.ts';
const testContent = `import assert from 'node:assert/strict';
import test from 'node:test';
import { calcOVR, configureRandom, resetRandom, type DraftOrigin, type Player } from '../src/engine';
import { generateDraftProspects } from '../src/state/offseason';

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
const overall = (player: Player) => (player.isP ? calcOVR(player) : calcOVR(player, player.pos));
const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

test('draft origins control age bands, labels, and population shares', () => {
  configureRandom(mulberry32(20260726), () => 1_700_000_000_000);
  const prospects = Array.from({ length: 100 }, () => generateDraftProspects()).flat();
  assert.equal(prospects.length, 8000);

  const groups = Object.fromEntries(
    (['高卒', '大卒', '社会人'] as DraftOrigin[]).map((origin) => [
      origin,
      prospects.filter((player) => player.draftOrigin === origin),
    ]),
  ) as Record<DraftOrigin, Player[]>;

  const shares = Object.fromEntries(
    Object.entries(groups).map(([origin, players]) => [origin, players.length / prospects.length]),
  ) as Record<DraftOrigin, number>;
  assert.ok(shares.高卒 >= 0.42 && shares.高卒 <= 0.5);
  assert.ok(shares.大卒 >= 0.32 && shares.大卒 <= 0.4);
  assert.ok(shares.社会人 >= 0.15 && shares.社会人 <= 0.21);

  for (const player of prospects) {
    assert.ok(player.draftOrigin);
    assert.match(player.note ?? '', /^(高卒|大卒|社会人)・(怪物候補|即戦力候補|素材型|有望株)$/);
    if (player.draftOrigin === '高卒') assert.ok(player.age >= 18 && player.age <= 19);
    if (player.draftOrigin === '大卒') assert.ok(player.age >= 21 && player.age <= 22);
    if (player.draftOrigin === '社会人') assert.ok(player.age >= 23 && player.age <= 25);
  }

  const meanOvr = Object.fromEntries(
    Object.entries(groups).map(([origin, players]) => [origin, average(players.map(overall))]),
  ) as Record<DraftOrigin, number>;
  assert.ok(meanOvr.大卒 > meanOvr.高卒 + 2);
  assert.ok(meanOvr.社会人 > meanOvr.高卒 + 2);
  assert.ok(groups.高卒.some((player) => player.note?.endsWith('怪物候補')));
  assert.ok(groups.大卒.some((player) => player.note?.endsWith('怪物候補')));
  assert.ok(groups.社会人.some((player) => player.note?.endsWith('怪物候補')));
  resetRandom();
});
`;
try {
  const existing = await readFile(testPath, 'utf8');
  if (existing !== testContent) throw new Error(`${testPath} already exists with different content`);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
  await writeFile(testPath, testContent, 'utf8');
}

console.log('Applied phase 6 draft-origin generation.');
