// Diagnostic harness for game-record consistency. Simulates a full season through the
// real simulateGame() path and reports how often official-rule invariants are violated.
// Read-only: does not modify engine behaviour. Run: npx tsx scripts/diagnose-consistency.ts
import { initTeams } from '../src/engine/players';
import { configureRandom } from '../src/engine/random';
import { generateSchedule } from '../src/engine/season';
import { simulateGame } from '../src/engine/game';
import { accumulateStatsAll } from '../src/engine/stats';
import type { AccumulatedStats, GameState, PitcherStats, TeamKey } from '../src/engine/types';

// Same PRNG as scripts/balance-new-engine.ts so runs are comparable and reproducible.
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

interface Counters {
  games: number;
  atBats: number;
  dpTotal: number;
  dpNoRunnerOnFirst: number;
  dpWithTwoOuts: number;
  dpOutOverflow: number;
  csOuts: number;
  ipMismatchGames: number;
  ipOverCount: number;
  ipUnderCount: number;
  scoreMismatchGames: number;
  sacFlyLike: number;
  sacBunts: number;
  ties: number;
  tiesWithDecision: number;
  gamesNoWinner: number;
  reliefWinOpportunities: number;
}

const counters: Counters = {
  games: 0,
  atBats: 0,
  dpTotal: 0,
  dpNoRunnerOnFirst: 0,
  dpWithTwoOuts: 0,
  dpOutOverflow: 0,
  csOuts: 0,
  ipMismatchGames: 0,
  ipOverCount: 0,
  ipUnderCount: 0,
  scoreMismatchGames: 0,
  sacFlyLike: 0,
  sacBunts: 0,
  ties: 0,
  tiesWithDecision: 0,
  gamesNoWinner: 0,
  reliefWinOpportunities: 0,
};

// Replay each half-inning from the at-bat log to recover base/out state at each event,
// so we can tell whether a DP was legal and whether recorded outs match real outs.
function auditGame(game: GameState): void {
  counters.games += 1;
  counters.atBats += game.atBatLog.length;

  const realOutsByPitcher = new Map<string, number>();
  let scoredIdCount = 0;

  // Group log entries by (inning, isBot) half.
  const halves = new Map<string, typeof game.atBatLog>();
  for (const entry of game.atBatLog) {
    const key = `${entry.inning}:${entry.isBot}`;
    if (!halves.has(key)) halves.set(key, []);
    halves.get(key)!.push(entry);
    scoredIdCount += (entry.scoredIds ?? []).length;
  }

  for (const entries of halves.values()) {
    let outs = 0;
    let onFirst = false;
    let onSecond = false;
    let onThird = false;
    for (const entry of entries) {
      const addOut = (pitcherId: string, n: number): void => {
        realOutsByPitcher.set(pitcherId, (realOutsByPitcher.get(pitcherId) ?? 0) + n);
      };
      switch (entry.result) {
        case 'DP': {
          counters.dpTotal += 1;
          if (!onFirst) counters.dpNoRunnerOnFirst += 1;
          if (outs >= 2) counters.dpWithTwoOuts += 1;
          const realOuts = Math.min(2, 3 - outs); // half ends at 3
          if (realOuts < 2) counters.dpOutOverflow += 1;
          addOut(entry.pitcherId, realOuts);
          outs += realOuts;
          onFirst = false;
          break;
        }
        case 'SF': {
          counters.sacFlyLike += 1;
          addOut(entry.pitcherId, 1);
          outs += 1;
          onThird = false;
          break;
        }
        case 'SH': {
          counters.sacBunts += 1;
          addOut(entry.pitcherId, 1);
          outs += 1;
          onThird = onThird || onSecond;
          onSecond = onFirst;
          onFirst = false;
          break;
        }
        case 'K':
        case 'GO':
        case 'FO': {
          addOut(entry.pitcherId, 1);
          outs += 1;
          if (entry.result === 'GO' || entry.result === 'FO') {
            if (entry.rbi > 0) onThird = false;
          }
          break;
        }
        case 'CS': {
          counters.csOuts += 1;
          addOut(entry.pitcherId, 1);
          outs += 1;
          onFirst = false;
          break;
        }
        case 'SB': {
          onSecond = true;
          onFirst = false;
          break;
        }
        case 'HR': {
          onFirst = onSecond = onThird = false;
          break;
        }
        case '3B': {
          onFirst = onSecond = false;
          onThird = true;
          break;
        }
        case '2B': {
          onFirst = false;
          onSecond = true;
          break;
        }
        case '1B':
        case 'BB':
        case 'HBP': {
          if (onSecond && !onThird) onThird = true;
          onFirst = true;
          break;
        }
        default:
          break;
      }
      if (outs >= 3) break;
    }
  }

  // Compare recorded ip3 against the real outs we just replayed.
  const gameStats = accumulateStatsAll(game, {});
  let mismatched = false;
  for (const [id, real] of realOutsByPitcher) {
    const recorded = (gameStats[id] as PitcherStats | undefined)?.ip3 ?? 0;
    if (recorded !== real) {
      mismatched = true;
      if (recorded > real) counters.ipOverCount += recorded - real;
      else counters.ipUnderCount += real - recorded;
    }
  }
  if (mismatched) counters.ipMismatchGames += 1;

  // Runs actually scored should equal the number of scoredIds recorded.
  const totalRuns = game.score.home + game.score.away;
  if (scoredIdCount !== totalRuns) counters.scoreMismatchGames += 1;

  // Decision-pitcher sanity.
  const tie = game.score.home === game.score.away;
  if (tie) {
    counters.ties += 1;
    if (game.winnerPitcherId || game.loserPitcherId || game.savePitcherId) {
      counters.tiesWithDecision += 1;
    }
  } else {
    if (!game.winnerPitcherId) {
      counters.gamesNoWinner += 1;
      counters.reliefWinOpportunities += 1;
    }
  }
}

