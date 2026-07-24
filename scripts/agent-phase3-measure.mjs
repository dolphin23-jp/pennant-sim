import { readFile, writeFile } from 'node:fs/promises';

const path = 'scripts/balance-new-engine.ts';
let source = await readFile(path, 'utf8');
if (!source.includes('  type Player,'))
  source = source.replace('  type AccumulatedStats,\n', '  type AccumulatedStats,\n  type Player,\n  type PlayerParams,\n');

const helpers = `function playerPotentialGaps(player: Player): number[] {
  const parameters: Array<keyof PlayerParams> = player.isP
    ? ['vel', 'ctrl', 'stam', 'nobi', 'fld']
    : [
        'cf',
        'cb',
        'pw',
        'dc',
        'sp',
        'df',
        'arm',
        'stam',
        ...(player.pos === '捕手' ? (['ld'] as Array<keyof PlayerParams>) : []),
      ];
  return parameters.map((parameter) =>
    Math.max(
      0,
      Number(player.pot?.[parameter] ?? player.p?.[parameter] ?? 50) -
        Number(player.p?.[parameter] ?? 50),
    ),
  );
}
function potentialMetrics(players: Player[]) {
  const maximumGaps = players.map((player) => Math.max(...playerPotentialGaps(player))),
    averageGaps = players.map((player) => {
      const gaps = playerPotentialGaps(player);
      return gaps.reduce((total, gap) => total + gap, 0) / gaps.length;
    });
  return {
    latentFactorMaximumRate: safeRatio(
      maximumGaps.filter((gap) => gap >= 20).length,
      maximumGaps.length,
    ),
    potentialGap40PlusRate: safeRatio(
      maximumGaps.filter((gap) => gap >= 40).length,
      maximumGaps.length,
    ),
    meanMaximumPotentialGap:
      maximumGaps.reduce((total, gap) => total + gap, 0) / maximumGaps.length,
    meanAveragePotentialGap:
      averageGaps.reduce((total, gap) => total + gap, 0) / averageGaps.length,
    elitePotentialRate: safeRatio(
      players.filter((player) => player.potentialClass === 'elite').length,
      players.length,
    ),
  };
}`;
if (!source.includes('function playerPotentialGaps(')) {
  const marker = 'function rosterMetrics(teams: Teams) {';
  if (!source.includes(marker)) throw new Error('rosterMetrics marker not found');
  source = source.replace(marker, `${helpers}\n${marker}`);
}

if (!source.includes('...potentialMetrics(allPlayers)')) {
  source = source.replace(
    `  const batters = Object.values(teams).flatMap((team) => team.fielders),
    pitchers = Object.values(teams).flatMap((team) => team.pitchers),`,
    `  const batters = Object.values(teams).flatMap((team) => team.fielders),
    pitchers = Object.values(teams).flatMap((team) => team.pitchers),
    allPlayers = [...batters, ...pitchers],`,
  );
  source = source.replace(
    `    minimumTeamOvr85PlusCount: Math.min(...teamOvr85Counts),
  };`,
    `    minimumTeamOvr85PlusCount: Math.min(...teamOvr85Counts),
    ...potentialMetrics(allPlayers),
  };`,
  );
}

const summaryMarker = `      minimumTeamOvr85PlusCount: roundSummary(
        summarize(seasonStats.map((stats) => stats.minimumTeamOvr85PlusCount)),
        3,
      ),`;
const potentialSummary = `${summaryMarker}
      latentFactorMaximumRate: roundSummary(
        summarize(seasonStats.map((stats) => stats.latentFactorMaximumRate)),
        6,
      ),
      potentialGap40PlusRate: roundSummary(
        summarize(seasonStats.map((stats) => stats.potentialGap40PlusRate)),
        6,
      ),
      meanMaximumPotentialGap: roundSummary(
        summarize(seasonStats.map((stats) => stats.meanMaximumPotentialGap)),
        6,
      ),
      meanAveragePotentialGap: roundSummary(
        summarize(seasonStats.map((stats) => stats.meanAveragePotentialGap)),
        6,
      ),
      elitePotentialRate: roundSummary(
        summarize(seasonStats.map((stats) => stats.elitePotentialRate)),
        6,
      ),`;
if (!source.includes('latentFactorMaximumRate: roundSummary')) {
  if (!source.includes(summaryMarker)) throw new Error('summary marker not found');
  source = source.replace(summaryMarker, potentialSummary);
}
source = source.replace('      schemaVersion: 4,', '      schemaVersion: 5,');
await writeFile(path, source, 'utf8');
console.log('Added phase 3 potential-distribution metrics.');
