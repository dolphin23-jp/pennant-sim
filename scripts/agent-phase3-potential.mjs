import { readFile, writeFile } from 'node:fs/promises';

async function update(path, transform) {
  const source = await readFile(path, 'utf8');
  const next = transform(source);
  if (next === source) return;
  await writeFile(path, next, 'utf8');
}

await update('src/engine/types.ts', (source) => {
  let next = source;
  if (!next.includes("export type PotentialClass = 'standard' | 'elite';"))
    next = next.replace(
      "export type Maturity = '超早熟' | '早熟' | '通常' | '晩成' | '超晩成';",
      "export type Maturity = '超早熟' | '早熟' | '通常' | '晩成' | '超晩成';\nexport type PotentialClass = 'standard' | 'elite';",
    );
  if (!next.includes('  potentialClass?: PotentialClass;'))
    next = next.replace(
      '  pot: PotentialParams;\n',
      '  pot: PotentialParams;\n  potentialClass?: PotentialClass;\n',
    );
  return next;
});

await update('src/engine/players.ts', (source) => {
  let next = source;
  if (!next.includes('  PotentialClass,'))
    next = next.replace('  PlayerParams,\n', '  PlayerParams,\n  PotentialClass,\n');
  next = next.replace(
    /function generatePotential\([\s\S]*?\n\}/,
    `function generatePotential(
  value: number,
  margin: number | undefined,
  potentialClass: PotentialClass,
): number {
  if (potentialClass === 'elite')
    return Math.max(value + 15, value + Math.round(gaussian(48, 12)));
  const base = Math.max(7, (margin || 20) - 8);
  return Math.max(value + 5, value + Math.round(gaussian(base, 5)));
}`,
  );

  next = next.replace(
    `  const specialLevels = pickSpecialAbilities([...PS, ...CS2], quality);
  const potential = {
    vel: generatePotential(velocity),
    ctrl: generatePotential(control, 18),
    stam: generatePotential(stamina, 15),
    nobi: generatePotential(movement, 18),
    fld: generatePotential(fielding, 15),
  };`,
    `  const specialLevels = pickSpecialAbilities([...PS, ...CS2], quality),
    potentialClass: PotentialClass = random() < 0.05 ? 'elite' : 'standard';
  const potential = {
    vel: generatePotential(velocity, undefined, potentialClass),
    ctrl: generatePotential(control, 18, potentialClass),
    stam: generatePotential(stamina, 15, potentialClass),
    nobi: generatePotential(movement, 18, potentialClass),
    fld: generatePotential(fielding, 15, potentialClass),
  };`,
  );
  next = next.replace(
    `    p: params,
    specialLevels,
    pot: potential,`,
    `    p: params,
    specialLevels,
    pot: potential,
    potentialClass,`,
  );

  next = next.replace(
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
  };`,
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
    ...(position === '捕手'
      ? { ld: generatePotential(gameCalling, 22, potentialClass) }
      : {}),
  };`,
  );
  const batterReturnMarker = `    specialLevels,
    pot: potential,
    trainPolicy: 'balanced',`;
  if (next.includes(batterReturnMarker))
    next = next.replace(
      batterReturnMarker,
      `    specialLevels,
    pot: potential,
    potentialClass,
    trainPolicy: 'balanced',`,
    );

  const classAssignments = next.match(/potentialClass: PotentialClass = random\(\) < 0\.05/g) ?? [];
  const storedClasses = next.match(/^\s+potentialClass,$/gm) ?? [];
  if (classAssignments.length !== 2 || storedClasses.length !== 2)
    throw new Error('Potential class was not connected exactly once to each player generator');
  if (
    next.includes('generatePotential(velocity)') ||
    next.includes('generatePotential(contactFastball)')
  )
    throw new Error('Legacy potential call sites remain');
  return next;
});

console.log('Applied player-level elite potential distribution.');
