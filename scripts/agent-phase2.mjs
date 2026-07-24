import { readFile, writeFile } from 'node:fs/promises';

async function update(path, transform) {
  const source = await readFile(path, 'utf8');
  const next = transform(source);
  if (next === source) return;
  await writeFile(path, next, 'utf8');
}

await update('src/engine/players.ts', (source) => {
  const qualityFunction = `function generateRosterQuality(baseDevelopment: number): number {
  const baseMean = baseDevelopment * 0.75,
    tierRoll = random();
  if (tierRoll < 0.018) return clamp(gaussian(baseMean + 70, 8), 98, 138);
  if (tierRoll < 0.108) return clamp(gaussian(baseMean + 45, 10), 75, 122);
  return clamp(gaussian(baseMean, 15), 28, 92);
}`;
  let next = source;
  if (/function generateRosterQuality\([\s\S]*?\n\}/.test(next)) {
    next = next.replace(/function generateRosterQuality\([\s\S]*?\n\}/, qualityFunction);
  } else {
    const marker = 'export function initTeams(): Teams {';
    if (!next.includes(marker)) throw new Error('initTeams marker not found');
    next = next.replace(marker, `${qualityFunction}\n${marker}`);
  }
  const original = 'clamp(gaussian(bd * 0.75, 12), 35, 98)';
  const occurrences = next.split(original).length - 1;
  if (occurrences > 0) next = next.replaceAll(original, 'generateRosterQuality(bd)');
  if ((next.match(/generateRosterQuality\(bd\)/g) ?? []).length !== 2)
    throw new Error('Expected two roster-quality call sites');
  return next;
});

