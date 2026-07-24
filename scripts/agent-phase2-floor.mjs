import { readFile, writeFile } from 'node:fs/promises';

const path = 'src/engine/players.ts';
let source = await readFile(path, 'utf8');
if (!source.includes("import { calcOVR } from './ratings';"))
  source = source.replace(
    "import { syncSpecialsFromLevels } from './specials';",
    "import { calcOVR } from './ratings';\nimport { syncSpecialsFromLevels } from './specials';",
  );

const floorHelper = `function ensureMinimumRosterStars(
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
      const candidate = generateBatter(
        teamKey,
        original.age,
        original.pos as FieldPosition,
        190,
      );
      if (calcOVR(candidate, candidate.pos) > calcOVR(replacement, replacement.pos))
        replacement = candidate;
    }
    nextFielders[index] = replacement;
    if (calcOVR(replacement, replacement.pos) >= 85) starCount += 1;
  }
  return { pitchers: nextPitchers, fielders: nextFielders };
}`;

if (/function ensureMinimumRosterStars\([\s\S]*?\n\}/.test(source)) {
  source = source.replace(/function ensureMinimumRosterStars\([\s\S]*?\n\}/, floorHelper);
} else {
  const marker = 'export function initTeams(): Teams {';
  if (!source.includes(marker)) throw new Error('initTeams marker not found');
  source = source.replace(marker, `${floorHelper}\n${marker}`);
}

const originalReturn =
  '      return [teamKey, { ...TINFO[teamKey], key: teamKey, pitchers, fielders, rotSize: 6 }];';
const replacementReturn = `      const starredRoster = ensureMinimumRosterStars(teamKey, pitchers, fielders);
      return [
        teamKey,
        {
          ...TINFO[teamKey],
          key: teamKey,
          pitchers: starredRoster.pitchers,
          fielders: starredRoster.fielders,
          rotSize: 6,
        },
      ];`;
if (source.includes(originalReturn)) source = source.replace(originalReturn, replacementReturn);
if (!source.includes('const starredRoster = ensureMinimumRosterStars'))
  throw new Error('Star floor was not connected to initTeams');

await writeFile(path, source, 'utf8');
console.log('Guaranteed at least two OVR85 players per roster, filling deficits with batters.');
