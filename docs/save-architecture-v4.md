# Save Architecture v4

Save Architecture v4 separates the small, mutable **current state** from the long-lived **world archive**. The goal is that ordinary saves remain bounded by the current season and current roster even when a save world has accumulated decades or centuries of history.

## Storage model

Each save slot keeps one small root envelope at the existing slot key. The root contains:

- `storageVersion: 4`
- a stable `worldId`
- the current mutable game state
- an archive index containing content-addressed chunk references
- the last save timestamp

Historical payloads are stored outside the root as separate IndexedDB key/value records.

### Season chunks

Season-scoped history is grouped by year:

- year-by-year player records
- champion history
- season awards
- achievements and milestones
- game summaries
- game box scores

Only a changed season produces a new archive revision. Old completed seasons keep the same immutable chunk and are not rewritten by ordinary saves in later years.

Narrative Engine data should follow the same rule. Articles, transactions, career events, draft reports, and season reviews that are frozen at a point in time should be added to the appropriate year-scoped archive schema rather than to the root current state.

### Retired-player chunks

Retired players are distributed across 64 deterministic buckets. Each entry stores:

- the retired `Player` snapshot
- its original display order
- retired career totals
- league career totals

Only the bucket containing a changed retired-player entry needs a new revision. Active-player career totals remain in current state.

## Commit protocol

Archive revisions are content-addressed.

1. Serialize each changed archive chunk.
2. Write the new immutable chunk under a key containing its revision.
3. Write the small root envelope that references the new revision. This is the commit point.
4. After the root succeeds, tombstone any superseded revision.

If step 2 succeeds but step 3 fails, the old root still references the old intact archive. The new chunk is merely unreachable. Cleanup failures after step 3 do not invalidate the save.

## Compatibility

- Existing v3 monolithic slot saves remain readable.
- A legacy single-save key is migrated into slot 1 using v4 storage.
- A v3 slot converts to v4 the next time it is saved.
- User export/import still operates on a fully rehydrated portable JSON snapshot, so old exported saves remain importable.

## Corruption behavior

Archive references include a content revision. Loading verifies that:

- the referenced chunk exists,
- its serialized content matches the referenced revision,
- the chunk schema and expected year/bucket match.

Missing or modified chunks are reported as corruption rather than silently dropping historical data.

## Capacity and persistence

IndexedDB remains the primary browser backend. On normal browser-backed saves the app makes a best-effort `navigator.storage.persist()` request so the browser is less likely to evict a long-running world. This does not create literal unlimited storage: available capacity still depends on the browser and device.

The architecture is designed so that storage growth is append-oriented and normal save cost does not scale with the total age of the world. Future work can add storage-usage diagnostics, archive export packaging/compression, or optional pruning of very old play-by-play data without changing the current-state contract.

## Narrative ledger extension

The optional `narrativeEvents` field on a season chunk stores that year's factual
events. The active year's ledger also lives in its season chunk, receiving new
content revisions as events arrive; completed years reuse their immutable chunks.
The root's `current.narrativeEvents` is empty. Fully rehydrated in-memory state and
portable JSON exports use a year-keyed map, matching other v4 archive projections.

This is an additive schema-1 / storage-v4 extension. A missing field in pre-ledger
v3 saves or v4 chunks initializes an empty ledger, without fabricated backfill.
Empty old chunks omit the new field so their existing content revision is reused.
Event shape/year validation runs after the chunk revision check. Invalid present
facts fail the load/import rather than silently dropping history. Dedupe and
conflict detection run on save and rehydration. The archive-first, root-last commit
protocol and failed-save recovery are unchanged.

As with other existing v4 fields, loading rehydrates the world and saving currently
validates/serializes its history to compare content revisions. Old chunks are not
rewritten, but CPU serialization and in-memory history still grow with world age;
this extension does not introduce lazy loading or dirty-year tracking.

## Optional generated article sidecars

`GameSaveData.worldId` carries the existing envelope identity through runtime and
portable exports. Legacy v4 loads recover it from the envelope; a newly started
world uses `crypto.randomUUID()` independently of the simulation RNG. Legacy
portable saves receive their identity when opened in the game.

`narrativeArticles` is a year-keyed portable/runtime projection. Its snapshots live
in separate `archive.articleYears` chunks, leaving factual season chunk revisions
unchanged when prose arrives. The current root holds an empty projection. Absent
fields migrate to empty, and malformed/missing prose is discarded independently
of the strict canonical-fact integrity checks. Each displayed snapshot must also
pass current packet/hash/prose validation. Article writes are best effort; a failed
optional write retains the previous article ref and never blocks the factual save.
Per-slot save operations are serialized to avoid late prose completion overwriting
newer game-state commits. Explicit clear includes article sidecars.
