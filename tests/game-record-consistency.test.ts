// Invariants that must hold inside every simulated game. League-average balance checks
// (baseline/season-stats.json) cannot catch these: a season can land on a plausible
// batting average while individual games still break the rules of baseball.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  accumulateStatsAll,
  configureRandom,
  generateSchedule,
  initTeams,
  resetRandom,
  simulateGame,
} from '../src/engine';
import type { AccumulatedStats, GameState, PitcherStats, TeamKey } from '../src/engine';

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

const RUNNING_RESULTS = new Set(['SB', 'CS']);
const NON_AT_BAT_RESULTS = new Set(['BB', 'HBP', 'SH', 'SF']);

/** Simulate a slice of a season through the ordinary game path. */
function simulateGames(count: number, seed: number): GameState[] {
  configureRandom(mulberry32(seed), () => Date.UTC(2026, 0, 1));
  const teams = initTeams();
  const schedule = generateSchedule(2026, { rainoutRate: 0, maxRainouts: 0 });
  const rotations = Object.fromEntries(Object.keys(teams).map((key) => [key, 0])) as Record<
    TeamKey,
    number
  >;
  const games: GameState[] = [];
  let accumulated: AccumulatedStats = {};
  for (const game of schedule.slice(0, count)) {
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
  return games;
}

/**
 * Replay a game half-inning by half-inning from its at-bat log, recovering the base and
 * out state before each event so rule violations become visible.
 */
function replay(
  game: GameState,
  onEvent: (context: {
    result: string;
    outs: number;
    onFirst: boolean;
    pitcherId: string;
  }) => void,
): Map<string, number> {
  const outsByPitcher = new Map<string, number>();
  const halves = new Map<string, typeof game.atBatLog>();
  for (const entry of game.atBatLog) {
    const key = `${entry.inning}:${entry.isBot}`;
    if (!halves.has(key)) halves.set(key, []);
    halves.get(key)!.push(entry);
  }
  for (const entries of halves.values()) {
    let outs = 0;
    let onFirst = false;
    let onSecond = false;
    let onThird = false;
    for (const entry of entries) {
      onEvent({ result: entry.result, outs, onFirst, pitcherId: entry.pitcherId });
      const addOut = (n: number): void => {
        outsByPitcher.set(entry.pitcherId, (outsByPitcher.get(entry.pitcherId) ?? 0) + n);
        outs += n;
      };
      switch (entry.result) {
        case 'DP':
          // A half-inning ends at three outs, so a double play can only ever retire as
          // many runners as the inning has room for.
          addOut(Math.min(2, 3 - outs));
          onFirst = false;
          break;
        case 'SH':
          addOut(1);
          onThird = onThird || onSecond;
          onSecond = onFirst;
          onFirst = false;
          break;
        case 'SF':
          addOut(1);
          onThird = false;
          break;
        case 'K':
        case 'GO':
        case 'FO':
        case 'CS':
          addOut(1);
          if (entry.result === 'CS') onFirst = false;
          if ((entry.result === 'GO' || entry.result === 'FO') && entry.rbi > 0) onThird = false;
          break;
        case 'SB':
          onSecond = true;
          onFirst = false;
          break;
        case 'HR':
          onFirst = onSecond = onThird = false;
          break;
        case '3B':
          onFirst = onSecond = false;
          onThird = true;
          break;
        case '2B':
          onFirst = false;
          onSecond = true;
          break;
        default:
          if (onSecond && !onThird) onThird = true;
          onFirst = true;
          break;
      }
      if (outs >= 3) break;
    }
  }
  return outsByPitcher;
}

test('併殺は一塁に走者がいて2アウト未満の場面でのみ発生する', () => {
  const games = simulateGames(120, 4242);
  let doublePlays = 0;
  let illegal = 0;
  for (const game of games) {
    replay(game, ({ result, outs, onFirst }) => {
      if (result !== 'DP') return;
      doublePlays += 1;
      if (!onFirst || outs >= 2) illegal += 1;
    });
  }
  assert.ok(doublePlays > 0, '検証に足りる併殺が発生していること');
  assert.equal(illegal, 0, `成立条件を満たさない併殺が${illegal}件あった`);
  resetRandom();
});

test('投手に記録されるアウト数が、試合中に実際に発生したアウト数と一致する', () => {
  const games = simulateGames(120, 909);
  let mismatches = 0;
  for (const game of games) {
    const realOuts = replay(game, () => {});
    const recorded = accumulateStatsAll(game, {});
    for (const [pitcherId, outs] of realOuts) {
      const ip3 = (recorded[pitcherId] as PitcherStats | undefined)?.ip3 ?? 0;
      if (ip3 !== outs) mismatches += 1;
    }
  }
  assert.equal(mismatches, 0, `投球回と実アウト数が不一致の投手が${mismatches}人いた`);
  resetRandom();
});

test('盗塁企図は打席数・打数・投球数を増やさない', () => {
  const games = simulateGames(60, 5150);
  let stealEvents = 0;
  for (const game of games) {
    const stolen = game.atBatLog.filter((entry) => RUNNING_RESULTS.has(entry.result));
    stealEvents += stolen.length;
    for (const entry of stolen) {
      assert.equal(entry.pc, undefined, '盗塁イベントに投球数が付いていない');
    }
  }
  assert.ok(stealEvents > 0, '検証に足りる盗塁企図が発生していること');

  // A pitcher's pitch count must equal the sum of their plate-appearance pitches only.
  for (const game of games) {
    const stats = accumulateStatsAll(game, {});
    const expected = new Map<string, number>();
    for (const entry of game.atBatLog) {
      if (RUNNING_RESULTS.has(entry.result)) continue;
      expected.set(entry.pitcherId, (expected.get(entry.pitcherId) ?? 0) + (entry.pc || 3));
    }
    for (const [pitcherId, pitches] of expected) {
      assert.equal((stats[pitcherId] as PitcherStats).pc, pitches);
    }
  }
  resetRandom();
});

test('犠打・犠飛は打席数に入るが打数には入らない', () => {
  const games = simulateGames(200, 7777);
  let sacrifices = 0;
  for (const game of games) {
    const stats = accumulateStatsAll(game, {});
    const expected = new Map<string, { pa: number; ab: number; sh: number; sf: number }>();
    for (const entry of game.atBatLog) {
      if (RUNNING_RESULTS.has(entry.result)) continue;
      const line = expected.get(entry.batterId) ?? { pa: 0, ab: 0, sh: 0, sf: 0 };
      line.pa += 1;
      if (!NON_AT_BAT_RESULTS.has(entry.result)) line.ab += 1;
      if (entry.result === 'SH') line.sh += 1;
      if (entry.result === 'SF') line.sf += 1;
      expected.set(entry.batterId, line);
    }
    for (const [batterId, line] of expected) {
      sacrifices += line.sh + line.sf;
      const recorded = stats[batterId];
      assert.equal(recorded?.type, 'bat');
      if (recorded?.type !== 'bat') continue;
      assert.equal(recorded.pa, line.pa);
      assert.equal(recorded.ab, line.ab);
      assert.equal(recorded.bnt, line.sh);
      assert.equal(recorded.sf, line.sf);
    }
  }
  assert.ok(sacrifices > 0, '検証に足りる犠打・犠飛が発生していること');
  resetRandom();
});

test('得点者IDの総数がチーム得点と一致する', () => {
  const games = simulateGames(150, 31337);
  for (const game of games) {
    const scored = game.atBatLog.reduce(
      (total, entry) => total + (entry.scoredIds ?? []).length,
      0,
    );
    assert.equal(
      scored,
      game.score.home + game.score.away,
      '記録された得点者の人数と最終スコアが一致する',
    );
  }
  resetRandom();
});

test('引き分け試合には勝利投手・敗戦投手・セーブを付けない', () => {
  // Ties are rare, so scan enough games to be sure at least one shows up.
  const games = simulateGames(858, 20260725);
  const ties = games.filter((game) => game.score.home === game.score.away);
  assert.ok(ties.length > 0, '検証に足りる引き分けが発生していること');
  for (const game of ties) {
    assert.equal(game.winnerPitcherId ?? null, null);
    assert.equal(game.loserPitcherId ?? null, null);
    assert.equal(game.savePitcherId ?? null, null);
    assert.deepEqual(game.holdPitcherIds ?? [], []);
  }
  resetRandom();
});

test('熟練度は全12球団に同じ条件で適用される', () => {
  // Every club's players must appear in the accumulated stats that drive in-season
  // mastery; if only the user's team were tracked, CPU clubs would be frozen at the
  // opening mastery value all year.
  const games = simulateGames(200, 616);
  let accumulated: AccumulatedStats = {};
  for (const game of games) accumulated = accumulateStatsAll(game, accumulated);

  // Rosters come from the games themselves; re-running initTeams() would mint different
  // player IDs than the ones that actually played.
  const rosters = new Map<TeamKey, Set<string>>();
  for (const game of games) {
    for (const side of ['home', 'away'] as const) {
      const team = game.teams[side];
      const ids = rosters.get(team.key) ?? new Set<string>();
      for (const player of [...team.fielders, ...team.pitchers]) ids.add(player.id);
      rosters.set(team.key, ids);
    }
  }
  assert.equal(rosters.size, 12, '12球団すべてが登場していること');

  for (const [teamKey, ids] of rosters) {
    const tracked = [...ids].filter((id) => accumulated[id]).length;
    assert.ok(
      tracked > 0,
      `${teamKey}の選手が熟練度の入力となる累積成績に含まれている（特定球団だけ除外されていない）`,
    );
  }
  resetRandom();
});
