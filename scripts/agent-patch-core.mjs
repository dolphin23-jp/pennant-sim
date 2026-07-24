import { readFile, writeFile } from 'node:fs/promises';

async function replaceOnce(path, before, after) {
  const source = await readFile(path, 'utf8');
  if (source.includes(after)) return false;
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Could not find expected source in ${path}: ${before.slice(0, 100)}`);
  if (source.indexOf(before, first + before.length) >= 0)
    throw new Error(`Expected source is not unique in ${path}: ${before.slice(0, 100)}`);
  await writeFile(path, source.replace(before, after), 'utf8');
  return true;
}

const changed = [];
async function patch(path, before, after) {
  if (await replaceOnce(path, before, after)) changed.push(path);
}

await patch(
  'src/engine/game.ts',
  `      let attemptRate = clamp(((runnerPlayer?.p.sp || 50) - 50) / 400, 0.01, 0.08);`,
  `      let attemptRate = clamp(((runnerPlayer?.p.sp || 50) - 30) / 140, 0.03, 0.35);`,
);

await patch(
  'src/engine/market.ts',
  `export function genFreeAgentMarket(): Player[] {`,
  `function generateMarketQuality(base: number, standardDeviation: number, minimum: number, maximum: number): number {
  let quality = clamp(gaussian(base, standardDeviation), minimum, maximum);
  if (random() < 0.1) quality = clamp(gaussian(base + 16, 8), minimum + 8, 106);
  if (random() < 0.02) quality = clamp(gaussian(base + 29, 6), 82, 118);
  return quality;
}
export function genFreeAgentMarket(): Player[] {`,
);
await patch(
  'src/engine/market.ts',
  `        quality = clamp(gaussian(67, 8), 50, 88),`,
  `        quality = generateMarketQuality(67, 10, 45, 90),`,
);
await patch(
  'src/engine/market.ts',
  `        quality = clamp(gaussian(66, 8), 48, 86),`,
  `        quality = generateMarketQuality(66, 10, 43, 89),`,
);
await patch(
  'src/engine/market.ts',
  `        quality = clamp(gaussian(72, 7), 58, 92),`,
  `        quality = generateMarketQuality(72, 9, 52, 96),`,
);
await patch(
  'src/engine/market.ts',
  `        quality = clamp(gaussian(73, 7), 60, 94),`,
  `        quality = generateMarketQuality(73, 9, 54, 98),`,
);

await patch(
  'src/engine/types.ts',
  `export type Maturity = '超早熟' | '早熟' | '通常' | '晩成' | '超晩成';`,
  `export type Maturity = '超早熟' | '早熟' | '通常' | '晩成' | '超晩成';
export type DraftOrigin = '高卒' | '大卒' | '社会人';`,
);
await patch(
  'src/engine/types.ts',
  `  signedVia?: string;
  [key: string]: unknown;`,
  `  signedVia?: string;
  draftOrigin?: DraftOrigin;
  [key: string]: unknown;`,
);

await patch(
  'src/state/offseason.ts',
  `import type { FieldPosition, Player, Team, TeamKey, Teams } from '../engine';`,
  `import type { DraftOrigin, FieldPosition, Player, Team, TeamKey, Teams } from '../engine';`,
);
await patch(
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

await patch(
  'src/data/constants.ts',
  `    velocityScale: 210,
    movementScale: 270,
    breakingBallScale: 320,
    batterContactScale: 220,`,
  `    velocityScale: 240,
    movementScale: 300,
    breakingBallScale: 320,
    batterContactScale: 190,`,
);
await patch(
  'src/data/constants.ts',
  `    powerScale: 1500,`,
  `    powerScale: 1250,`,
);

await patch(
  'scripts/npb-targets.mjs',
  `  homeRuns: Object.freeze({ minimum: 1000, target: 1096, maximum: 1200 }),`,
  `  homeRuns: Object.freeze({ minimum: 1000, target: 1096, maximum: 1200 }),
  stolenBaseAttemptsPerTeamGame: Object.freeze({ minimum: 0.3, target: 0.45, maximum: 0.6 }),`,
);
await patch(
  'scripts/npb-targets.mjs',
  `  for (const metric of ['battingAverage', 'era', 'homeRuns']) {`,
  `  for (const metric of Object.keys(NPB_SCORING_TARGETS).filter((key) => key !== 'reference')) {`,
);

console.log(`Patched ${[...new Set(changed)].join(', ')}`);
