import assert from 'node:assert/strict';
import test from 'node:test';

import {
  accumulateStatsAll,
  applyPitcherWorkloads,
  configureRandom,
  generateSchedule,
  initTeams,
  prepareTeamPitchersForGame,
  resetRandom,
  simulateGame,
  type AccumulatedStats,
  type AtBatLogEntry,
  type PitcherStats,
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

test('pitcher workload accumulates after appearances and recovers across calendar days', () => {
  const team = initTeams().giants;
  const reliever = team.pitchers.find((pitcher) => pitcher.role === 'リリーフ');
  assert.ok(reliever);
  const prepared = prepareTeamPitchersForGame(team, '2026-04-01');
  const entry: AtBatLogEntry = {
    inning: 7,
    isBot: false,
    batter: '打者',
    batterId: 'batter',
    bSide: 'tigers',
    pitcher: reliever.name,
    pitcherId: reliever.id,
    pSide: 'giants',
    result: 'K',
    pc: 16,
    rbi: 0,
    desc: '三振',
    snap: { home: 0, away: 0 },
  };
  const afterAppearance = applyPitcherWorkloads(prepared, [entry], '2026-04-01');
  const used = afterAppearance.pitchers.find((pitcher) => pitcher.id === reliever.id);
  assert.ok(used);
  assert.ok((used.fatigue ?? 0) >= 35);
  assert.equal(used.lastPitchedOn, '2026-04-01');
  assert.equal(used.consecutivePitchingGames, 1);

  const nextDay = prepareTeamPitchersForGame(afterAppearance, '2026-04-02');
  const partiallyRecovered = nextDay.pitchers.find((pitcher) => pitcher.id === reliever.id);
  assert.ok(partiallyRecovered);
  assert.ok((partiallyRecovered.fatigue ?? 0) < (used.fatigue ?? 0));
  assert.ok((partiallyRecovered.fatigue ?? 0) > 0);

  const afterRest = prepareTeamPitchersForGame(nextDay, '2026-04-05');
  const recovered = afterRest.pitchers.find((pitcher) => pitcher.id === reliever.id);
  assert.ok(recovered);
  assert.equal(recovered.fatigue, 0);
  assert.equal(recovered.consecutivePitchingGames, 0);
});

test('a fixed full season keeps pitcher usage and performance tails in diagnostic ranges', () => {
  configureRandom(mulberry32(20260724), () => 1_700_000_000_000);
  try {
    const teams = initTeams();
    const schedule = generateSchedule(2026, { rainoutRate: 0, maxRainouts: 0 });
    const rotations = Object.fromEntries(
      Object.keys(teams).map((teamKey) => [teamKey, 0]),
    ) as Record<TeamKey, number>;
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
      accumulated = accumulateStatsAll(result, accumulated);
      rotations[game.homeKey] += 1;
      rotations[game.awayKey] += 1;
    }

    const pitching = Object.values(accumulated).filter(
      (line): line is PitcherStats => line.type === 'pit',
    );
    const relief = pitching.filter((line) => line.gs <= 2);
    const qualified = pitching.filter((line) => line.ip3 >= 143 * 3);
    const reliefLeader = Math.max(...relief.map((line) => line.g));
    const reliefInningsLeader = Math.max(...relief.map((line) => line.ip3 / 3));
    const strikeoutLeader = Math.max(...pitching.map((line) => line.k));
    const eraBelowTwo = qualified.filter((line) => (line.er * 27) / line.ip3 < 2).length;

    assert.ok(reliefLeader >= 50 && reliefLeader <= 70);
    assert.ok(reliefInningsLeader < 95);
    assert.ok(relief.filter((line) => line.g >= 70).length <= 1);
    assert.ok(strikeoutLeader >= 150 && strikeoutLeader <= 240);
    assert.ok(pitching.filter((line) => line.k >= 200).length <= 2);
    assert.ok(eraBelowTwo >= 2 && eraBelowTwo <= 12);
  } finally {
    resetRandom();
  }
});
