import { readFile, writeFile } from 'node:fs/promises';

const path = 'src/engine/players.ts';
const source = await readFile(path, 'utf8');
const qualityFunction = `function generateRosterQuality(baseDevelopment: number): number {
  const baseMean = baseDevelopment * 0.75,
    tierRoll = random();
  if (tierRoll < 0.025) return clamp(gaussian(baseMean + 95, 6), 125, 160);
  if (tierRoll < 0.125) return clamp(gaussian(baseMean + 65, 8), 105, 140);
  return clamp(gaussian(baseMean, 15), 28, 92);
}`;
const next = source.replace(
  /function generateRosterQuality\([\s\S]*?\n\}/,
  qualityFunction,
);
if (next === source) throw new Error('Roster quality function was not updated');
await writeFile(path, next, 'utf8');
console.log('Raised phase 2 upper quality tiers.');
