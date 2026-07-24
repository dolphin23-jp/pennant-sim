import { readFile, writeFile } from 'node:fs/promises';

const path = 'src/engine/players.ts';
const source = await readFile(path, 'utf8');
const before = 'return clamp(1 + relativeScore * 0.38, 0.55, 1.85);';
const after = 'return clamp(1 + relativeScore * 0.65, 0.4, 2.2);';
if (source.includes(after)) {
  console.log('Phase 5 profile multiplier already tuned.');
} else {
  if (!source.includes(before)) throw new Error('Profile multiplier source not found');
  await writeFile(path, source.replace(before, after), 'utf8');
  console.log('Strengthened phase 5 profile multiplier.');
}
