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
  'src/engine/players.ts',
  `function generatePotential(value: number, margin?: number): number {
  return Math.max(value + 5, value + Math.round(gaussian(margin || 20, 8)));
}`,
  `function generatePotential(value: number, margin?: number): number {
  const base = margin || 22;
  if (random() < 0.05)
    return Math.max(value + 15, value + Math.round(gaussian(48, 12)));
  return Math.max(value + 5, value + Math.round(gaussian(base, 11)));
}`,
);

await patch(
  'src/engine/players.ts',
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
      profileValues.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
      profileValues.length,
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

await patch(
  'src/engine/players.ts',
  `  const specialLevels = pickSpecialAbilities([...PS, ...CS2], quality);
  const potential = {
    vel: generatePotential(velocity),
    ctrl: generatePotential(control, 18),
    stam: generatePotential(stamina, 15),
    nobi: generatePotential(movement, 18),
    fld: generatePotential(fielding, 15),
  };
  const params: PlayerParams = {
    vel: velocity,
    ctrl: control,
    stam: stamina,
    nobi: movement,
    fld: fielding,
    pitches,
  };`,
  `  const potential = {
    vel: generatePotential(velocity),
    ctrl: generatePotential(control, 18),
    stam: generatePotential(stamina, 15),
    nobi: generatePotential(movement, 18),
    fld: generatePotential(fielding, 15),
  };
  const params: PlayerParams = {
    vel: velocity,
    ctrl: control,
    stam: stamina,
    nobi: movement,
    fld: fielding,
    pitches,
  };
  const specialLevels = pickSpecialAbilities([...PS, ...CS2], quality, params);`,
);

await patch(
  'src/engine/players.ts',
  `  const specialLevels = pickSpecialAbilities(
    [...BS, ...CS2, ...(position === '捕手' ? CATCH_SP : [])],
    quality,
  );
  const potential = {
    cf: generatePotential(contactFastball),
    cb: generatePotential(contactBreaking),
    pw: generatePotential(power),
    dc: generatePotential(discipline),
    sp: generatePotential(speed),
    df: generatePotential(fielding),
    arm: generatePotential(arm),
    stam: generatePotential(stamina),
    ...(position === '捕手' ? { ld: generatePotential(gameCalling, 22) } : {}),
  };
  return syncSpecialsFromLevels({`,
  `  const potential = {
    cf: generatePotential(contactFastball),
    cb: generatePotential(contactBreaking),
    pw: generatePotential(power),
    dc: generatePotential(discipline),
    sp: generatePotential(speed),
    df: generatePotential(fielding),
    arm: generatePotential(arm),
    stam: generatePotential(stamina),
    ...(position === '捕手' ? { ld: generatePotential(gameCalling, 22) } : {}),
  };
  const params: PlayerParams = {
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
  );
  return syncSpecialsFromLevels({`,
);

await patch(
  'src/engine/players.ts',
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

await patch(
  'src/engine/players.ts',
  `export function initTeams(): Teams {
  registerExistingNames({});`,
  `function generateRosterQuality(baseDevelopment: number): number {
  let quality = clamp(gaussian(baseDevelopment * 0.75, 14), 28, 90);
  if (random() < 0.08)
    quality = clamp(gaussian(baseDevelopment * 0.75 + 18, 9), 55, 108);
  if (random() < 0.015)
    quality = clamp(gaussian(baseDevelopment * 0.75 + 32, 7), 82, 122);
  return quality;
}
export function initTeams(): Teams {
  registerExistingNames({});`,
);

await patch(
  'src/engine/players.ts',
  `          clamp(gaussian(bd * 0.75, 12), 35, 98),`,
  `          generateRosterQuality(bd),`,
);
await patch(
  'src/engine/players.ts',
  `          clamp(gaussian(bd * 0.75, 12), 35, 98),`,
  `          generateRosterQuality(bd),`,
);

console.log(`Patched ${[...new Set(changed)].join(', ')}`);
