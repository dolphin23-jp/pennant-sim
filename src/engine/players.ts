import {
  BS,
  CATCH_SP,
  CENTRAL,
  CS2,
  FIELD_POSITIONS,
  FOREIGN_GN,
  FOREIGN_SN,
  GN,
  MATURITY_PEAK_AGE,
  MATURITY_TYPES,
  MATURITY_WEIGHTS,
  PACIFIC,
  PITCH_TYPES,
  PS,
  SN,
  TINFO,
} from '../data';
import { clamp, gaussian, random, randomChoice, randomInt, uid, weightedRandom } from './random';
import { syncSpecialsFromLevels } from './specials';
import type {
  FieldPosition,
  Maturity,
  PitcherRole,
  Player,
  PlayerParams,
  PlayerTeamKey,
  PositionAptitude,
  SpecialAbility,
  TeamKey,
  Teams,
} from './types';
const usedNames = new Set<string>();
const japaneseName = (): string => `${randomChoice(SN)} ${randomChoice(GN)}`;
const foreignName = (): string => `${randomChoice(FOREIGN_SN)} ${randomChoice(FOREIGN_GN)}`;
function uniqueName(baseName: () => string): string {
  for (let attempt = 0; attempt < 48; attempt += 1) {
    const candidate = baseName();
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
  }
  const fallback = `${baseName()}#${String(randomInt(10, 99))}`;
  usedNames.add(fallback);
  return fallback;
}
export function registerExistingNames(teams: Partial<Teams>): void {
  usedNames.clear();
  for (const team of Object.values(teams)) {
    for (const player of [...(team?.fielders ?? []), ...(team?.pitchers ?? [])])
      if (player.name) usedNames.add(player.name);
  }
}
function maturityModifier(age: number, maturity: Maturity): number {
  const years = age - MATURITY_PEAK_AGE[maturity];
  if (years < -4) return clamp(0.68 + (years + 4) * 0.056, 0.4, 1);
  if (years < 0) return clamp(0.8 + years * 0.05, 0.6, 1);
  if (years <= 2) return clamp(1 - years * 0.03, 0.8, 1);
  return clamp(0.94 - (years - 2) * 0.048, 0.4, 0.94);
}
function generatePotential(value: number, margin?: number): number {
  const base = margin || 22;
  if (random() < 0.05)
    return Math.max(value + 15, value + Math.round(gaussian(48, 12)));
  return Math.max(value + 5, value + Math.round(gaussian(base, 11)));
}
function generateSecondaryPositions(primary: FieldPosition): PositionAptitude[] {
  const rules: Partial<
    Record<
      FieldPosition,
      Array<{ pos: FieldPosition; probability: number; aptitude: [number, number] }>
    >
  > = {
    捕手: [{ pos: '一塁手', probability: 0.3, aptitude: [40, 65] }],
    一塁手: [
      { pos: '三塁手', probability: 0.25, aptitude: [50, 70] },
      { pos: '左翼手', probability: 0.3, aptitude: [55, 75] },
      { pos: '右翼手', probability: 0.25, aptitude: [55, 75] },
    ],
    二塁手: [
      { pos: '遊撃手', probability: 0.5, aptitude: [55, 78] },
      { pos: '三塁手', probability: 0.4, aptitude: [50, 72] },
    ],
    三塁手: [
      { pos: '一塁手', probability: 0.35, aptitude: [55, 75] },
      { pos: '遊撃手', probability: 0.3, aptitude: [50, 70] },
      { pos: '二塁手', probability: 0.3, aptitude: [50, 70] },
    ],
    遊撃手: [
      { pos: '三塁手', probability: 0.55, aptitude: [60, 82] },
      { pos: '二塁手', probability: 0.5, aptitude: [60, 80] },
    ],
    左翼手: [
      { pos: '右翼手', probability: 0.72, aptitude: [65, 90] },
      { pos: '中堅手', probability: 0.4, aptitude: [55, 75] },
    ],
    中堅手: [
      { pos: '左翼手', probability: 0.8, aptitude: [70, 93] },
      { pos: '右翼手', probability: 0.8, aptitude: [70, 93] },
    ],
    右翼手: [
      { pos: '左翼手', probability: 0.72, aptitude: [65, 90] },
      { pos: '中堅手', probability: 0.4, aptitude: [55, 75] },
    ],
  };
  const positions: PositionAptitude[] = [{ pos: primary, apt: 100 }];
  for (const rule of rules[primary] ?? [])
    if (random() < rule.probability)
      positions.push({ pos: rule.pos, apt: randomInt(rule.aptitude[0], rule.aptitude[1]) });
  return positions;
}
const SPECIAL_PROFILE_PARAMS: Record<string, Array<keyof PlayerParams>> = {
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
}
export function generatePitcher(
  teamKey: PlayerTeamKey,
  age: number,
  quality: number,
  roleHint?: PitcherRole,
): Player {
  const maturity = weightedRandom(MATURITY_TYPES, MATURITY_WEIGHTS),
    effectiveQuality = quality * maturityModifier(age, maturity),
    role = roleHint ?? (random() < 0.5 ? '先発' : random() < 0.45 ? 'リリーフ' : 'クローザー');
  const velocity = clamp(
      Math.round(gaussian(effectiveQuality * 0.93, 7) - (age > 31 ? (age - 31) * 1.2 : 0)),
      25,
      115,
    ),
    control = clamp(Math.round(gaussian(effectiveQuality * 0.91, 9)), 20, 112),
    stamina =
      role === '先発'
        ? clamp(Math.round(gaussian(effectiveQuality * 0.9, 10)), 25, 110)
        : clamp(Math.round(gaussian(effectiveQuality * 0.65, 12)), 20, 95),
    movement = clamp(Math.round(gaussian(effectiveQuality * 0.8, 12)), 18, 112),
    fielding = clamp(Math.round(gaussian(effectiveQuality * 0.75, 10)), 15, 105);
  const secondary = PITCH_TYPES.filter((type) => type !== '直球').sort(() => random() - 0.5),
    pitches = [
      {
        type: '直球',
        shr: velocity,
        brk: 0,
        ctl: clamp(Math.round(gaussian(control, 8)), 20, 105),
      },
    ];
  for (let index = 0; index < randomInt(1, 4); index += 1)
    pitches.push({
      type: secondary[index] as string,
      shr: clamp(Math.round(gaussian(effectiveQuality * 0.78, 12)), 15, 110),
      brk: clamp(Math.round(gaussian(effectiveQuality * 0.82, 10)), 15, 110),
      ctl: clamp(Math.round(gaussian(control * 0.85, 10)), 15, 105),
    });
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
  };
  const specialLevels = pickSpecialAbilities([...PS, ...CS2], quality, params);
  return syncSpecialsFromLevels({
    id: uid(),
    name: uniqueName(teamKey === 'foreign' || teamKey === '外' ? foreignName : japaneseName),
    age,
    tk: teamKey,
    isP: true,
    role,
    mat: maturity,
    hand: { th: random() < 0.87 ? '右' : '左' },
    p: params,
    specialLevels,
    pot: potential,
    trainPolicy: 'balanced',
    fatigue: 0,
    awakeCount: 0,
    seasonAwakenDone: false,
  });
}
export function generateBatter(
  teamKey: PlayerTeamKey,
  age: number,
  position: FieldPosition,
  quality: number,
): Player {
  const maturity = weightedRandom(MATURITY_TYPES, MATURITY_WEIGHTS),
    effectiveQuality = quality * maturityModifier(age, maturity);
  const positionAdjustment: Record<FieldPosition, number> = {
    捕手: 0.83,
    遊撃手: 0.87,
    二塁手: 0.9,
    三塁手: 0.95,
    一塁手: 1.06,
    左翼手: 1.02,
    中堅手: 0.95,
    右翼手: 1.04,
  };
  const adjustment = positionAdjustment[position] || 1,
    bias = gaussian(0, 13);
  const contactFastball = clamp(
      Math.round(gaussian(effectiveQuality * adjustment * 0.92 + bias * 0.3, 11)),
      18,
      115,
    ),
    contactBreaking = clamp(
      Math.round(gaussian(effectiveQuality * adjustment * 0.9 + bias * 0.3, 11)),
      18,
      115,
    ),
    power = clamp(
      Math.round(gaussian(effectiveQuality * adjustment * 0.88 + bias * 0.5, 14)),
      15,
      120,
    ),
    discipline = clamp(Math.round(gaussian(effectiveQuality * 0.85, 10)), 18, 112),
    speed = clamp(
      Math.round(gaussian(effectiveQuality * 0.87 - (age > 30 ? (age - 30) * 1.5 : 0), 12)),
      18,
      112,
    ),
    fielding = clamp(
      Math.round(gaussian(effectiveQuality * (adjustment < 0.95 ? 0.92 : 0.82), 11)),
      18,
      112,
    ),
    arm = clamp(Math.round(gaussian(effectiveQuality * 0.82, 12)), 15, 112),
    stamina = clamp(Math.round(gaussian(effectiveQuality * 0.85, 10)), 18, 108),
    bunt = clamp(Math.round(gaussian(50, 15)), 15, 105);
  const catcherAgeMultiplier =
      age <= 22 ? 0.75 : age <= 26 ? 0.88 : age <= 31 ? 1 : age <= 35 ? 1.03 : 1.01,
    gameCalling =
      position === '捕手'
        ? clamp(Math.round(gaussian(effectiveQuality * 0.85, 12) * catcherAgeMultiplier), 20, 108)
        : 0;
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
  return syncSpecialsFromLevels({
    id: uid(),
    name: uniqueName(teamKey === 'foreign' || teamKey === '外' ? foreignName : japaneseName),
    age,
    tk: teamKey,
    pos: position,
    positions: generateSecondaryPositions(position),
    isP: false,
    mat: maturity,
    hand: { bat: random() < 0.7 ? '右' : random() < 0.52 ? '左' : '両' },
    p: {
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
    },
    specialLevels,
    pot: potential,
    trainPolicy: 'balanced',
    awakeCount: 0,
    seasonAwakenDone: false,
  });
}
function ageDistribution(
  count: number,
  minAge = 18,
  maxAge = 38,
  peakStart = 24,
  peakEnd = 30,
): number[] {
  const ages: number[] = [];
  for (let age = minAge; age <= maxAge; age += 1) {
    const probability =
      age < peakStart
        ? 0.025 + (age - minAge) * 0.008
        : age <= peakEnd
          ? 0.08
          : Math.max(0.008, 0.08 - (age - peakEnd) * 0.012);
    for (let index = 0; index < Math.ceil(probability * count * 1.5); index += 1) ages.push(age);
  }
  while (ages.length > count) ages.splice(randomInt(0, ages.length - 1), 1);
  while (ages.length < count) ages.push(randomInt(minAge, maxAge));
  return ages.sort(() => random() - 0.5);
}
function generateRosterQuality(baseDevelopment: number): number {
  let quality = clamp(gaussian(baseDevelopment * 0.75, 14), 28, 90);
  if (random() < 0.08)
    quality = clamp(gaussian(baseDevelopment * 0.75 + 18, 9), 55, 108);
  if (random() < 0.015)
    quality = clamp(gaussian(baseDevelopment * 0.75 + 32, 7), 82, 122);
  return quality;
}
export function initTeams(): Teams {
  registerExistingNames({});
  return Object.fromEntries(
    [...CENTRAL, ...PACIFIC].map((teamKey) => {
      const { bd } = TINFO[teamKey],
        pitcherAges = ageDistribution(28, 18, 38, 23, 30);
      const pitchers = pitcherAges.map((age, index, all) =>
        generatePitcher(
          teamKey,
          age,
          clamp(gaussian(bd * 0.75, 12), 35, 98),
          index / all.length < 0.46
            ? '先発'
            : index / all.length < 0.75
              ? 'リリーフ'
              : 'クローザー',
        ),
      );
      const positionPool = FIELD_POSITIONS.flatMap(
        (position) => Array(5).fill(position) as FieldPosition[],
      ).sort(() => random() - 0.5);
      const fielders = ageDistribution(35, 18, 37, 24, 29).map((age, index) =>
        generateBatter(
          teamKey,
          age,
          positionPool[index % positionPool.length] as FieldPosition,
          clamp(gaussian(bd * 0.75, 12), 35, 98),
        ),
      );
      return [teamKey, { ...TINFO[teamKey], key: teamKey, pitchers, fielders, rotSize: 6 }];
    }),
  ) as Teams;
}
export const allTeamKeys = (): TeamKey[] => [...CENTRAL, ...PACIFIC];
