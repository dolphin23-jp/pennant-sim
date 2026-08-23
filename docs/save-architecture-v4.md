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
