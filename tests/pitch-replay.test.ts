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
import type { AccumulatedStats, Player, TeamKey } from '../src/engine';
import { buildLiveGame } from '../src/components/live/liveTimeline';
import { inZone, replayAtBat } from '../src/components/live/pitchReplay';

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

function playedGames(count: number, seed: number) {
  configureRandom(mulberry32(seed), () => Date.UTC(2026, 0, 1));
  try {
    const teams = initTeams();
    const players = new Map<string, Player>(
      Object.values(teams).flatMap((team) =>
        [...team.fielders, ...team.pitchers].map((player) => [player.id, player] as const),
      ),
    );
    const schedule = generateSchedule(2026, { rainoutRate: 0, maxRainouts: 0 });
    const rotations = Object.fromEntries(Object.keys(teams).map((key) => [key, 0])) as Record<
      TeamKey,
      number
    >;
    let accumulated: AccumulatedStats = {};
    const logs = schedule.slice(0, count).map((game) => {
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
      return buildPlayLog(game.id, game.date, result);
    });
    return { logs, players };
  } finally {
    resetRandom();
  }
}

const { logs, players } = playedGames(24, 17);

function replays() {
  return logs.flatMap((log) =>
    buildLiveGame(log).frames.map((frame) => {
      const pitcher = frame.pitcherId ? players.get(frame.pitcherId) : undefined;
      const batter = players.get(frame.batterId);
      return {
        frame,
        pitcher,
        replay: replayAtBat(
          log.gameId,
          frame,
          pitcher
            ? {
                pitches: pitcher.p.pitches,
                vel: pitcher.p.vel,
                ctrl: pitcher.p.ctrl,
                throws: pitcher.hand?.th,
              }
            : null,
          batter ? { bats: batter.hand?.bat } : null,
        ),
      };
    }),
  );
}

test('every replayed at-bat follows the count and ends on its result', () => {
  for (const { frame, replay } of replays()) {
    if (frame.result === 'SB' || frame.result === 'CS') {
      assert.equal(replay.pitches.length, 0);
      continue;
    }
    assert.ok(frame.pitcherId, 'the play log keeps the pitcher');
    const { pitches } = replay;
    assert.ok(pitches.length >= Math.max(1, frame.pitches));
    for (const pitch of pitches.slice(0, -1)) {
      assert.ok(pitch.balls <= 3, `${frame.desc}: four balls before the end`);
      assert.ok(pitch.strikes <= 2, `${frame.desc}: three strikes before the end`);
      assert.notEqual(pitch.call, 'inPlay');
      assert.notEqual(pitch.call, 'hitByPitch');
    }
    const last = pitches.at(-1)!;
    if (frame.result === 'K') {
      assert.ok(last.call === 'swingingStrike' || last.call === 'calledStrike');
      assert.equal(last.strikes, 3);
    } else if (frame.result === 'BB') {
      assert.equal(last.call, 'ball');
      assert.equal(last.balls, 4);
    } else if (frame.result === 'HBP') assert.equal(last.call, 'hitByPitch');
    else assert.equal(last.call, 'inPlay');
  }
});

test('balls miss the zone, called strikes are in it, and pitch types are the pitcher’s own', () => {
  for (const { pitcher, replay } of replays()) {
    const own = new Set(['直球', ...(pitcher?.p.pitches ?? []).map((pitch) => pitch.type)]);
    for (const pitch of replay.pitches) {
      if (pitch.call === 'ball') assert.ok(!inZone(pitch), `ball in zone ${pitch.x},${pitch.z}`);
      if (pitch.call === 'calledStrike') assert.ok(inZone(pitch));
      if (pitch.call === 'hitByPitch') assert.ok(Math.abs(pitch.x) > 1.3);
      assert.ok(own.has(pitch.type), `${pitch.type} is not in the repertoire`);
      assert.ok(pitch.kmh >= 90 && pitch.kmh <= 175);
    }
  }
});

test('a replay repeats, and plays without the pitcher or batter on file', () => {
  const [log] = logs;
  const frame = buildLiveGame(log!).frames[0]!;
  assert.deepEqual(replayAtBat(log!.gameId, frame), replayAtBat(log!.gameId, frame));
  const anonymous = replayAtBat(log!.gameId, { ...frame, pitcherId: undefined });
  assert.equal(anonymous.throws, 'R');
  assert.equal(anonymous.batterSide, 'R');
  assert.ok(anonymous.pitches.every((pitch) => ['直球', 'スライダー'].includes(pitch.type)));
});

test('a switch hitter bats from the side opposite the pitcher', () => {
  const frame = buildLiveGame(logs[0]!).frames[0]!;
  assert.equal(replayAtBat('g', frame, { throws: '右' }, { bats: '両' }).batterSide, 'L');
  assert.equal(replayAtBat('g', frame, { throws: '左' }, { bats: '両' }).batterSide, 'R');
});
