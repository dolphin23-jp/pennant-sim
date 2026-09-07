# Canonical Pre-Pro History

Pre-Pro History is canonical player data. It exists before any Narrative prose and may be cited by later AI articles, but AI output never creates or edits it.

The v1 flow is:

```
player generation / fictional history
  -> deterministic PreProHistory
  -> save as part of Player
  -> editorial facts / Narrative packets
  -> optional AI prose
```

## Scope

`PreProHistory` records:

- origin: high school, university, or corporate baseball;
- professional entry year and entry age;
- a deterministic profile tier used only to select plausible amateur facts;
- structured highlights such as national-tournament appearances, university awards/national-team selection, corporate-tournament appearances, or high-school career home runs.

These are fictional-world canonical facts, not real-world claims and not LLM inventions.

## Determinism and simulation isolation

Pre-Pro generation uses its own hash-derived local PRNG. It never calls the simulation RNG. The seed is based on stable player identity and origin, and deliberately excludes professional entry year. Therefore:

- adding Pre-Pro data does not change player abilities, draft order, draft lotteries, schedules, game simulation, or any later global RNG draw;
- an unsigned draft prospect and the same player after signing retain exactly the same amateur achievements;
- signing only fixes `entryYear` from `0` to the actual rookie season;
- fictional-history enrichment happens only after the existing 20-year history has been generated, so historical stats and championship records remain unchanged.

Regression tests compare the original generators with the enriched public generators and also compare the next global RNG value.

## Draft prospects

The existing draft generator remains the source of truth for origin, age, ability and potential. The enrichment layer uses those outputs to create a compatible amateur history. It does not modify the existing `note` field or prospect ranking semantics.

During the draft, `entryYear` is `0` because the player has not signed. `applyDraftPicks` fixes it to `context.year + 1`, matching the following rookie season.

## Existing active players

For a new game, `createFictionalLeagueHistory()` first generates the existing twenty-year fictional history exactly as before. The enrichment layer then finds each player's earliest generated `PlayerSeasonRecord` and uses that year/age as professional entry metadata. `draftOrigin` is filled from that entry age only when it was previously absent.

This is intentionally downstream of the current history generator. It does not attempt to solve career-curve fidelity or regenerate historical ability peaks.

## Narrative use

The next consumer should convert `PreProHistory` into explicit canonical Fact Packet claims, then let analytical prose compare those facts with later career outcomes. Examples include:

- a draft profile explaining why a national-level amateur is highly regarded;
- a veteran profile contrasting a modest amateur record with a late-blooming career;
- a retirement retrospective comparing what was known before the draft with the player's eventual career.

Historical Narrative Artifacts remain a separate category: past AI prose can later be quoted as what was written at the time, but it never becomes Pre-Pro canonical truth.