function main(): void {
  configureRandom(mulberry32(20260725), () => Date.UTC(2026, 0, 1));
  const teams = initTeams();
  const schedule = generateSchedule(2026, { rainoutRate: 0, maxRainouts: 0 });
  const rotations = Object.fromEntries(Object.keys(teams).map((k) => [k, 0])) as Record<
    TeamKey,
    number
  >;
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
    auditGame(result);
    accumulated = accumulateStatsAll(result, accumulated);
    rotations[game.homeKey] += 1;
    rotations[game.awayKey] += 1;
  }

  const pct = (n: number, d: number): string => (d ? `${((n / d) * 100).toFixed(2)}%` : 'n/a');
  console.log('=== Game-record consistency audit (1 season, 858 games) ===');
  console.log(`games=${counters.games} atBats=${counters.atBats}`);
  console.log('');
  console.log('--- 併殺(DP)の成立条件 ---');
  console.log(`DP total:                 ${counters.dpTotal}`);
  console.log(
    `  一塁走者なしでDP:       ${counters.dpNoRunnerOnFirst} (${pct(counters.dpNoRunnerOnFirst, counters.dpTotal)} of DP)`,
  );
  console.log(
    `  2アウトからDP:          ${counters.dpWithTwoOuts} (${pct(counters.dpWithTwoOuts, counters.dpTotal)} of DP)`,
  );
  console.log(`  アウト数が2未満に丸め:  ${counters.dpOutOverflow}`);
  console.log('');
  console.log('--- 投球回(IP)と実アウト数の一致 ---');
  console.log(
    `試合単位で不一致:         ${counters.ipMismatchGames} / ${counters.games} (${pct(counters.ipMismatchGames, counters.games)})`,
  );
  console.log(`  記録が過大(アウト):     ${counters.ipOverCount}`);
  console.log(`  記録が過小(アウト):     ${counters.ipUnderCount}  (盗塁死=${counters.csOuts}件)`);
  console.log('');
  console.log('--- 得点と得点者IDの一致 ---');
  console.log(
    `試合単位で不一致:         ${counters.scoreMismatchGames} / ${counters.games} (${pct(counters.scoreMismatchGames, counters.games)})`,
  );
  console.log('');
  console.log('--- 犠打・犠飛 ---');
  console.log(`犠飛(SF):                 ${counters.sacFlyLike}`);
  console.log(`犠打(SH):                 ${counters.sacBunts}`);
  console.log('');
  console.log('--- 責任投手 ---');
  console.log(`引き分け:                 ${counters.ties}`);
  console.log(`  うち勝敗/Sが付いた:     ${counters.tiesWithDecision}`);
  console.log(
    `決着したが勝利投手なし:   ${counters.gamesNoWinner} (${pct(counters.gamesNoWinner, counters.games - counters.ties)} of decided games)`,
  );
}

main();
