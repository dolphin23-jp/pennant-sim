import { readFile, writeFile } from 'node:fs/promises';

const path = 'src/engine/market.ts';
const source = await readFile(path, 'utf8');
const compact = `function generateMarketQuality(base: number, standardDeviation: number, minimum: number, maximum: number): number {
  let quality = clamp(gaussian(base, standardDeviation), minimum, maximum);
  if (random() < 0.1) quality = clamp(gaussian(base + 16, 8), minimum + 8, 106);
  if (random() < 0.02) quality = clamp(gaussian(base + 29, 6), 82, 118);
  return quality;
}`;
const formatted = `function generateMarketQuality(
  base: number,
  standardDeviation: number,
  minimum: number,
  maximum: number,
): number {
  let quality = clamp(gaussian(base, standardDeviation), minimum, maximum);
  if (random() < 0.1) quality = clamp(gaussian(base + 16, 8), minimum + 8, 106);
  if (random() < 0.02) quality = clamp(gaussian(base + 29, 6), 82, 118);
  return quality;
}`;
let next = source;
const duplicate = `${formatted}\n${compact}`;
if (next.includes(duplicate)) next = next.replace(duplicate, formatted);
const compactDuplicate = `${compact}\n${compact}`;
if (next.includes(compactDuplicate)) next = next.replace(compactDuplicate, compact);
const occurrences = (next.match(/function generateMarketQuality\(/g) ?? []).length;
if (occurrences !== 1) throw new Error(`Expected one generateMarketQuality implementation, found ${occurrences}`);
if (next !== source) await writeFile(path, next, 'utf8');
console.log(next === source ? 'Market helper already clean' : 'Removed duplicate market helper');
