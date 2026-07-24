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

const playerPath = 'src/engine/players.ts';

await replaceOnce(
  playerPath,
  `function pickSpecialAbilities(pool: SpecialAbility[], quality: number): Record<string, number> {
  const levels: Record<string, number> = {},
    conflicts = [
      ['po', 'px'],
      ['ldo', 'ldx'],
      ['co', 'cx'],
      ['fbo', 'fbx'],
    ];
  const has = (id: string) => (levels[id] ?? 0) > 0;
  for (const special of pool) {
    if (random() >= special.p * Math.sqrt(quality / 50)) continue;
    if (
      conflicts.some(
        (group) => group.includes(special.id) && group.some((id) => id !== special.id && has(id)),
      )
    )
      continue;
    levels[special.id] =
      special.rarity === 'gold'
        ? 1
        : randomInt(1, Math.max(1, Math.min(special.tierMax, Math.round(quality / 18))));
  }
  return levels;
}`,
  `const SPECIAL_PROFILE_PARAMS: Record<string, Array<keyof PlayerParams>> = {
  nobi: ['nobi', 'vel'],
  kire: ['vel', 'nobi'],
  kire_gold: ['vel', 'nobi'],
  kk: ['vel', 'nobi'],
  kk_gold: ['vel', 'nobi'],
  heavy: ['vel', 'nobi'],
  heavy_gold: ['vel', 'nobi'],
  low: ['ctrl'],
  cnr: ['ctrl'],
  cnr_gold: ['ctrl'],
  gb: ['nobi', 'ctrl'],
  tough: ['stam'],
  iron: ['stam'],
  avg: ['cf', 'cb'],
  avg_gold: ['cf', 'cb'],
  spray: ['cf', 'cb'],
  spray_gold: ['cf', 'cb'],
  oppo: ['cf', 'cb'],
  pull: ['pw'],
  slugger_gold: ['pw'],
  eye: ['dc'],
  eye_gold: ['dc'],
  run: ['sp'],
  sb: ['sp'],
  sb_gold: ['sp'],
  bnt: ['bnt'],
  strong_arm: ['arm'],
  ld_art: ['ld'],
};
function specialProfileMultiplier(specialId: string, params: PlayerParams): number {
  const related = SPECIAL_PROFILE_PARAMS[specialId];
  if (!related?.length) return 1;
  const profileValues = Object.entries(params)
    .filter(
      ([key, value]) =>
        key !== 'pitches' && typeof value === 'number' && (key !== 'ld' || Number(value) > 0),
    )
    .map(([, value]) => Number(value));
  const relatedValues = related
    .map((key) => params[key])
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (!profileValues.length || !relatedValues.length) return 1;
  const mean = profileValues.reduce((sum, value) => sum + value, 0) / profileValues.length,
    variance =
      profileValues.reduce((sum, value) => sum + (value - mean) ** 2, 0) / profileValues.length,
    standardDeviation = Math.max(8, Math.sqrt(variance)),
    relatedMean = relatedValues.reduce((sum, value) => sum + value, 0) / relatedValues.length,
    relativeScore = (relatedMean - mean) / standardDeviation;
  return clamp(1 + relativeScore * 0.38, 0.55, 1.85);
}
function pickSpecialAbilities(
  pool: SpecialAbility[],
  quality: number,
  params: PlayerParams,
): Record<string, number> {
  const levels: Record<string, number> = {},
    conflicts = [
      ['po', 'px'],
      ['ldo', 'ldx'],
      ['co', 'cx'],
      ['fbo', 'fbx'],
    ];
  const has = (id: string) => (levels[id] ?? 0) > 0;
  for (const special of pool) {
    const probability = clamp(
      special.p * Math.sqrt(quality / 50) * specialProfileMultiplier(special.id, params),
      0,
      0.9,
    );
    if (random() >= probability) continue;
    if (
      conflicts.some(
        (group) => group.includes(special.id) && group.some((id) => id !== special.id && has(id)),
      )
    )
      continue;
    levels[special.id] =
      special.rarity === 'gold'
        ? 1
        : randomInt(1, Math.max(1, Math.min(special.tierMax, Math.round(quality / 18))));
  }
  return levels;
}`,
);

