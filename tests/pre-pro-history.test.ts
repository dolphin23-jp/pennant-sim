import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyDraftPicks,
  configureRandom,
  createFictionalLeagueHistory,
  createPreProHistory,
  generateDraftProspects,
  initTeams,
  random,
  resetRandom,
  type Player,
} from '../src/engine';
import { generateDraftProspects as generateDraftProspectsBase } from '../src/engine/draft';
import { createFictionalLeagueHistory as createFictionalLeagueHistoryBase } from '../src/engine/leagueHistory';

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

function withoutPrePro(player: Player): Record<string, unknown> {
  const copy = structuredClone(player) as Record<string, unknown>;
  delete copy.preProHistory;
  return copy;
}

test('draft pre-pro enrichment consumes no simulation RNG and changes no prospect ratings', () => {
  configureRandom(mulberry32(20260907), () => 1_700_000_000_000);
  const base = generateDraftProspectsBase();
  const baseNextRandom = random();

  configureRandom(mulberry32(20260907), () => 1_700_000_000_000);
  const enriched = generateDraftProspects();
  const enrichedNextRandom = random();

  assert.deepEqual(enriched.map(withoutPrePro), base.map(withoutPrePro));
  assert.equal(enrichedNextRandom, baseNextRandom);
  assert.ok(enriched.every((player) => player.preProHistory?.source === 'generated-v1'));
  assert.ok(
    enriched.every(
      (player) =>
        player.preProHistory?.origin === player.draftOrigin &&
        player.preProHistory.entryAge === player.age &&
        player.preProHistory.entryYear === 0,
    ),
  );
  resetRandom();
});

test('signing fixes the rookie season without changing the prospect amateur achievements', () => {
  configureRandom(mulberry32(20260908), () => 1_700_000_000_000);
  const teams = initTeams();
  const prospect = generateDraftProspects()[0];
  assert.ok(prospect.preProHistory);
  const beforeHighlights = structuredClone(prospect.preProHistory.highlights);

  const signedTeams = applyDraftPicks(
    teams,
    [{ ...prospect, teamKey: 'giants', round: 1 }],
    { year: 2026, date: '2026年オフ', emit: () => {} },
  );
  const signed = [...signedTeams.giants.fielders, ...signedTeams.giants.pitchers].find(
    (player) => player.id === prospect.id,
  );
  assert.ok(signed?.preProHistory);
  assert.equal(signed.preProHistory.entryYear, 2027);
  assert.deepEqual(signed.preProHistory.highlights, beforeHighlights);
  resetRandom();
});

test('fictional league history enrichment preserves historical facts while fixing active pre-pro history', () => {
  configureRandom(mulberry32(20260909), () => 1_700_000_000_000);
  const sourceTeams = initTeams();
  const base = createFictionalLeagueHistoryBase(sourceTeams, {
    endYear: 2025,
    seasons: 20,
    seed: 481516,
    legendsPerTeam: 2,
  });
  const enriched = createFictionalLeagueHistory(sourceTeams, {
    endYear: 2025,
    seasons: 20,
    seed: 481516,
    legendsPerTeam: 2,
  });

  assert.deepEqual(enriched.yearlyStats, base.yearlyStats);
  assert.deepEqual(enriched.careerStats, base.careerStats);
  assert.deepEqual(enriched.championHistory, base.championHistory);

  const active = Object.values(enriched.teams).flatMap((team) => [
    ...team.fielders,
    ...team.pitchers,
  ]);
  const firstRecord = new Map<string, { year: number; age: number }>();
  for (const records of Object.values(enriched.yearlyStats)) {
    for (const record of records) {
      const current = firstRecord.get(record.playerId);
      if (!current || record.year < current.year) {
        firstRecord.set(record.playerId, { year: record.year, age: record.age });
      }
    }
  }
  for (const player of active) {
    const record = firstRecord.get(player.id);
    assert.ok(player.preProHistory);
    assert.equal(player.preProHistory.entryYear, record?.year ?? 2026);
    assert.equal(player.preProHistory.entryAge, record?.age ?? player.age);
    assert.equal(player.draftOrigin, player.preProHistory.origin);
  }
  resetRandom();
});

test('same player and origin keep the same amateur achievements across entry-year metadata changes', () => {
  configureRandom(mulberry32(20260910), () => 1_700_000_000_000);
  const player = generateDraftProspectsBase()[0];
  const first = createPreProHistory(player, {
    entryYear: 2027,
    origin: player.draftOrigin,
    entryAge: player.age,
  });
  const laterMetadata = createPreProHistory(player, {
    entryYear: 2030,
    origin: player.draftOrigin,
    entryAge: player.age,
  });
  assert.equal(first.profileTier, laterMetadata.profileTier);
  assert.deepEqual(first.highlights, laterMetadata.highlights);
  resetRandom();
});