await update('src/engine/market.ts', (source) => {
  const qualityFunction = `function generateMarketQuality(
  base: number,
  standardDeviation: number,
  minimum: number,
  maximum: number,
): number {
  const tierRoll = random();
  if (tierRoll < 0.03) return clamp(gaussian(base + 48, 7), 96, 128);
  if (tierRoll < 0.15) return clamp(gaussian(base + 28, 9), 70, 112);
  return clamp(gaussian(base, standardDeviation + 2), minimum - 5, maximum);
}`;
  let next = source;
  if (/function generateMarketQuality\([\s\S]*?\n\}/.test(next)) {
    next = next.replace(/function generateMarketQuality\([\s\S]*?\n\}/, qualityFunction);
  } else {
    const marker = 'export function genFreeAgentMarket(): Player[] {';
    if (!next.includes(marker)) throw new Error('FA market marker not found');
    next = next.replace(marker, `${qualityFunction}\n${marker}`);
  }
  const replacements = new Map([
    ['clamp(gaussian(67, 8), 50, 88)', 'generateMarketQuality(67, 8, 50, 88)'],
    ['clamp(gaussian(66, 8), 48, 86)', 'generateMarketQuality(66, 8, 48, 86)'],
    ['clamp(gaussian(72, 7), 58, 92)', 'generateMarketQuality(72, 7, 58, 92)'],
    ['clamp(gaussian(73, 7), 60, 94)', 'generateMarketQuality(73, 7, 60, 94)'],
  ]);
  for (const [before, after] of replacements) next = next.replaceAll(before, after);
  if ((next.match(/generateMarketQuality\(/g) ?? []).length !== 5)
    throw new Error('Expected the market helper and four call sites');
  return next;
});

await update('scripts/balance-new-engine.ts', (source) => {
  let next = source;
  if (!next.includes('  calcOVR,'))
    next = next.replace('  accumulateStatsAll,\n', '  accumulateStatsAll,\n  calcOVR,\n');
  if (!next.includes('  type Teams,'))
    next = next.replace('  type TeamKey,\n', '  type TeamKey,\n  type Teams,\n');

  const helpers = `function populationStandardDeviation(values: number[]): number {
  if (!values.length) return 0;
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  return Math.sqrt(
    values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length,
  );
}
function percentile(values: number[], fraction: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((first, second) => first - second),
    index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index] as number;
}
function rosterMetrics(teams: Teams) {
  const batters = Object.values(teams).flatMap((team) => team.fielders),
    pitchers = Object.values(teams).flatMap((team) => team.pitchers),
    batterOvrs = batters.map((player) => calcOVR(player, player.pos)),
    pitcherOvrs = pitchers.map((player) => calcOVR(player)),
    teamOvr85Counts = Object.values(teams).map(
      (team) =>
        team.fielders.filter((player) => calcOVR(player, player.pos) >= 85).length +
        team.pitchers.filter((player) => calcOVR(player) >= 85).length,
    );
  return {
    batterOvrStandardDeviation: populationStandardDeviation(batterOvrs),
    pitcherOvrStandardDeviation: populationStandardDeviation(pitcherOvrs),
    batterOvrTop1Percent: percentile(batterOvrs, 0.99),
    batterOvrTop5Percent: percentile(batterOvrs, 0.95),
    pitcherOvrTop1Percent: percentile(pitcherOvrs, 0.99),
    pitcherOvrTop5Percent: percentile(pitcherOvrs, 0.95),
    batterOvr85PlusCount: batterOvrs.filter((overall) => overall >= 85).length,
    pitcherOvr85PlusCount: pitcherOvrs.filter((overall) => overall >= 85).length,
    averageTeamOvr85PlusCount:
      teamOvr85Counts.reduce((total, count) => total + count, 0) / teamOvr85Counts.length,
    minimumTeamOvr85PlusCount: Math.min(...teamOvr85Counts),
  };
}`;
  if (/function populationStandardDeviation\([\s\S]*?\n\}\nfunction rosterMetrics\([\s\S]*?\n\}/.test(next)) {
    next = next.replace(
      /function populationStandardDeviation\([\s\S]*?\n\}\nfunction rosterMetrics\([\s\S]*?\n\}/,
      helpers,
    );
  } else if (!next.includes('function rosterMetrics(')) {
    const marker = 'function finalizeSeason(accumulatedStats: AccumulatedStats, games: number) {';
    if (!next.includes(marker)) throw new Error('finalizeSeason marker not found');
    next = next.replace(marker, `${helpers}\n${marker}`);
  }

  next = next.replace(
    '  return finalizeSeason(accumulatedStats, schedule.length);',
    '  return { ...finalizeSeason(accumulatedStats, schedule.length), ...rosterMetrics(teams) };',
  );
  if (!next.includes('...rosterMetrics(teams)')) throw new Error('Roster metrics return not installed');

  const summaryMarker =
    '      walkRate: roundSummary(summarize(seasonStats.map((stats) => stats.walkRate)), 6),';
  const distributionSummary = `${summaryMarker}
      batterOvrStandardDeviation: roundSummary(
        summarize(seasonStats.map((stats) => stats.batterOvrStandardDeviation)),
        6,
      ),
      pitcherOvrStandardDeviation: roundSummary(
        summarize(seasonStats.map((stats) => stats.pitcherOvrStandardDeviation)),
        6,
      ),
      batterOvrTop1Percent: roundSummary(
        summarize(seasonStats.map((stats) => stats.batterOvrTop1Percent)),
        3,
      ),
      batterOvrTop5Percent: roundSummary(
        summarize(seasonStats.map((stats) => stats.batterOvrTop5Percent)),
        3,
      ),
      pitcherOvrTop1Percent: roundSummary(
        summarize(seasonStats.map((stats) => stats.pitcherOvrTop1Percent)),
        3,
      ),
      pitcherOvrTop5Percent: roundSummary(
        summarize(seasonStats.map((stats) => stats.pitcherOvrTop5Percent)),
        3,
      ),
      batterOvr85PlusCount: roundSummary(
        summarize(seasonStats.map((stats) => stats.batterOvr85PlusCount)),
        3,
      ),
      pitcherOvr85PlusCount: roundSummary(
        summarize(seasonStats.map((stats) => stats.pitcherOvr85PlusCount)),
        3,
      ),
      averageTeamOvr85PlusCount: roundSummary(
        summarize(seasonStats.map((stats) => stats.averageTeamOvr85PlusCount)),
        3,
      ),
      minimumTeamOvr85PlusCount: roundSummary(
        summarize(seasonStats.map((stats) => stats.minimumTeamOvr85PlusCount)),
        3,
      ),`;
  if (!next.includes('batterOvrStandardDeviation: roundSummary')) {
    if (!next.includes(summaryMarker)) throw new Error('Summary marker not found');
    next = next.replace(summaryMarker, distributionSummary);
  }
  next = next.replace('      schemaVersion: 3,', '      schemaVersion: 4,');
  return next;
});

console.log('Applied phase 2 player-distribution changes.');