await replaceOnce(
  playerPath,
  `  const specialLevels = pickSpecialAbilities([...PS, ...CS2], quality),
    potentialClass: PotentialClass = random() < 0.05 ? 'elite' : 'standard';
  const potential = {
    vel: generatePotential(velocity, undefined, potentialClass),
    ctrl: generatePotential(control, 18, potentialClass),
    stam: generatePotential(stamina, 15, potentialClass),
    nobi: generatePotential(movement, 18, potentialClass),
    fld: generatePotential(fielding, 15, potentialClass),
  };
  const params: PlayerParams = {
    vel: velocity,
    ctrl: control,
    stam: stamina,
    nobi: movement,
    fld: fielding,
    pitches,
  };`,
  `  const params: PlayerParams = {
    vel: velocity,
    ctrl: control,
    stam: stamina,
    nobi: movement,
    fld: fielding,
    pitches,
  };
  const specialLevels = pickSpecialAbilities([...PS, ...CS2], quality, params),
    potentialClass: PotentialClass = random() < 0.05 ? 'elite' : 'standard';
  const potential = {
    vel: generatePotential(velocity, undefined, potentialClass),
    ctrl: generatePotential(control, 18, potentialClass),
    stam: generatePotential(stamina, 15, potentialClass),
    nobi: generatePotential(movement, 18, potentialClass),
    fld: generatePotential(fielding, 15, potentialClass),
  };`,
);

await replaceOnce(
  playerPath,
  `  const specialLevels = pickSpecialAbilities(
      [...BS, ...CS2, ...(position === '捕手' ? CATCH_SP : [])],
      quality,
    ),
    potentialClass: PotentialClass = random() < 0.05 ? 'elite' : 'standard';
  const potential = {
    cf: generatePotential(contactFastball, undefined, potentialClass),
    cb: generatePotential(contactBreaking, undefined, potentialClass),
    pw: generatePotential(power, undefined, potentialClass),
    dc: generatePotential(discipline, undefined, potentialClass),
    sp: generatePotential(speed, undefined, potentialClass),
    df: generatePotential(fielding, undefined, potentialClass),
    arm: generatePotential(arm, undefined, potentialClass),
    stam: generatePotential(stamina, undefined, potentialClass),
    ...(position === '捕手' ? { ld: generatePotential(gameCalling, 22, potentialClass) } : {}),
  };`,
  `  const params: PlayerParams = {
    cf: contactFastball,
    cb: contactBreaking,
    pw: power,
    dc: discipline,
    sp: speed,
    df: fielding,
    arm,
    stam: stamina,
    bnt: bunt,
    ld: gameCalling,
  };
  const specialLevels = pickSpecialAbilities(
      [...BS, ...CS2, ...(position === '捕手' ? CATCH_SP : [])],
      quality,
      params,
    ),
    potentialClass: PotentialClass = random() < 0.05 ? 'elite' : 'standard';
  const potential = {
    cf: generatePotential(contactFastball, undefined, potentialClass),
    cb: generatePotential(contactBreaking, undefined, potentialClass),
    pw: generatePotential(power, undefined, potentialClass),
    dc: generatePotential(discipline, undefined, potentialClass),
    sp: generatePotential(speed, undefined, potentialClass),
    df: generatePotential(fielding, undefined, potentialClass),
    arm: generatePotential(arm, undefined, potentialClass),
    stam: generatePotential(stamina, undefined, potentialClass),
    ...(position === '捕手' ? { ld: generatePotential(gameCalling, 22, potentialClass) } : {}),
  };`,
);

await replaceOnce(
  playerPath,
  `    p: {
      cf: contactFastball,
      cb: contactBreaking,
      pw: power,
      dc: discipline,
      sp: speed,
      df: fielding,
      arm,
      stam: stamina,
      bnt: bunt,
      ld: gameCalling,
    },`,
  `    p: params,`,
);

const testPath = 'tests/special-profile.test.ts';
const testContent = `import assert from 'node:assert/strict';
import test from 'node:test';
import {
  configureRandom,
  generateBatter,
  generatePitcher,
  resetRandom,
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
  assert.ok(holders.length > 20, \
    \`Too few holders for \${ids.join(', ')}: \${holders.length}\`);
  const difference = average(holders.map(rating)) - average(others.map(rating));
  assert.ok(difference > minimumDifference, \
    \`\${ids.join(', ')} profile difference was only \${difference.toFixed(2)}\`);
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
`;
try {
  const existing = await readFile(testPath, 'utf8');
  if (existing !== testContent) throw new Error(`${testPath} already exists with different content`);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
  await writeFile(testPath, testContent, 'utf8');
}

const updated = await readFile(playerPath, 'utf8');
if (!updated.includes('specialProfileMultiplier') || !updated.includes('quality, params'))
  throw new Error('Special-profile generation was not fully connected');
console.log('Applied phase 5 special-profile generation.');
