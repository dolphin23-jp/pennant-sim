import assert from 'node:assert/strict';
import test from 'node:test';

import {
  accumulateStatsAll,
  buildPlayLog,
  configureRandom,
  generateSchedule,
  initTeams,
  resetRandom,
  simulateGame,
} from '../src/engine';
import type { AccumulatedStats, GamePlayLog, TeamKey } from '../src/engine';
import { buildLiveGame, pitchSequence } from '../src/components/live/liveTimeline';

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

function playedLogs(count: number, seed: number) {
  configureRandom(mulberry32(seed), () => Date.UTC(2026, 0, 1));
  try {
    const teams = initTeams();
    const schedule = generateSchedule(2026, { rainoutRate: 0, maxRainouts: 0 });
    const rotations = Object.fromEntries(Object.keys(teams).map((key) => [key, 0])) as Record<
      TeamKey,
      number
    >;
    let accumulated: AccumulatedStats = {};
    return schedule.slice(0, count).map((game) => {
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
      accumulated = accumulateStatsAll(result, accumulated);
      rotations[game.homeKey] += 1;
      rotations[game.awayKey] += 1;
      return { log: buildPlayLog(game.id, game.date, result), result };
    });
  } finally {
    resetRandom();
  }
}

test('a replay ends on the final score, with the line score adding up to it', () => {
  for (const { log, result } of playedLogs(24, 11)) {
    const live = buildLiveGame(log);
    assert.deepEqual(live.final, { away: result.score.away, home: result.score.home });
    const last = live.frames.at(-1)!;
    const sum = (runs: Array<number | null>) => runs.reduce<number>((a, b) => a + (b ?? 0), 0);
    assert.equal(sum(last.line.away), result.score.away);
    assert.equal(sum(last.line.home), result.score.home);
    assert.ok(last.moments.includes('final'));
    for (const [index, runs] of result.innings.entries()) {
      assert.equal(last.line.away[index] ?? 0, runs.away, `away inning ${index + 1}`);
      assert.equal(last.line.home[index] ?? 0, runs.home, `home inning ${index + 1}`);
    }
  }
});

test('outs and bases follow the play, and every finished half-inning ends on three outs', () => {
  for (const { log } of playedLogs(12, 29)) {
    const live = buildLiveGame(log);
    for (const [index, frame] of live.frames.entries()) {
      assert.ok(frame.outs >= frame.outsBefore && frame.outs <= 3);
      if (frame.outs === 3) assert.deepEqual(frame.bases, [false, false, false]);
      if (frame.result === 'HR') assert.deepEqual(frame.bases, [false, false, false]);
      if (frame.result === 'HR') assert.equal(frame.ball?.gone, true);
      if (['K', 'BB', 'HBP'].includes(frame.result)) assert.equal(frame.ball, null);
      const next = live.frames[index + 1];
      const halfEnds = !next || next.inning !== frame.inning || next.isBot !== frame.isBot;
      if (halfEnds && next) assert.equal(frame.outs, 3, `${frame.inning}回 ends on 3 outs`);
      if (next && !halfEnds) assert.deepEqual(next.basesBefore, frame.bases);
    }
  }
});

test('old play logs without replay fields still play back', () => {
  const [{ log }] = playedLogs(1, 5);
  const stripped: GamePlayLog = {
    ...log,
    halves: log.halves.map((half) => ({
      ...half,
      events: half.events.map((event) => {
        if (!('play' in event)) return event;
        const { battedBall, fieldingSlot, spray, basesAfter, pc, ...play } = event.play;
        void [battedBall, fieldingSlot, spray, basesAfter, pc];
        return { play };
      }),
    })),
  };
  const live = buildLiveGame(stripped);
  assert.deepEqual(live.final, buildLiveGame(log).final);
  for (const frame of live.frames) {
    if (frame.ball) assert.ok(Number.isFinite(frame.ball.to.x) && Number.isFinite(frame.ball.to.y));
  }
});

test('shown pitches are legal and repeat for the same play', () => {
  const [{ log }] = playedLogs(1, 7);
  const live = buildLiveGame(log);
  for (const frame of live.frames) {
    const pitches = pitchSequence(log.gameId, frame);
    assert.deepEqual(pitches, pitchSequence(log.gameId, frame));
    const balls = pitches.filter((pitch) => pitch === 'ball').length;
    if (frame.result === 'BB') assert.equal(balls, 4);
    else assert.ok(balls <= 3);
    if (frame.result === 'K') assert.equal(pitches.at(-1), 'strike');
  }
});
