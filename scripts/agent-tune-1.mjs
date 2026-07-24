import { readFile, writeFile } from 'node:fs/promises';

async function replaceExact(path, before, after, expectedCount = 1) {
  const source = await readFile(path, 'utf8');
  if (source.includes(after) && !source.includes(before)) return false;
  const count = source.split(before).length - 1;
  if (count !== expectedCount)
    throw new Error(`${path}: expected ${expectedCount} occurrences, found ${count}: ${before.slice(0, 100)}`);
  await writeFile(path, source.split(before).join(after), 'utf8');
  return true;
}

const changed = [];
async function patch(path, before, after, expectedCount = 1) {
  if (await replaceExact(path, before, after, expectedCount)) changed.push(path);
}

await patch(
  'src/engine/game.ts',
  `      let attemptRate = clamp(((runnerPlayer?.p.sp || 50) - 30) / 140, 0.03, 0.35);`,
  `      let attemptRate = clamp(((runnerPlayer?.p.sp || 50) - 30) / 260, 0.015, 0.2);`,
);

await patch(
  'src/engine/players.ts',
  `function generateRosterQuality(baseDevelopment: number): number {
  let quality = clamp(gaussian(baseDevelopment * 0.75, 14), 28, 90);
  if (random() < 0.08) quality = clamp(gaussian(baseDevelopment * 0.75 + 18, 9), 55, 108);
  if (random() < 0.015) quality = clamp(gaussian(baseDevelopment * 0.75 + 32, 7), 82, 122);
  return quality;
}`,
  `function generateRosterQuality(baseDevelopment: number): number {
  let quality = clamp(gaussian(baseDevelopment * 0.75, 15), 28, 92);
  const tierRoll = random();
  if (tierRoll < 0.025)
    quality = clamp(gaussian(baseDevelopment * 0.75 + 68, 8), 100, 145);
  else if (tierRoll < 0.125)
    quality = clamp(gaussian(baseDevelopment * 0.75 + 45, 10), 78, 128);
  return quality;
}`,
);

await patch(
  'src/engine/players.ts',
  `          clamp(gaussian(bd * 0.75, 12), 35, 98),`,
  `          generateRosterQuality(bd),`,
  2,
);

await patch(
  'scripts/balance-new-engine.ts',
  `    battingById = new Map(batting.map((line) => [line.id, line])),`,
  `    battingById = new Map(
      Object.entries(accumulatedStats).filter((entry): entry is [string, PlayerStats] => entry[1].type === 'bat'),
    ),`,
);

console.log(`Tuned ${[...new Set(changed)].join(', ')}`);
