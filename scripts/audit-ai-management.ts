import {
  accumulateStatsAll,
  auditGameManagement,
  configureRandom,
  generateSchedule,
  initTeams,
  resetRandom,
  simulateGame,
  strategyLabel,
  teamStrategyFor,
  type AccumulatedStats,
  type GameState,
  type TeamKey,
} from '../src/engine';

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

configureRandom(mulberry32(20260726), () => Date.UTC(2026, 0, 1));
try {
  const teams = initTeams();
  const schedule = generateSchedule(2026, { rainoutRate: 0, maxRainouts: 0 });
  const rotations = Object.fromEntries(Object.keys(teams).map((teamKey) => [teamKey, 0])) as Record<
    TeamKey,
    number
  >;
  const games: GameState[] = [];
  let accumulated: AccumulatedStats = {};

  for (const game of schedule) {
    const result = simulateGame(
      game.homeKey,
      game.awayKey,
      teams,
      null,
      null,
      rotations[game.homeKey],
      rotations[game.awayKey],
      accumulated,
      null,
      null,
      game.date,
    );
    games.push(result);
    accumulated = accumulateStatsAll(result, accumulated);
    rotations[game.homeKey] += 1;
    rotations[game.awayKey] += 1;
  }

  const audit = auditGameManagement(games).map((entry) => ({
    team: entry.teamKey,
    strategy: strategyLabel(teamStrategyFor(entry.teamKey)),
    bunt: {
      opportunities: entry.bunt.opportunities,
      attempts: entry.bunt.attempts,
      attemptRate: Number(entry.bunt.attemptRate.toFixed(3)),
      successRate: Number(entry.bunt.successRate.toFixed(3)),
      runsAfterAttempt: Number(entry.bunt.averageRunsAfterAttempt.toFixed(3)),
      runsAfterHold: Number(entry.bunt.averageRunsAfterHold.toFixed(3)),
    },
    steal: {
      opportunities: entry.steal.opportunities,
      attempts: entry.steal.attempts,
      attemptRate: Number(entry.steal.attemptRate.toFixed(3)),
      successRate: Number(entry.steal.successRate.toFixed(3)),
      runsAfterAttempt: Number(entry.steal.averageRunsAfterAttempt.toFixed(3)),
      runsAfterHold: Number(entry.steal.averageRunsAfterHold.toFixed(3)),
    },
    pitchingChanges: entry.pitchingChanges,
    warnings: entry.warnings,
  }));

  console.log(JSON.stringify({ games: games.length, teams: audit }, null, 2));
  if (process.argv.includes('--strict') && audit.some((entry) => entry.warnings.length > 0))
    process.exitCode = 1;
} finally {
  resetRandom();
}
