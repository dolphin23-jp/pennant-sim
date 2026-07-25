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
  PLAYER_DEVELOPMENT_BALANCE,
  PS,
  SN,
  TINFO,
} from '../data';
import { clamp, gaussian, random, randomChoice, randomInt, uid, weightedRandom } from './random';
import { calcOVR } from './ratings';
import { syncSpecialsFromLevels } from './specials';
import type {
  FieldPosition,
  Maturity,
  PitcherRole,
  Player,
  PlayerParams,
  PotentialClass,
  PlayerTeamKey,
  PositionAptitude,
  SpecialAbility,
  TeamKey,
  Teams,
} from './types';
const usedNames = new Set<string>();
const japaneseName = (): string => `${randomChoice(SN)} ${randomChoice(GN)}`;
const foreignName = (): string => `${randomChoice(FOREIGN_SN)} ${randomChoice(FOREIGN_GN)}`;
function generatedName(baseName: () => string): string {
  for (let attempt = 0; attempt < 48; attempt += 1) {
    const candidate = baseName();
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
  }
  // Same-name players are valid and remain distinct through Player.id.
  const duplicate = baseName();
  usedNames.add(duplicate);
  return duplicate;
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
function generatePotential(
  value: number,
  margin: number | undefined,
  potentialClass: PotentialClass,
  latentDevelopment = 0,
): number {
  if (potentialClass === 'elite')
    return clamp(
      Math.max(value + 15, value + Math.round(latentDevelopment + gaussian(42, 11))),
      value,
      140,
    );
  const base = Math.max(7, (margin || 20) - 8);
  return clamp(
    Math.max(value + 5, value + Math.round(latentDevelopment + gaussian(base, 5))),
    value,
    125,
  );
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
      profileValues.reduce((sum, value) => sum + (value - mean) ** 2, 0) / profileValues.length,
    standardDeviation = Math.max(8, Math.sqrt(variance)),
    relatedMean = relatedValues.reduce((sum, value) => sum + value, 0) / relatedValues.length,
    relativeScore = (relatedMean - mean) / standardDeviation;
  return clamp(1 + relativeScore, 0.25, 3);
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
  const latentQuality =
      Math.max(0, quality - effectiveQuality) *
      PLAYER_DEVELOPMENT_BALANCE.careerCurve.latentDevelopmentShare,
    velocity = clamp(
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
  const params: PlayerParams = {
    vel: velocity,
    ctrl: control,
    stam: stamina,
    nobi: movement,
    fld: fielding,
    pitches,
  };
  const specialLevels = pickSpecialAbilities([...PS, ...CS2], quality, params),
    potentialClass: PotentialClass = random() < 0.025 ? 'elite' : 'standard';
  const potential = {
    vel: generatePotential(velocity, undefined, potentialClass, latentQuality * 0.93),
    ctrl: generatePotential(control, 18, potentialClass, latentQuality * 0.91),
    stam: generatePotential(
      stamina,
      15,
      potentialClass,
      latentQuality * (role === '先発' ? 0.9 : 0.65),
    ),
    nobi: generatePotential(movement, 18, potentialClass, latentQuality * 0.8),
    fld: generatePotential(fielding, 15, potentialClass, latentQuality * 0.75),
  };
  return syncSpecialsFromLevels({
    id: uid(),
    name: generatedName(teamKey === 'foreign' || teamKey === '外' ? foreignName : japaneseName),
    age,
    tk: teamKey,
    isP: true,
    role,
    mat: maturity,
    hand: { th: random() < 0.87 ? '右' : '左' },
    p: params,
    specialLevels,
    pot: potential,
    potentialClass,
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
    latentQuality =
      Math.max(0, quality - effectiveQuality) *
      PLAYER_DEVELOPMENT_BALANCE.careerCurve.latentDevelopmentShare,
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
    ),
    potentialClass: PotentialClass = random() < 0.025 ? 'elite' : 'standard';
  const potential = {
    cf: generatePotential(
      contactFastball,
      undefined,
      potentialClass,
      latentQuality * adjustment * 0.92,
    ),
    cb: generatePotential(
      contactBreaking,
      undefined,
      potentialClass,
      latentQuality * adjustment * 0.9,
    ),
    pw: generatePotential(power, undefined, potentialClass, latentQuality * adjustment * 0.88),
    dc: generatePotential(discipline, undefined, potentialClass, latentQuality * 0.85),
    sp: generatePotential(speed, undefined, potentialClass, latentQuality * 0.87),
    df: generatePotential(
      fielding,
      undefined,
      potentialClass,
      latentQuality * (adjustment < 0.95 ? 0.92 : 0.82),
    ),
    arm: generatePotential(arm, undefined, potentialClass, latentQuality * 0.82),
    stam: generatePotential(stamina, undefined, potentialClass, latentQuality * 0.85),
    ...(position === '捕手'
      ? { ld: generatePotential(gameCalling, 22, potentialClass, latentQuality * 0.85) }
      : {}),
  };
  return syncSpecialsFromLevels({
    id: uid(),
    name: generatedName(teamKey === 'foreign' || teamKey === '外' ? foreignName : japaneseName),
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
    potentialClass,
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
  const baseMean = baseDevelopment * 0.75,
    tierRoll = random();
  if (tierRoll < 0.025) return clamp(gaussian(baseMean + 95, 6), 125, 160);
  if (tierRoll < 0.125) return clamp(gaussian(baseMean + 65, 8), 105, 140);
  return clamp(gaussian(baseMean, 15), 28, 92);
}
function ensureMinimumRosterStars(
  teamKey: TeamKey,
  pitchers: Player[],
  fielders: Player[],
): { pitchers: Player[]; fielders: Player[] } {
  const nextPitchers = [...pitchers],
    nextFielders = [...fielders],
    preferredPositions: FieldPosition[] = ['一塁手', '左翼手', '右翼手', '三塁手', '中堅手'];
  let starCount =
    nextPitchers.filter((player) => calcOVR(player) >= 85).length +
    nextFielders.filter((player) => calcOVR(player, player.pos) >= 85).length;
  const candidates = nextFielders
    .map((player, index) => ({
      player,
      index,
      positionPriority: preferredPositions.indexOf(player.pos as FieldPosition),
    }))
    .filter(({ player }) => calcOVR(player, player.pos) < 85)
    .sort(
      (first, second) =>
        (first.positionPriority < 0 ? 99 : first.positionPriority) -
          (second.positionPriority < 0 ? 99 : second.positionPriority) ||
        Math.abs(first.player.age - 27) - Math.abs(second.player.age - 27),
    );
  for (const { player: original, index } of candidates) {
    if (starCount >= 2) break;
    let replacement = original;
    for (
      let attempt = 0;
      attempt < 10 && calcOVR(replacement, replacement.pos) < 85;
      attempt += 1
    ) {
      const candidate = generateBatter(teamKey, original.age, original.pos as FieldPosition, 190);
      if (calcOVR(candidate, candidate.pos) > calcOVR(replacement, replacement.pos))
        replacement = candidate;
    }
    nextFielders[index] = replacement;
    if (calcOVR(replacement, replacement.pos) >= 85) starCount += 1;
  }
  return { pitchers: nextPitchers, fielders: nextFielders };
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
          generateRosterQuality(bd),
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
          generateRosterQuality(bd),
        ),
      );
      const starredRoster = ensureMinimumRosterStars(teamKey, pitchers, fielders);
      return [
        teamKey,
        {
          ...TINFO[teamKey],
          key: teamKey,
          pitchers: starredRoster.pitchers,
          fielders: starredRoster.fielders,
          rotSize: 6,
        },
      ];
    }),
  ) as Teams;
}
export const allTeamKeys = (): TeamKey[] => [...CENTRAL, ...PACIFIC];
