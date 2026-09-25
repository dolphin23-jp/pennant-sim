import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assignAllActiveRosters,
  calcStandings,
  configureRandom,
  generateSchedule,
  initTeams,
  recommendedLineup,
  repairLineup,
  resetRandom,
  strategicBestLineup,
  type Player,
  type Teams,
} from '../src/engine';
import { advanceOneYear, applySkip, initialState, type RuntimeState } from '../src/state/runtime';

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

const withPlayer = (teams: Teams, player: Player): Teams => ({
  ...teams,
  giants: {
    ...teams.giants,
    fielders: teams.giants.fielders.map((candidate) =>
      candidate.id === player.id ? player : candidate,
    ),
  },
});

test('the AI buttons use the same strategy AI the CPU clubs play with', () => {
  configureRandom(mulberry32(1), () => 1_700_000_000_000);
  try {
    const team = assignAllActiveRosters(initTeams()).giants;
    assert.deepEqual(
      recommendedLineup(team).map((player) => player.id),
      strategicBestLineup(team).lineup.map((player) => player.id),
    );
  } finally {
    resetRandom();
  }
});

test('a hurt or sent-down starter is replaced one for one, keeping the batting order', () => {
  configureRandom(mulberry32(2), () => 1_700_000_000_000);
  try {
    let teams = assignAllActiveRosters(initTeams());
    const saved = recommendedLineup(teams.giants);
    const hurt = saved[3]!;
    const farmed = saved[6]!;
    teams = withPlayer(teams, {
      ...teams.giants.fielders.find((p) => p.id === hurt.id)!,
      injuryDays: 10,
    });
    teams = withPlayer(teams, {
      ...teams.giants.fielders.find((p) => p.id === farmed.id)!,
      activeRoster: false,
    });
    const { lineup, substitutions } = repairLineup(teams.giants, saved);
    assert.equal(lineup.length, 9);
    // Everyone else keeps his place in the order.
    for (const index of [0, 1, 2, 4, 5, 7, 8]) assert.equal(lineup[index]!.id, saved[index]!.id);
    assert.notEqual(lineup[3]!.id, hurt.id);
    assert.notEqual(lineup[6]!.id, farmed.id);
    assert.equal(lineup[3]!._assignedPos ?? 'DH', saved[3]!._assignedPos ?? 'DH');
    assert.deepEqual(
      substitutions.map((entry) => [entry.outId, entry.reason]),
      [
        [hurt.id, 'injury'],
        [farmed.id, 'farm'],
      ],
    );
    assert.equal(new Set(lineup.map((player) => player.id)).size, 9);
  } finally {
    resetRandom();
  }
});

function openingState(): RuntimeState {
  const teams = assignAllActiveRosters(initTeams());
  const schedule = generateSchedule(2026, { rainoutRate: 0, maxRainouts: 0 });
  return {
    ...initialState,
    worldId: 'lineup-test',
    loading: false,
    screen: 'season',
    teams,
    playerTeam: 'giants',
    viewTeam: 'giants',
    lineup: recommendedLineup(teams.giants),
    season: { year: 2026, schedule },
    standings: calcStandings(schedule),
  };
}

test('skipping a week plays the saved lineup, and the saved lineup stays playable', () => {
  configureRandom(mulberry32(3), () => Date.UTC(2026, 0, 1));
  try {
    const state = openingState();
    // The manager benches the AI's cleanup hitter for a bench player at the same spot.
    const lineup = [...state.lineup];
    const benched = lineup[3]!;
    const position = benched._assignedPos ?? benched.pos;
    const starterIds = new Set(lineup.map((player) => player.id));
    const bench = state.teams!.giants.fielders.find(
      (player) =>
        !starterIds.has(player.id) &&
        player.activeRoster !== false &&
        (player.injuryDays ?? 0) <= 0 &&
        (player.pos === position || player.positions?.some((entry) => entry.pos === position)),
    )!;
    lineup[3] = { ...bench, _assignedPos: benched._assignedPos, _isDH: benched._isDH };
    const after = applySkip({ ...state, lineup }, 'week');
    const pa = (id: string) => {
      const line = after.accumulated[id];
      return line?.type === 'bat' ? line.pa : 0;
    };
    assert.ok(pa(bench.id) > 0, 'the chosen player batted');
    assert.equal(pa(benched.id), 0, 'the benched starter did not start');
    assert.equal(after.lineup.length, 9);
    assert.ok(
      after.lineup.every((player) => {
        const current = after.teams!.giants.fielders.find((p) => p.id === player.id);
        return current && (current.injuryDays ?? 0) <= 0 && current.activeRoster !== false;
      }),
    );
  } finally {
    resetRandom();
  }
});

test('a new season drops last year pitching plan', () => {
  configureRandom(mulberry32(4), () => Date.UTC(2026, 0, 1));
  try {
    const state = openingState();
    const starter = state.teams!.giants.pitchers.find((player) => player.role === '先発')!;
    const next = advanceOneYear({
      ...state,
      pitcherPlan: { rotationOrder: [starter.id], closerPriority: [] },
    });
    assert.deepEqual(next.pitcherPlan.rotationOrder, []);
    assert.equal(next.lineup.length, 9);
  } finally {
    resetRandom();
  }
});
