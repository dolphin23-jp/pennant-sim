/** Full scheduled seasons, real subsystem emissions, and v4 round trips at 30/100 years. */
import assert from 'node:assert/strict';
import {
  calcStandings,
  configureRandom,
  generateSchedule,
  initTeams,
  resetRandom,
  runAutomatedOffseason,
  skipGames,
  simCpuUntilNext,
  cpuAutoTradeBetweenTeams,
  type AccumulatedStats,
  type PlayerStats,
} from '../src/engine';
import { seasonReviewEvents } from '../src/engine/narrativeEvents';
import {
  appendNarrativeEvents,
  articleFromFutureEvent,
  type NarrativeEvent,
} from '../src/narrative';
import {
  createEmptyRotations,
  exportSaveData,
  importSaveData,
  loadGameFromSlot,
  migrateSaveData,
  saveGameToSlot,
  SAVE_KEY,
  type StorageBackend,
} from '../src/state/storage';

let seed = 730100;
configureRandom(
  () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  },
  () => 1700000000000,
);
const values = new Map<string, string>();
const writes: string[] = [];
const backend: StorageBackend = {
  async get(k) {
    return values.get(k) ?? null;
  },
  async set(k, v) {
    // Model tombstones without retaining obsolete string allocations in this audit.
    if (v) values.set(k, v);
    else values.delete(k);
    writes.push(k);
  },
};
function sumStats(first: AccumulatedStats, second: AccumulatedStats): AccumulatedStats {
  const result = structuredClone(first);
  for (const [id, line] of Object.entries(second)) {
    if (!result[id]) {
      result[id] = line;
      continue;
    }
    const target = result[id] as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(line))
      if (typeof value === 'number') target[key] = Number(target[key] ?? 0) + value;
    result[id] = target as unknown as PlayerStats;
  }
  return result;
}
try {
  let save = migrateSaveData({
    teams: initTeams(),
    playerTeam: 'giants',
    season: { year: 2026, schedule: [] },
  })!;
  let total = 0;
  let previousChunks: Record<string, { key: string }> = {};
  const counts: Record<string, number> = {};
  for (let elapsed = 1; elapsed <= 100; elapsed++) {
    const year = 2025 + elapsed;
    const schedule = generateSchedule(year);
    const played = skipGames(schedule, save.teams, createEmptyRotations(), 'giants', 'season');
    const rest = simCpuUntilNext(
      played.sched,
      save.teams,
      played.rotN,
      'giants',
      played.leagueDistStats,
      played.leagueDistStats,
    );
    assert.ok(rest.sched.every((g) => g.played));
    const events: NarrativeEvent[] = [...played.narrativeEvents, ...rest.narrativeEvents];
    const traded = cpuAutoTradeBetweenTeams(save.teams, 'giants', 8, {
      year,
      date: `${year}年オフ`,
      scope: 'audit',
      emit: (e) => events.push(e),
    });
    const offseason = runAutomatedOffseason(traded, {
      year,
      seasonStats: sumStats(played.leagueDistStats, rest.leagueDistStats),
    });
    events.push(
      ...offseason.narrativeEvents,
      ...seasonReviewEvents(year, calcStandings(rest.sched)),
    );
    assert.equal(events.filter((e) => e.type === 'draft').length, 72);
    assert.equal(events.filter((e) => e.type === 'seasonReview').length, 12);
    assert.ok(
      events.length >= 84 && events.length < 4000,
      `year ${year}: abnormal count ${events.length}`,
    );
    assert.equal(
      new Set(events.map((e) => e.id)).size,
      events.length,
      `duplicate events in ${year}`,
    );
    for (const event of events) counts[event.type] = (counts[event.type] ?? 0) + 1;
    const ledger = appendNarrativeEvents(save.narrativeEvents!, events);
    assert.equal(
      appendNarrativeEvents(ledger, events),
      ledger,
      'replaying a completed batch is a no-op',
    );
    total += events.length;
    assert.equal(
      Object.values(ledger).reduce((n, entries) => n + entries.length, 0),
      total,
    );
    save = {
      ...save,
      teams: offseason.teams,
      season: { year: year + 1, schedule: [] },
      narrativeEvents: ledger,
    };
    writes.length = 0;
    assert.equal(await saveGameToSlot(save, 1, backend), true);
    const root = JSON.parse(values.get(SAVE_KEY(1))!);
    assert.deepEqual(root.current.narrativeEvents, {});
    assert.equal(Object.keys(root.archive.seasons).length, elapsed);
    for (const [oldYear, ref] of Object.entries(previousChunks)) {
      assert.equal(root.archive.seasons[oldYear].key, ref.key);
      assert.ok(!writes.includes(ref.key), `rewrote ${oldYear} during ${year}`);
    }
    previousChunks = root.archive.seasons;
    if (elapsed === 30 || elapsed === 100) {
      const loaded = (await loadGameFromSlot(1, backend))!;
      assert.deepEqual(loaded.narrativeEvents, ledger);
      assert.deepEqual(importSaveData(exportSaveData(loaded))!.narrativeEvents, ledger);
      const first = ledger['2026'][0];
      assert.deepEqual(
        articleFromFutureEvent(loaded.narrativeEvents!['2026'][0]),
        articleFromFutureEvent(first),
      );
      const bytes = Object.values(ledger).reduce(
        (n, entries) => n + Buffer.byteLength(JSON.stringify(entries)),
        0,
      );
      console.log(
        JSON.stringify({
          checkpointYears: elapsed,
          totalEvents: total,
          counts,
          eventBytes: bytes,
          rootBytes: Buffer.byteLength(values.get(SAVE_KEY(1))!),
          annualEvents: events.length,
        }),
      );
      save = loaded;
    } else if (elapsed % 10 === 0) console.log(`Completed ${elapsed} years; ${total} events`);
  }
  assert.ok(
    counts.injury > 0 && counts.development > 0 && counts.career > 0 && counts.transaction > 0,
  );
} finally {
  resetRandom();
}
