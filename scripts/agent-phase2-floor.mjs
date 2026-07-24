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
    nextFielders = [...fielders];
  if (!nextPitchers.some((player) => calcOVR(player) >= 85)) {
    const candidateIndex = nextPitchers
      .map((player, index) => ({ player, index }))
      .filter(({ player }) => player.role === '先発')
      .sort(
        (first, second) =>
          Math.abs(first.player.age - 27) - Math.abs(second.player.age - 27),
      )[0]?.index;
    if (candidateIndex !== undefined) {
      const original = nextPitchers[candidateIndex] as Player;
      let replacement = original;
      for (let attempt = 0; attempt < 10 && calcOVR(replacement) < 85; attempt += 1) {
        const candidate = generatePitcher(teamKey, original.age, 185, original.role);
        if (calcOVR(candidate) > calcOVR(replacement)) replacement = candidate;
      }
      nextPitchers[candidateIndex] = replacement;
    }
  }
  if (!nextFielders.some((player) => calcOVR(player, player.pos) >= 85)) {
    const preferredPositions: FieldPosition[] = ['一塁手', '左翼手', '右翼手', '三塁手', '中堅手'];
    const candidateIndex = nextFielders
      .map((player, index) => ({
        player,
        index,
        positionPriority: preferredPositions.indexOf(player.pos as FieldPosition),
      }))
      .sort(
        (first, second) =>
          (first.positionPriority < 0 ? 99 : first.positionPriority) -
            (second.positionPriority < 0 ? 99 : second.positionPriority) ||
          Math.abs(first.player.age - 27) - Math.abs(second.player.age - 27),
      )[0]?.index;
    if (candidateIndex !== undefined) {
      const original = nextFielders[candidateIndex] as Player;
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
      nextFielders[candidateIndex] = replacement;
    }
  }
  return { pitchers: nextPitchers, fielders: nextFielders };
}`;

if (!source.includes('function ensureMinimumRosterStars(')) {
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
console.log('Guaranteed one OVR85 pitcher and batter per initial roster for the final phase 2 run.');
